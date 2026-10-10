/**
 * src/routes/pipeline.js — Autonomous Multi-Board Pipeline & Evaluation Engine
 * Pure standalone multi-board search, freshness & geo filtering, AI scoring, and persistence.
 * Zero external Telegram or n8n dependencies.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
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

let activeScanState = null;

function getLastScanResult() {
  const filePath = path.join(process.cwd(), 'data', 'tracking', 'last_scan_result.json');
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (_) {}
  return null;
}

function saveLastScanResult(data) {
  const dir = path.join(process.cwd(), 'data', 'tracking');
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const payload = {
      scanId: data.scanId,
      status: data.status,
      step: data.step,
      startedAt: data.startedAt,
      completedAt: data.completedAt || new Date().toISOString(),
      durationMs: data.durationMs || (data.startedAt ? Date.now() - new Date(data.startedAt).getTime() : 0),
      boardBreakdown: data.boardBreakdown || {},
      stats: data.stats || {},
      logs: (data.logs || []).slice(-40)
    };
    fs.writeFileSync(path.join(dir, 'last_scan_result.json'), JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Pipeline] Could not save last scan result:', err.message);
  }
}

/**
 * Executes a full multi-board pipeline scan with optional overrides.
 * Shared by manual API triggers and the autonomous cron scheduler.
 */
async function executePipelineScan(overrides = {}) {
  // Concurrency Mutex: Prevent duplicate overlapping scans to protect CPU, network & LLM tokens
  if (activeScanState && activeScanState.status === 'running') {
    return {
      success: false,
      status: 'already_running',
      message: 'A pipeline scan is already in progress',
      scanId: activeScanState.scanId,
      startedAt: activeScanState.startedAt,
      durationMs: Date.now() - new Date(activeScanState.startedAt).getTime(),
      stats: activeScanState.stats
    };
  }

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

  const scanId = overrides.scanId || `scan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  activeScanState = {
    scanId,
    status: 'running',
    step: 'fetching',
    progress: { current: 0, total: 0, message: 'Initializing multi-board sweep...' },
    startedAt: new Date().toISOString(),
    completedAt: null,
    durationMs: 0,
    logs: [],
    boardBreakdown: {},
    stats: {
      totalFetched: 0,
      freshCount: 0,
      unseenCount: 0,
      scoredCount: 0,
      qualifiedCount: 0,
      rejectedCount: 0
    },
    abortController: new AbortController()
  };

  const currentScan = activeScanState;
  const signal = currentScan.abortController.signal;

  function addLog(message, level = 'info') {
    const entry = { timestamp: new Date().toISOString(), level, message };
    currentScan.logs.push(entry);
    if (currentScan.logs.length > 120) currentScan.logs.shift();
    console.log(`[Pipeline ${level.toUpperCase()}] ${message}`);
  }

  addLog(`Scan triggered (source: ${overrides.source || 'api'}) with roles: ${targetTitles.join(', ')} | Locs: ${targetLocations.join(', ')} | Scope: ${activeScope} | Threshold: ${minThreshold}+`);

  if (targetTitles[0]) process.env.ADZUNA_SEARCH_ROLE = targetTitles[0];
  if (targetLocations[0]) process.env.ADZUNA_SEARCH_LOCATION = targetLocations[0];

  // Step 1: Ingest from job boards with dynamic search payload and abort signal
  let rawFetchedJobs = [];
  if (Array.isArray(overrides.injectedRawJobs)) {
    rawFetchedJobs = overrides.injectedRawJobs;
  } else {
    try {
      currentScan.progress.message = 'Fetching multi-board feeds...';
      rawFetchedJobs = await fetchAllJobs({
        targetTitles,
        targetLocations,
        countryScope: activeScope,
        candidateWorkType: activeWorkType,
        boardsEnabled: settings.boards_enabled,
        freshnessHours,
        commuteRadiusKm: settings.commute_radius_km,
        signal
      });
    } catch (fetchErr) {
      addLog(`Fetch note: ${fetchErr.message}`, 'warn');
    }
  }

  if (signal.aborted) {
    currentScan.status = 'aborted';
    currentScan.step = 'aborted';
    currentScan.completedAt = new Date().toISOString();
    currentScan.durationMs = Date.now() - new Date(currentScan.startedAt).getTime();
    addLog('Scan aborted by user during ingestion', 'warn');
    saveLastScanResult(currentScan);
    return { success: false, status: 'aborted', message: 'Scan stopped by user', scanId, stats: currentScan.stats };
  }

  const allRawItems = rawFetchedJobs.map(j => normalizeJob(j, j.source || 'unknown')).filter(Boolean);
  currentScan.stats.totalFetched = allRawItems.length;

  // Compute per-board yield breakdown
  for (const job of allRawItems) {
    const src = job.source || 'Other';
    currentScan.boardBreakdown[src] = (currentScan.boardBreakdown[src] || 0) + 1;
  }
  addLog(`Multi-board ingestion complete: ${allRawItems.length} listings examined across ${Object.keys(currentScan.boardBreakdown).length} sources.`);

  // Step 2: Freshness & Geo Filters
  currentScan.step = 'filtering';
  currentScan.progress.message = 'Applying freshness, location, and workplace mode filters...';

  let filteredItems = runFreshnessFilter(allRawItems.map(j => ({ json: j })), freshnessHours);
  filteredItems = runGeoFilter(filteredItems, { ...profile, target_titles: targetTitles, locations: targetLocations, country_scope: activeScope, work_type: activeWorkType });
  const freshItems = filteredItems.map(i => i.json);
  currentScan.stats.freshCount = freshItems.length;
  addLog(`Freshness & Geo filtering passed: ${freshItems.length} jobs fit criteria (${allRawItems.length - freshItems.length} filtered out).`);

  if (signal.aborted) {
    currentScan.status = 'aborted';
    currentScan.step = 'aborted';
    currentScan.completedAt = new Date().toISOString();
    currentScan.durationMs = Date.now() - new Date(currentScan.startedAt).getTime();
    addLog('Scan aborted by user during filtering', 'warn');
    saveLastScanResult(currentScan);
    return { success: false, status: 'aborted', message: 'Scan stopped by user', scanId, stats: currentScan.stats };
  }

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

  currentScan.stats.unseenCount = unSeenJobs.length;
  addLog(`Deduplication check passed: ${unSeenJobs.length} new listings (${freshItems.length - unSeenJobs.length} previously seen).`);

  // Step 4: High-Performance Uncapped Concurrent Scoring with abort checking
  currentScan.step = 'scoring';
  currentScan.progress.current = 0;
  currentScan.progress.total = unSeenJobs.length;
  currentScan.progress.message = `Evaluating ${unSeenJobs.length} opportunities with AI & scoring model...`;

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
      if (signal.aborted) return;
      const idx = nextScoringIdx++;
      if (idx >= jobsToScore.length) return;
      const job = jobsToScore[idx];

      let scoredItem = null;
      if (!overrides.skipLLM && !signal.aborted) {
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

      currentScan.progress.current++;
      currentScan.stats.scoredCount++;
    }
  }

  const activeWorkerCount = Math.min(SCORING_CONCURRENCY, Math.max(1, jobsToScore.length));
  await Promise.all(Array.from({ length: activeWorkerCount }, scoringWorker));

  if (signal.aborted) {
    currentScan.status = 'aborted';
    currentScan.step = 'aborted';
    currentScan.completedAt = new Date().toISOString();
    currentScan.durationMs = Date.now() - new Date(currentScan.startedAt).getTime();
    addLog('Scan aborted by user during scoring', 'warn');
    saveLastScanResult(currentScan);
    return { success: false, status: 'aborted', message: 'Scan stopped by user', scanId, stats: currentScan.stats };
  }

  // Filter out any undefined slots if aborted early
  const validScoredJobs = scoredJobs.filter(Boolean);

  // Step 5: Persist qualified to pending, rejected to rejected based on user score_threshold
  currentScan.step = 'persisting';
  const qualified = validScoredJobs.filter(j => (j.score || 0) >= minThreshold && j.should_apply !== false);
  const rejected = validScoredJobs.filter(j => (j.score || 0) < minThreshold || j.should_apply === false);

  jobsDb.markJobsSeen(newlySeenIds);
  for (const q of qualified) jobsDb.savePendingJob(q);
  for (const r of rejected) jobsDb.saveRejectedJob(r);

  currentScan.status = 'completed';
  currentScan.step = 'completed';
  currentScan.completedAt = new Date().toISOString();
  currentScan.durationMs = Date.now() - new Date(currentScan.startedAt).getTime();
  currentScan.stats.qualifiedCount = qualified.length;
  currentScan.stats.rejectedCount = rejected.length;
  addLog(`Scan finished: ${qualified.length} qualified opportunities added to approval queue! (${rejected.length} below threshold).`);

  saveLastScanResult(currentScan);

  return {
    success: true,
    scanId,
    status: 'completed',
    boardBreakdown: currentScan.boardBreakdown,
    stats: {
      totalFetched: allRawItems.length,
      freshCount: freshItems.length,
      unseenCount: unSeenJobs.length,
      scoredCount: validScoredJobs.length,
      qualifiedCount: qualified.length,
      rejectedCount: rejected.length
    },
    qualifiedJobs: qualified,
    allScored: validScoredJobs
  };
}

// POST /api/pipeline/run
router.post('/run', async (req, res) => {
  try {
    const overrides = req.body || {};
    const result = await executePipelineScan(overrides);
    if (result.status === 'already_running') {
      return res.status(409).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('Pipeline error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pipeline/stop
router.post('/stop', (req, res) => {
  try {
    if (activeScanState && activeScanState.status === 'running') {
      activeScanState.abortController.abort();
      activeScanState.status = 'aborted';
      activeScanState.step = 'aborted';
      activeScanState.completedAt = new Date().toISOString();
      activeScanState.durationMs = Date.now() - new Date(activeScanState.startedAt).getTime();
      saveLastScanResult(activeScanState);
      return res.json({
        success: true,
        message: 'Scan abort signal sent successfully',
        scanId: activeScanState.scanId,
        stats: activeScanState.stats
      });
    }
    return res.json({
      success: false,
      message: 'No active scan is currently running'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pipeline/status
router.get('/status', (req, res) => {
  try {
    if (activeScanState && activeScanState.status === 'running') {
      return res.json({
        success: true,
        isRunning: true,
        state: {
          scanId: activeScanState.scanId,
          status: activeScanState.status,
          step: activeScanState.step,
          progress: activeScanState.progress,
          startedAt: activeScanState.startedAt,
          durationMs: Date.now() - new Date(activeScanState.startedAt).getTime(),
          logs: activeScanState.logs.slice(-35),
          boardBreakdown: activeScanState.boardBreakdown,
          stats: activeScanState.stats
        }
      });
    }

    const last = getLastScanResult();
    return res.json({
      success: true,
      isRunning: false,
      state: last || {
        status: 'idle',
        step: 'idle',
        logs: [],
        boardBreakdown: {},
        stats: { totalFetched: 0, freshCount: 0, unseenCount: 0, scoredCount: 0, qualifiedCount: 0, rejectedCount: 0 }
      }
    });
  } catch (err) {
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
