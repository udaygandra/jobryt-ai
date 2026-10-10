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

  const targetTitles = (overrides.targetTitles && overrides.targetTitles.length > 0)
    ? overrides.targetTitles
    : (profile.target_titles || ['Target Role']);

  const targetLocations = (overrides.targetLocations && overrides.targetLocations.length > 0)
    ? overrides.targetLocations
    : (profile.locations || ['Remote']);

  const minThreshold = overrides.minScore !== undefined
    ? Number(overrides.minScore)
    : (settings.score_threshold || 60);

  const freshnessHours = overrides.freshnessHours !== undefined
    ? Number(overrides.freshnessHours)
    : (settings.freshness_hours !== undefined ? settings.freshness_hours : 24);

  console.log(`[Pipeline Scan] Triggered (source: ${overrides.source || 'api'}) with roles: ${targetTitles.join(', ')} | Locs: ${targetLocations.join(', ')} | Threshold: ${minThreshold}+`);

  if (overrides.targetTitles) {
    process.env.ADZUNA_SEARCH_ROLE = targetTitles[0];
  }
  if (overrides.targetLocations) {
    process.env.ADZUNA_SEARCH_LOCATION = targetLocations[0];
  }

  // Step 1: Ingest from job boards
  let rawFetchedJobs = [];
  try {
    rawFetchedJobs = await fetchAllJobs();
  } catch (fetchErr) {
    console.warn('[Pipeline] Fetch note:', fetchErr.message);
  }

  const allRawItems = rawFetchedJobs.map(j => normalizeJob(j, j.source || 'unknown')).filter(Boolean);

  // Step 2: Freshness & Geo Filters
  const activeScope = overrides.countryScope || settings.country_scope || 'AUTO';
  let filteredItems = runFreshnessFilter(allRawItems.map(j => ({ json: j })), freshnessHours);
  filteredItems = runGeoFilter(filteredItems, { ...profile, target_titles: targetTitles, locations: targetLocations, country_scope: activeScope });
  const freshItems = filteredItems.map(i => i.json);

  // Step 3: Deduplication filter
  const unSeenJobs = freshItems.filter(job => {
    const id = job.id ? String(job.id) : null;
    const url = job.redirect_url || job.job_url || null;
    const compClean = (job.company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const titClean = (job.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const sig = compClean && titClean ? `comp_${compClean}_tit_${titClean}` : null;
    if (id && jobsDb.isJobSeen(id)) return false;
    if (url && jobsDb.isJobSeen(url)) return false;
    if (sig && jobsDb.isJobSeen(sig)) return false;
    return true;
  });

  // Step 4: Scoring (cap at 30 for snappy web response)
  const MAX_TO_SCORE = Math.min(unSeenJobs.length, 30);
  const jobsToScore = unSeenJobs.slice(0, MAX_TO_SCORE);
  const scoredJobs = [];
  const newlySeenIds = [];

  for (const job of jobsToScore) {
    if (job.id) newlySeenIds.push(String(job.id));
    if (job.job_url) newlySeenIds.push(String(job.job_url));
    if (job.redirect_url) newlySeenIds.push(String(job.redirect_url));

    let scoredItem = null;
    try {
      const prompt = buildDynamicScoringPrompt(profile, job.title, job.description);
      const llmRes = await callLLMProvider({ prompt });
      if (llmRes.success) {
        job.rawText = llmRes.rawText;
        scoredItem = runParseScore({ json: { ...job } }, profile).json;
      }
    } catch (_) {}

    if (!scoredItem || typeof scoredItem.score !== 'number') {
      scoredItem = computeHeuristicScore(job, profile);
    }

    const finalJob = {
      ...job,
      ...scoredItem,
      id: job.id || scoredItem.id,
      title: (job.title || scoredItem.title || 'Target Role').trim(),
      company: (job.company || scoredItem.company || 'Direct Employer').trim(),
      location: (job.location || scoredItem.location || 'Remote / Hybrid').trim(),
      source: job.source || scoredItem.source || 'Direct',
      job_url: job.job_url || job.redirect_url || scoredItem.job_url || '',
      redirect_url: job.redirect_url || job.job_url || scoredItem.redirect_url || '',
      why_this_fits: scoredItem.why_this_fits || scoredItem.reasoning || 'Profile alignment verified'
    };

    scoredJobs.push(finalJob);
  }

  // Step 5: Persist qualified to pending, rejected to rejected
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
