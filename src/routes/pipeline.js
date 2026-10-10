/**
 * src/routes/pipeline.js — Autonomous Multi-Board Pipeline & Evaluation Engine
 * Pure standalone multi-board search, freshness & geo filtering, AI scoring, and persistence.
 * Zero external Telegram or n8n dependencies.
 */

const express = require('express');
const router = express.Router();
const jobsDb = require('../../scripts/core/jobs-db');
const settingsHelper = require('../../scripts/core/settings-helper');
const { fetchAllJobs } = require('../../scripts/engine/fetch-all-boards');
const {
  normalizeJob,
  runFreshnessFilter,
  runDedupFilter,
  runGeoFilter,
  computeHeuristicScore,
  runParseScore,
} = require('../../scripts/engine/node-logic');
const { callLLMProvider, buildDynamicScoringPrompt } = require('../../scripts/engine/llm-provider');
const { getMasterProfile } = require('./profile');

/**
 * Executes a full multi-board pipeline scan with optional overrides.
 * Shared by manual API triggers and the autonomous cron scheduler.
 */
async function executePipelineScan(overrides = {}) {
  const profile = getMasterProfile();
  const settings = settingsHelper.getSettings();

  // Target titles: solely from overrides or settings (fallback to profile.role only if settings empty)
  const targetTitles = (overrides.targetTitles && overrides.targetTitles.length > 0)
    ? overrides.targetTitles
    : ((settings.target_titles && settings.target_titles.length > 0)
      ? settings.target_titles
      : ((settings.target_roles && settings.target_roles.length > 0)
        ? settings.target_roles
        : (profile.role ? [profile.role] : ['Target Role'])));

  // Target locations: solely from overrides or settings (fallback to profile resident location only if settings empty)
  const targetLocations = (overrides.targetLocations && overrides.targetLocations.length > 0)
    ? overrides.targetLocations
    : ((settings.locations && settings.locations.length > 0)
      ? settings.locations
      : ((settings.target_locations && settings.target_locations.length > 0)
        ? settings.target_locations
        : (profile.contact?.location ? [profile.contact.location] : ['Remote'])));

  const minThreshold = overrides.minScore !== undefined
    ? Number(overrides.minScore)
    : (settings.score_threshold || 60);

  const freshnessHours = overrides.freshnessHours !== undefined
    ? Number(overrides.freshnessHours)
    : (settings.freshness_hours !== undefined ? settings.freshness_hours : 24);

  const activeScope = overrides.countryScope || settings.country_scope || 'AUTO';
  const activeWorkType = overrides.work_type || settings.work_type || profile.work_type || 'Open to All';

  console.log(`[Pipeline Scan] Triggered (source: ${overrides.source || 'api'}) with roles: ${targetTitles.join(', ')} | Locs: ${targetLocations.join(', ')} | Scope: ${activeScope} | Threshold: ${minThreshold}+`);

  if (targetTitles[0]) {
    process.env.ADZUNA_SEARCH_ROLE = targetTitles[0];
  }
  if (targetLocations[0]) {
    process.env.ADZUNA_SEARCH_LOCATION = targetLocations[0];
  }

  // Step 1: Ingest from job boards with dynamic search payload
  let rawFetchedJobs = [];
  if (Array.isArray(overrides.injectedRawJobs)) {
    rawFetchedJobs = overrides.injectedRawJobs;
  } else {
    try {
      rawFetchedJobs = await fetchAllJobs({
        targetTitles,
        targetLocations,
        countryScope: activeScope,
        candidateWorkType: activeWorkType,
        boardsEnabled: settings.boards_enabled,
        freshnessHours,
        commuteRadiusKm: settings.commute_radius_km
      });
    } catch (fetchErr) {
      console.warn('[Pipeline] Fetch note:', fetchErr.message);
    }
  }

  const allRawItems = rawFetchedJobs.map(j => normalizeJob(j, j.source || 'unknown')).filter(Boolean);

  // Step 2: Freshness & Geo Filters
  let filteredItems = runFreshnessFilter(allRawItems.map(j => ({ json: j })), freshnessHours);
  filteredItems = runGeoFilter(filteredItems, { ...profile, target_titles: targetTitles, locations: targetLocations, country_scope: activeScope, work_type: activeWorkType });
  const freshItems = filteredItems.map(i => i.json);

  // Step 3: Deduplication filter (against seen_jobs, pending_jobs, applied_jobs, rejected_jobs)
  const existingPendingIds = new Set((jobsDb.getPendingJobs(500) || []).map(j => String(j.id || j.job_id || '')));
  const existingAppliedIds = new Set((jobsDb.getAppliedJobs(500) || []).map(j => String(j.id || j.job_id || '')));
  const existingRejectedIds = new Set((jobsDb.getRejectedJobs(500) || []).map(j => String(j.id || j.job_id || '')));

  const unSeenJobs = freshItems.filter(job => {
    const id = job.id ? String(job.id) : null;
    const rawUrl = String(job.redirect_url || job.job_url || '');
    const cleanUrl = rawUrl.split('?')[0].replace(/\/+$/, '').trim().toLowerCase();
    const compClean = (job.company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const titClean = (job.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const sig = compClean && titClean ? `comp_${compClean}_tit_${titClean}` : null;

    if (id && (jobsDb.isJobSeen(id) || existingPendingIds.has(id) || existingAppliedIds.has(id) || existingRejectedIds.has(id))) return false;
    if (cleanUrl && cleanUrl.length > 15 && !cleanUrl.includes('google.com/search') && jobsDb.isJobSeen(cleanUrl)) return false;
    if (sig && jobsDb.isJobSeen(sig)) return false;
    return true;
  });

  // Step 4: High-Performance Uncapped Concurrent Scoring
  const jobsToScore = unSeenJobs;
  const scoredJobs = new Array(jobsToScore.length);
  const newlySeenIds = [];

  for (const job of jobsToScore) {
    if (job.id) newlySeenIds.push(String(job.id));
    const rawUrl = String(job.redirect_url || job.job_url || '');
    const cleanUrl = rawUrl.split('?')[0].replace(/\/+$/, '').trim().toLowerCase();
    if (cleanUrl && cleanUrl.length > 15 && !cleanUrl.includes('google.com/search')) newlySeenIds.push(cleanUrl);
    const compClean = (job.company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const titClean = (job.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (compClean && titClean) newlySeenIds.push(`comp_${compClean}_tit_${titClean}`);
  }

  const SCORING_CONCURRENCY = 8;
  let nextScoringIdx = 0;

  async function scoringWorker() {
    while (true) {
      const idx = nextScoringIdx++;
      if (idx >= jobsToScore.length) return;
      const job = jobsToScore[idx];

      let scoredItem = null;
      if (!overrides.skipLLM) {
        try {
          const prompt = buildDynamicScoringPrompt(
            { ...profile, locations: targetLocations, target_titles: targetTitles, country_scope: activeScope, commute_radius_km: settings.commute_radius_km },
            job.title,
            job.description
          );
          // 4500ms timeout per LLM request with automatic fallback to heuristic scoring
          const llmPromise = callLLMProvider({ prompt });
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('LLM scoring timeout')), 4500));
          const llmRes = await Promise.race([llmPromise, timeoutPromise]);
          if (llmRes && llmRes.success) {
            job.rawText = llmRes.rawText;
            scoredItem = runParseScore(
              { json: { ...job } },
              { ...profile, locations: targetLocations, target_titles: targetTitles, country_scope: activeScope },
              settings
            ).json;
          }
        } catch (_) {}
      }

      if (!scoredItem || typeof scoredItem.score !== 'number') {
        scoredItem = computeHeuristicScore(
          job,
          { ...profile, locations: targetLocations, target_titles: targetTitles, country_scope: activeScope, work_type: activeWorkType },
          settings
        );
      }

      scoredJobs[idx] = {
        ...job,
        ...scoredItem,
        id: job.id || scoredItem.id,
        title: (job.title || scoredItem.title || 'Target Role').trim(),
        company: (job.company || scoredItem.company || 'Direct Employer').trim(),
        location: (job.location || scoredItem.location || 'Remote / Hybrid').trim(),
        source: job.source || scoredItem.source || 'Direct',
        match_score: scoredItem.score,
        score: scoredItem.score,
        job_url: job.job_url || job.redirect_url || scoredItem.job_url || '',
        redirect_url: job.redirect_url || job.job_url || scoredItem.redirect_url || '',
        why_this_fits: scoredItem.why_this_fits || scoredItem.reasoning || 'Profile alignment verified'
      };
    }
  }

  const activeWorkerCount = Math.min(SCORING_CONCURRENCY, Math.max(1, jobsToScore.length));
  await Promise.all(Array.from({ length: activeWorkerCount }, scoringWorker));

  // Step 5: Persist qualified to pending, rejected to rejected based on user score_threshold
  const qualified = scoredJobs.filter(j => (j.score || 0) >= minThreshold && j.should_apply !== false);
  const rejected = scoredJobs.filter(j => (j.score || 0) < minThreshold || j.should_apply === false);

  jobsDb.markJobsSeen(newlySeenIds);
  for (const q of qualified) jobsDb.savePendingJob(q);
  for (const r of rejected) jobsDb.saveRejectedJob(r);

  return {
    success: true,
    stats: {
      totalFetched: allRawItems.length,
      freshCount: freshItems.length,
      unseenCount: unSeenJobs.length,
      scoredCount: scoredJobs.length,
      qualifiedCount: qualified.length,
      rejectedCount: rejected.length
    },
    qualifiedJobs: qualified,
    allScored: scoredJobs
  };
}

// POST /api/pipeline/run
router.post('/run', async (req, res) => {
  try {
    const overrides = req.body || {};
    const result = await executePipelineScan(overrides);
    res.json(result);
  } catch (err) {
    console.error('Pipeline error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pipeline/evaluate-custom (Paste Any Job Posting to Score)
router.post('/evaluate-custom', async (req, res) => {
  try {
    const { title, company, location, description, url, source } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and Job Description are required' });
    }

    const profile = getMasterProfile();
    const trimmedTitle = title.trim();
    const trimmedCompany = (company || 'Employer').trim();
    const providedUrl = (url || '').trim();
    const canonicalUrl = providedUrl || `https://www.google.com/search?q=${encodeURIComponent(trimmedTitle + ' ' + trimmedCompany + ' job')}`;

    const rawJob = {
      id: `manual_${Date.now()}`,
      title: trimmedTitle,
      company: trimmedCompany,
      location: (location || 'Remote').trim(),
      description: description.trim(),
      job_url: canonicalUrl,
      redirect_url: canonicalUrl,
      apply_url: canonicalUrl,
      source: source || 'Manual Entry',
      created: new Date().toISOString()
    };

    let scoredItem = null;
    try {
      const prompt = buildDynamicScoringPrompt(profile, rawJob.title, rawJob.description);
      const llmRes = await callLLMProvider({ prompt });
      if (llmRes.success) {
        rawJob.rawText = llmRes.rawText;
        scoredItem = runParseScore({ json: { ...rawJob } }, profile).json;
      }
    } catch (_) {}

    if (!scoredItem || typeof scoredItem.score !== 'number') {
      scoredItem = computeHeuristicScore(rawJob, profile);
    }

    const finalJob = {
      ...rawJob,
      ...scoredItem,
      id: rawJob.id,
      title: rawJob.title,
      company: rawJob.company,
      location: rawJob.location,
      why_this_fits: scoredItem.why_this_fits || scoredItem.reasoning || 'Evaluated against candidate master profile'
    };

    // Save to pending if qualified
    const settings = settingsHelper.getSettings();
    if ((finalJob.score || 0) >= (settings.score_threshold || 60)) {
      jobsDb.savePendingJob(finalJob);
    }

    res.json({ success: true, evaluatedJob: finalJob });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, executePipelineScan };
