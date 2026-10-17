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
  toLightweightJobDTO,
  runFreshnessFilter,
  runDedupFilter,
  runGeoFilter,
  computeHeuristicScore,
  runParseScore,
} = require('../../scripts/engine/node-logic');
const { getOptimalConcurrency, yieldEventLoop } = require('../../scripts/engine/adaptive-concurrency');
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
 * Validates whether search preferences and candidate profile baseline satisfy preconditions for scanning.
 */
function validateScanCriteria({ targetTitles, targetLocations, boardsEnabled, profile }) {
  const errors = [];

  // 1. Roles validation: must have at least 1 real role, not placeholder
  const cleanRoles = (targetTitles || []).map(r => (r || '').trim()).filter(r => r && r.toLowerCase() !== 'target role' && r.toLowerCase() !== 'your role');
  if (cleanRoles.length === 0) {
    errors.push({
      field: 'roles',
      title: 'Target Job Roles Missing',
      message: 'Please add at least 1 target job title in Search Settings (e.g. Software Engineer, Data Analyst).'
    });
  }

  // 2. Locations validation: must have at least 1 location/city
  const cleanLocs = (targetLocations || []).map(l => (l || '').trim()).filter(Boolean);
  if (cleanLocs.length === 0) {
    errors.push({
      field: 'locations',
      title: 'Target Cities / Locations Missing',
      message: 'Please specify at least 1 target city, state/province, or "Remote" in Search Settings.'
    });
  }

  // 3. Active boards validation: at least 1 board enabled
  const boards = boardsEnabled || {};
  const hasActiveBoard = Object.values(boards).some(v => v === true);
  if (!hasActiveBoard) {
    errors.push({
      field: 'boards',
      title: 'All Job Boards Disabled',
      message: 'Please enable at least 1 job board (e.g. LinkedIn, Adzuna, Canada Job Bank) in Search Settings.'
    });
  }

  // 4. Candidate profile baseline: must have at least basic skills or role/experience
  const prof = profile || {};
  const hasSkills = Array.isArray(prof.skills) && prof.skills.length > 0;
  const hasRole = Boolean((prof.role || prof.headline || '').trim());
  const hasExp = Array.isArray(prof.experience) && prof.experience.length > 0;
  const hasSummary = Boolean((prof.writing_sample || prof.summary || '').trim());
  if (!hasSkills && !hasRole && !hasExp && !hasSummary) {
    errors.push({
      field: 'profile',
      title: 'Candidate Profile / Resume Empty',
      message: 'Please upload a resume or specify your current role & skills in My Resume & Profile so jobs can be accurately scored.'
    });
  }

  return {
    isValid: errors.length === 0,
    cleanRoles,
    cleanLocs,
    errors
  };
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
        : (profile.role ? [profile.role] : [])));

  // Target locations: solely from overrides or settings (fallback to profile resident location only if settings empty)
  const targetLocations = (overrides.targetLocations && overrides.targetLocations.length > 0)
    ? overrides.targetLocations
    : ((settings.locations && settings.locations.length > 0)
      ? settings.locations
      : ((settings.target_locations && settings.target_locations.length > 0)
        ? settings.target_locations
        : (profile.contact?.location ? [profile.contact.location] : [])));

  // Pre-Scan Validation Gate: Ensure search criteria and profile baseline are valid
  const validation = validateScanCriteria({
    targetTitles,
    targetLocations,
    boardsEnabled: settings.boards_enabled,
    profile
  });

  if (!validation.isValid && !overrides.skipValidation && !overrides.injectedRawJobs) {
    return {
      success: false,
      status: 'validation_failed',
      validationErrors: validation.errors,
      message: 'Scan cannot proceed because required search preferences or candidate profile data are missing.'
    };
  }

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

  // Dynamic Host Resource Profiling for Auto-Scaling Concurrency
  const optimalProfile = getOptimalConcurrency();
  const SCORING_CONCURRENCY = optimalProfile.scoringConcurrency || 8;
  const NETWORK_CONCURRENCY = optimalProfile.networkConcurrency || 16;

  // Real-time tracking structures for progressive streaming ingestion
  const seenThisScan = new Set();
  const allRawItems = [];
  const allFreshItems = [];
  const allUnseenJobs = [];
  const allScoredJobs = [];
  const allQualifiedJobs = [];
  const allRejectedJobs = [];

  const existingPendingIds = new Set((jobsDb.getPendingJobs() || []).map(j => String(j.id || j.job_id || '')));
  const existingAppliedIds = new Set((jobsDb.getAppliedJobs() || []).map(j => String(j.id || j.job_id || '')));
  const existingRejectedIds = new Set((jobsDb.getRejectedJobs() || []).map(j => String(j.id || j.job_id || '')));

  let streamChain = Promise.resolve();

  // Progressive Micro-Batch Streaming Handler
  async function processMicroBatch(batch, sourceInfo = {}) {
    if (signal.aborted || !Array.isArray(batch) || batch.length === 0) return;

    // Convert raw feeds into lightweight DTOs (stripping heavy HTML, inline styles, capping descriptions to 1500 chars)
    const normBatch = batch.map(j => toLightweightJobDTO(j, j.source || sourceInfo.board || 'unknown')).filter(Boolean);
    if (normBatch.length === 0) return;

    for (const job of normBatch) {
      const src = job.source || 'Other';
      currentScan.boardBreakdown[src] = (currentScan.boardBreakdown[src] || 0) + 1;
      allRawItems.push(job);
    }
    currentScan.stats.totalFetched = allRawItems.length;

    // Step 2: Freshness & Geo filtering on incoming batch
    let filteredItems = runFreshnessFilter(normBatch.map(j => ({ json: j })), freshnessHours);
    filteredItems = runGeoFilter(filteredItems, { ...profile, target_titles: targetTitles, locations: targetLocations, country_scope: activeScope, work_type: activeWorkType });
    const freshBatch = filteredItems.map(i => i.json);
    allFreshItems.push(...freshBatch);
    currentScan.stats.freshCount = allFreshItems.length;

    if (signal.aborted || freshBatch.length === 0) return;

    // Step 3: Deduplication filtering against SQLite and active scan cache
    const unseenBatch = [];
    const newlySeenIds = [];

    for (const job of freshBatch) {
      const id = job.id ? String(job.id) : null;
      const rawUrl = String(job.redirect_url || job.job_url || '');
      const cleanUrl = rawUrl.split('?')[0].replace(/\/+$/, '').trim().toLowerCase();
      const compClean = (job.company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const titClean = (job.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const sig = compClean && titClean ? `comp_${compClean}_tit_${titClean}` : null;

      if (id && (seenThisScan.has(id) || jobsDb.isJobSeen(id) || existingPendingIds.has(id) || existingAppliedIds.has(id) || existingRejectedIds.has(id))) continue;
      if (cleanUrl && cleanUrl.length > 15 && !cleanUrl.includes('google.com/search') && (seenThisScan.has(cleanUrl) || jobsDb.isJobSeen(cleanUrl))) continue;
      if (sig && (seenThisScan.has(sig) || jobsDb.isJobSeen(sig))) continue;

      if (id) seenThisScan.add(id);
      if (cleanUrl) seenThisScan.add(cleanUrl);
      if (sig) seenThisScan.add(sig);

      if (id) newlySeenIds.push(id);
      if (cleanUrl && cleanUrl.length > 15 && !cleanUrl.includes('google.com/search')) newlySeenIds.push(cleanUrl);
      if (sig) newlySeenIds.push(sig);

      unseenBatch.push(job);
    }

    allUnseenJobs.push(...unseenBatch);
    currentScan.stats.unseenCount = allUnseenJobs.length;

    if (signal.aborted || unseenBatch.length === 0) return;

    // Step 4: Progressive Concurrent Scoring with Event Loop Yielding
    currentScan.step = 'scoring';
    currentScan.progress.message = `Streaming evaluation: ${allUnseenJobs.length} opportunities received...`;

    const batchScored = [];
    for (let i = 0; i < unseenBatch.length; i += SCORING_CONCURRENCY) {
      if (signal.aborted) break;
      const slice = unseenBatch.slice(i, i + SCORING_CONCURRENCY);
      const scoredSlice = await Promise.all(slice.map(async (job) => {
        let scoredItem = null;
        if (!overrides.skipLLM && !signal.aborted) {
          try {
            const prompt = buildDynamicScoringPrompt(
              { ...profile, locations: targetLocations, target_titles: targetTitles, country_scope: activeScope, commute_radius_km: settings.commute_radius_km },
              job.title,
              job.description
            );
            const llmPromise = callLLMProvider({ prompt });
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('LLM scoring timeout')), 7000));
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

        return {
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
      }));

      for (const item of scoredSlice) {
        batchScored.push(item);
        allScoredJobs.push(item);
        currentScan.stats.scoredCount++;
        currentScan.progress.current = allScoredJobs.length;
      }

      await yieldEventLoop();
    }

    // Step 5: Streaming Progressive Persistence to SQLite
    const batchQualified = batchScored.filter(j => (j.score || 0) >= minThreshold && j.should_apply !== false);
    const batchRejected = batchScored.filter(j => (j.score || 0) < minThreshold || j.should_apply === false);

    if (newlySeenIds.length > 0) jobsDb.markJobsSeen(newlySeenIds);
    for (const q of batchQualified) {
      jobsDb.savePendingJob(q);
      allQualifiedJobs.push(q);
      existingPendingIds.add(String(q.id));
    }
    for (const r of batchRejected) {
      jobsDb.saveRejectedJob(r);
      allRejectedJobs.push(r);
      existingRejectedIds.add(String(r.id));
    }

    currentScan.stats.qualifiedCount = allQualifiedJobs.length;
    currentScan.stats.rejectedCount = allRejectedJobs.length;
  }

  const queueBatch = (batch, sourceInfo) => {
    streamChain = streamChain.then(() => processMicroBatch(batch, sourceInfo)).catch(err => {
      addLog(`Stream micro-batch warning: ${err.message}`, 'warn');
    });
    return streamChain;
  };

  // Step 1: Ingest from job boards with dynamic search payload and abort signal
  if (Array.isArray(overrides.injectedRawJobs)) {
    queueBatch(overrides.injectedRawJobs, { board: 'Injected' });
  } else {
    try {
      currentScan.progress.message = 'Fetching multi-board feeds...';
      const fetched = await fetchAllJobs({
        targetTitles,
        targetLocations,
        countryScope: activeScope,
        candidateWorkType: activeWorkType,
        boardsEnabled: settings.boards_enabled,
        freshnessHours,
        commuteRadiusKm: settings.commute_radius_km,
        signal,
        concurrency: NETWORK_CONCURRENCY,
        onBatch: (batch, meta) => queueBatch(batch, meta)
      });

      // Safety check: if any jobs in returned list were not captured by onBatch
      if (Array.isArray(fetched) && fetched.length > 0) {
        const remaining = fetched.filter(j => {
          const id = j.id ? String(j.id) : null;
          return id ? !seenThisScan.has(id) : true;
        });
        if (remaining.length > 0) {
          queueBatch(remaining, { board: 'Final Sweep' });
        }
      }
    } catch (fetchErr) {
      addLog(`Fetch note: ${fetchErr.message}`, 'warn');
    }
  }

  // Wait for all stream micro-batches to complete processing
  await streamChain;

  if (signal.aborted) {
    currentScan.status = 'aborted';
    currentScan.step = 'aborted';
    currentScan.completedAt = new Date().toISOString();
    currentScan.durationMs = Date.now() - new Date(currentScan.startedAt).getTime();
    addLog('Scan aborted by user', 'warn');
    saveLastScanResult(currentScan);
    return { success: false, status: 'aborted', message: 'Scan stopped by user', scanId, stats: currentScan.stats };
  }

  currentScan.status = 'completed';
  currentScan.step = 'completed';
  currentScan.completedAt = new Date().toISOString();
  currentScan.durationMs = Date.now() - new Date(currentScan.startedAt).getTime();
  addLog(`Scan finished: ${allQualifiedJobs.length} qualified opportunities added to approval queue! (${allRejectedJobs.length} below threshold).`);

  saveLastScanResult(currentScan);

  return {
    success: true,
    scanId,
    status: 'completed',
    boardBreakdown: currentScan.boardBreakdown,
    stats: {
      totalFetched: allRawItems.length,
      freshCount: allFreshItems.length,
      unseenCount: allUnseenJobs.length,
      scoredCount: allScoredJobs.length,
      qualifiedCount: allQualifiedJobs.length,
      rejectedCount: allRejectedJobs.length
    },
    qualifiedJobs: allQualifiedJobs,
    allScored: allScoredJobs
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
    if (result.status === 'validation_failed') {
      return res.status(422).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('Pipeline error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pipeline/validate
router.get('/validate', (req, res) => {
  try {
    const profile = getMasterProfile();
    const settings = settingsHelper.getSettings();
    const targetTitles = (settings.target_titles && settings.target_titles.length > 0)
      ? settings.target_titles
      : ((settings.target_roles && settings.target_roles.length > 0)
        ? settings.target_roles
        : (profile.role ? [profile.role] : []));
    const targetLocations = (settings.locations && settings.locations.length > 0)
      ? settings.locations
      : ((settings.target_locations && settings.target_locations.length > 0)
        ? settings.target_locations
        : (profile.contact?.location ? [profile.contact.location] : []));
    const validation = validateScanCriteria({
      targetTitles,
      targetLocations,
      boardsEnabled: settings.boards_enabled,
      profile
    });
    res.json(validation);
  } catch (err) {
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
      const stateObj = {
        scanId: activeScanState.scanId,
        status: activeScanState.status,
        step: activeScanState.step,
        progress: activeScanState.progress,
        startedAt: activeScanState.startedAt,
        durationMs: Date.now() - new Date(activeScanState.startedAt).getTime(),
        logs: activeScanState.logs.slice(-35),
        boardBreakdown: activeScanState.boardBreakdown,
        stats: activeScanState.stats
      };
      return res.json({
        success: true,
        isRunning: true,
        status: activeScanState.status,
        currentStep: activeScanState.step,
        logs: stateObj.logs,
        boardBreakdown: stateObj.boardBreakdown,
        stats: stateObj.stats,
        lastScanTimestamp: activeScanState.startedAt,
        state: stateObj
      });
    }

    const last = getLastScanResult();
    const fallback = last || {
      status: 'idle',
      step: 'idle',
      logs: [],
      boardBreakdown: {},
      stats: { totalFetched: 0, freshCount: 0, unseenCount: 0, scoredCount: 0, qualifiedCount: 0, rejectedCount: 0 }
    };
    return res.json({
      success: true,
      isRunning: false,
      status: fallback.status || 'idle',
      currentStep: fallback.step || 'idle',
      logs: fallback.logs || [],
      boardBreakdown: fallback.boardBreakdown || {},
      stats: fallback.stats || {},
      lastScanTimestamp: fallback.completedAt || fallback.startedAt || null,
      state: fallback
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

module.exports = { router, executePipelineScan, validateScanCriteria };
