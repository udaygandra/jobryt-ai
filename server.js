/**
 * server.js — Jobryt AI Agent Full-Stack Web Application Server
 *
 * Runs the Jobryt AI Agent Web Dashboard on port 3000 (0.0.0.0).
 * Exposes full management for:
 *   - Autonomous Multi-Board Job Discovery Pipeline
 *   - Manual Search & Evaluation with Custom Overrides
 *   - Live Job Review (Qualified / Pending / Applied / Rejected)
 *   - Zero-Fabrication ATS PDF Resume & Cover Letter Tailoring
 *   - Master Profile & Settings Management
 *   - Excel / CSV Application Tracking Exports
 *   - Recruiter Outreach Generation
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const cp = require('child_process');

// ── 1. Load Environment & Core Utilities ─────────────────────────────────────
const { loadEnv } = require('./scripts/core/load-env');
loadEnv();

const { getDataDir, readJsonFile, writeJsonFile, escapeHtml } = require('./scripts/core/common-utils');
const settingsHelper = require('./scripts/core/settings-helper');
const jobsDb = require('./scripts/core/jobs-db');
const { fetchAllJobs } = require('./scripts/engine/fetch-all-boards');
const {
  normalizeJob,
  runFreshnessFilter,
  runDedupFilter,
  runGeoFilter,
  computeHeuristicScore,
  runParseScore,
} = require('./scripts/engine/node-logic');
const { callLLMProvider, buildDynamicScoringPrompt } = require('./scripts/engine/llm-provider');
const { buildFullDepthResumePdf } = require('./scripts/engine/generate-resume-pdf');
const { getLLMState, getNextWaterfallModel } = require('./scripts/engine/llm-state-manager');
const { tailorJobApplication } = require('./scripts/engine/tailor-engine');

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';
const rootDir = __dirname;
const dataDir = getDataDir();

// Ensure required subdirectories exist
const trackingDir = path.join(dataDir, 'tracking');
const profilesDir = path.join(dataDir, 'profiles');
const configDir = path.join(dataDir, 'config');
for (const dir of [dataDir, trackingDir, profilesDir, configDir, path.join(rootDir, 'public')]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Initialize SQLite database
jobsDb.getDb();

// Middleware
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Serve static assets from public/ and generated PDFs from data/
app.use('/data', express.static(dataDir));
app.use(express.static(path.join(rootDir, 'public')));

// ── Helper: Read & Write Profile ─────────────────────────────────────────────
function getMasterProfile() {
  const profilePath = path.join(profilesDir, 'master-profile.json');
  const examplePath = path.join(profilesDir, 'master-profile.example.json');
  if (fs.existsSync(profilePath)) {
    return readJsonFile(profilePath, {});
  }
  if (fs.existsSync(examplePath)) {
    const defaultData = readJsonFile(examplePath, {});
    fs.writeFileSync(profilePath, JSON.stringify(defaultData, null, 2), 'utf8');
    return defaultData;
  }
  return {
    name: 'Your Name',
    target_titles: ['Data Analyst', 'Software Engineer'],
    locations: ['Remote', 'Toronto, ON'],
    skills: ['JavaScript', 'Python', 'SQL', 'Docker', 'Git'],
    experience: [],
    writing_sample: ''
  };
}

// ── Telegram Bot Messaging & Background Bridge Manager ──────────────────────
async function sendTelegramMessage(text, replyMarkup = null, customChatId = null) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = customChatId || process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return null;

  return new Promise((resolve) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      parse_mode: 'HTML',
      text,
      ...(replyMarkup && { reply_markup: replyMarkup }),
    });

    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 12000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (_) { resolve(null); }
      });
    });

    req.on('error', (err) => {
      console.error('[Telegram] Send error:', err.message);
      resolve(null);
    });

    req.write(payload);
    req.end();
  });
}

async function sendJobAlertCard(job, customChatId = null) {
  const jobUrl = job.redirect_url || job.job_url || job.apply_url || job.url || job.link || '';
  const urlLine = jobUrl ? `\n🔗 <b>Job Link:</b> <a href="${jobUrl}">${jobUrl}</a>` : '';
  const missingText = job.missing_skills?.length > 0
    ? `\n⚠️ <b>Missing:</b> ${job.missing_skills.slice(0, 3).join(', ')}`
    : '';

  const insight = job.why_this_fits || job.reasoning ||
    (job.key_matched_skills?.length ? `Skills matched: ${job.key_matched_skills.slice(0, 4).join(', ')}` : 'Strong profile alignment');

  const msgText = `🎯 <b>New Qualified Job Alert (${job.score || 85}/100)</b>\n\n` +
    `<b>Role:</b> ${escapeHtml(job.title || 'Target Role')}\n` +
    `<b>Company:</b> ${escapeHtml(job.company || 'Direct Employer')}\n` +
    `<b>Location:</b> ${escapeHtml(job.location || 'Remote / Hybrid')}\n` +
    `<b>Source:</b> ${escapeHtml(job.source || 'Direct')}${urlLine}\n\n` +
    `💡 <b>Match Insight:</b> ${escapeHtml(insight)}${missingText}\n\n` +
    `<i>Tap a button below to act:</i>`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🚀 Apply (ATS Resume + Cover Letter)', callback_data: `APPLY:${job.id}` },
        { text: '❌ Reject', callback_data: `REJECT:${job.id}` },
      ]
    ]
  };

  return sendTelegramMessage(msgText, keyboard, customChatId);
}

// Telegram Bridge State Tracker
let bridgeProcess = null;
let bridgeStatus = {
  running: false,
  startedAt: null,
  pid: null,
  restarts: 0,
  lastError: null,
  autoRestart: true
};

function startTelegramBridge() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('[Telegram Bridge] TELEGRAM_BOT_TOKEN not configured.');
    return false;
  }
  if (bridgeProcess && !bridgeProcess.killed) {
    return true;
  }

  const scriptPath = path.join(__dirname, 'scripts', 'bot', 'telegram-bridge.js');
  try {
    bridgeStatus.autoRestart = true;
    bridgeProcess = cp.fork(scriptPath, [], {
      env: { ...process.env },
      stdio: 'inherit'
    });

    bridgeStatus.running = true;
    bridgeStatus.startedAt = new Date().toISOString();
    bridgeStatus.pid = bridgeProcess.pid;
    bridgeStatus.lastError = null;

    bridgeProcess.on('exit', (code, signal) => {
      console.log(`[Telegram Bridge] Process exited with code ${code}, signal ${signal}`);
      bridgeStatus.running = false;
      bridgeStatus.pid = null;
      if (bridgeStatus.autoRestart) {
        bridgeStatus.restarts++;
        console.log('[Telegram Bridge] Restarting bridge in 5 seconds...');
        setTimeout(() => startTelegramBridge(), 5000);
      }
    });

    bridgeProcess.on('error', (err) => {
      console.error('[Telegram Bridge] Process error:', err.message);
      bridgeStatus.lastError = err.message;
    });

    console.log(`[Telegram Bridge] Active and polling Telegram updates (PID ${bridgeProcess.pid})`);
    return true;
  } catch (err) {
    console.error('[Telegram Bridge] Failed to launch:', err.message);
    bridgeStatus.lastError = err.message;
    return false;
  }
}

function stopTelegramBridge() {
  bridgeStatus.autoRestart = false;
  if (bridgeProcess && !bridgeProcess.killed) {
    bridgeProcess.kill('SIGINT');
    bridgeStatus.running = false;
    bridgeStatus.pid = null;
    return true;
  }
  return false;
}

// Automatically start Telegram Bridge if credentials are provided
if (process.env.TELEGRAM_BOT_TOKEN) {
  setTimeout(() => {
    startTelegramBridge();
  }, 1000);
}

// ── REST API ROUTES ──────────────────────────────────────────────────────────

// 1. System Status & Metrics
app.get('/api/status', (req, res) => {
  try {
    const profile = getMasterProfile();
    const settings = settingsHelper.getSettings();
    const seenCount = jobsDb.getSeenJobsCount();
    const pendingJobs = jobsDb.getPendingJobs(500);
    const appliedJobs = jobsDb.getAppliedJobs(500);
    const rejectedJobs = jobsDb.getRejectedJobs(500);

    let activeModel = process.env.LLM_MODEL || 'gemini-3.8-flash';
    let callsToday = 0;
    try {
      const next = getNextWaterfallModel();
      if (next && next.model) activeModel = next.model.id;
      const state = getLLMState();
      if (state && state[activeModel]) callsToday = state[activeModel].calls_today || 0;
    } catch (_) {}

    const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    const hasTelegram = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

    res.json({
      status: 'operational',
      environment: process.env.NODE_ENV || 'local',
      candidate: {
        name: profile.name || 'Not Configured',
        target_titles: profile.target_titles || [],
        locations: profile.locations || [],
        skills_count: (profile.skills || []).length,
        experience_count: (profile.experience || []).length
      },
      counts: {
        seen: seenCount,
        pending: pendingJobs.length,
        applied: appliedJobs.length,
        rejected: rejectedJobs.length
      },
      settings,
      llm: {
        provider: process.env.LLM_PROVIDER || 'gemini',
        model: activeModel,
        hasKey: hasGeminiKey,
        callsToday
      },
      integrations: {
        telegramConfigured: hasTelegram,
        telegramChatId: process.env.TELEGRAM_CHAT_ID ? 'Configured' : 'Missing',
        bridgeRunning: Boolean(bridgeStatus.running),
        bridgePid: bridgeStatus.pid,
        adzunaConfigured: Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
        usajobsConfigured: Boolean(process.env.USAJOBS_API_KEY)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Candidate Master Profile (GET & POST)
app.get('/api/profile', (req, res) => {
  try {
    const profile = getMasterProfile();
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/profile', (req, res) => {
  try {
    const profileData = req.body;
    if (!profileData || typeof profileData !== 'object') {
      return res.status(400).json({ error: 'Invalid profile data provided' });
    }

    const profilePath = path.join(profilesDir, 'master-profile.json');
    const backupPath = path.join(profilesDir, 'master-profile.backup.json');

    // Create backup of previous profile
    if (fs.existsSync(profilePath)) {
      try { fs.copyFileSync(profilePath, backupPath); } catch (_) {}
    }

    fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2), 'utf8');
    res.json({ success: true, message: 'Master profile updated successfully', profile: profileData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/profile/upload-resume', async (req, res) => {
  const { filename, fileBase64, fileText } = req.body || {};
  if (!fileBase64 && !fileText) {
    return res.status(400).json({ error: 'No resume file content provided' });
  }

  const tempName = filename
    ? `upload-${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    : `upload-${Date.now()}.pdf`;
  const tempPath = path.join(profilesDir, tempName);

  try {
    if (fileBase64) {
      fs.writeFileSync(tempPath, Buffer.from(fileBase64, 'base64'));
    } else {
      fs.writeFileSync(tempPath, fileText, 'utf8');
    }

    let parsed = null;

    let rawText = fileText || '';
    if (!rawText && fs.existsSync(tempPath)) {
      try {
        const { extractTextFromFile } = require('./scripts/engine/local-resume-extractor');
        rawText = await extractTextFromFile(tempPath);
      } catch (_) {}
    }

    // Early validation on raw text (e.g. immediate rejection for cover letters, job postings, invoices)
    const { validateResumeDocument } = require('./scripts/engine/resume-validator');
    const earlyValidation = validateResumeDocument(null, rawText, filename);
    if (!earlyValidation.isValid && earlyValidation.reason !== 'missing_work_experience' && earlyValidation.reason !== 'insufficient_resume_data') {
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (_) {}
      }
      return res.status(422).json({
        success: false,
        error: earlyValidation.message,
        reason: earlyValidation.reason,
        message: 'Format or resume is not correct please fill the below master profile from UI.'
      });
    }

    // 1. Try LLM Waterfall Parser if configured
    try {
      const { parseResume } = require('./scripts/engine/resume-to-profile');
      parsed = await parseResume(tempPath, { dryRun: true, deleteAfterParsing: false });
    } catch (llmErr) {
      console.warn('⚠️ Waterfall LLM resume parser skipped or failed, using local resilient parser:', llmErr.message);
    }

    // 2. Fallback to Local Text & PDF parser
    if (!parsed) {
      const { extractResumeLocallyFromText } = require('./scripts/engine/local-resume-extractor');
      parsed = extractResumeLocallyFromText(rawText || '');
    }

    if (parsed) {
      const { normalizeProfileFields } = require('./scripts/engine/resume-to-profile');
      parsed = normalizeProfileFields(parsed);
    }

    // Clean up temporary file
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }

    // 3. Strict Validation: Ensure valid CV/Resume with verifiable work experience
    const validation = validateResumeDocument(parsed, rawText, filename);

    if (!validation.isValid) {
      return res.status(422).json({
        success: false,
        error: validation.message,
        reason: validation.reason,
        message: 'Format or resume is not correct please fill the below master profile from UI.'
      });
    }

    res.json({
      success: true,
      message: 'Resume parsed into detailed master profile successfully.',
      profile: parsed
    });
  } catch (err) {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
    console.error('Resume upload error:', err);
    res.status(500).json({ error: 'Failed to process resume: ' + err.message });
  }
});

// 3. Settings Configuration (GET & POST)
app.get('/api/settings', (req, res) => {
  try {
    const settings = settingsHelper.getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const newSettings = req.body;
    const updated = settingsHelper.updateSettings(newSettings);
    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Manual Environment Config (.env) Management
app.get('/api/env', (req, res) => {
  try {
    const envPath = path.join(rootDir, '.env');
    let envMap = {};
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          // Mask sensitive keys
          if (/key|token|secret|password/i.test(key) && val) {
            envMap[key] = val.length > 8 ? `${val.slice(0, 4)}...${val.slice(-4)}` : '••••••••';
          } else {
            envMap[key] = val;
          }
        }
      }
    }
    res.json({ success: true, env: envMap });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/env', (req, res) => {
  try {
    const updates = req.body || {};
    const envPath = path.join(rootDir, '.env');
    let lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split('\n') : [];
    
    for (const [key, value] of Object.entries(updates)) {
      if (!key) continue;
      const cleanVal = String(value == null ? '' : value).trim();
      process.env[key] = cleanVal;

      let found = false;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith(`${key}=`)) {
          lines[i] = `${key}=${cleanVal}`;
          found = true;
          break;
        }
      }
      if (!found) {
        lines.push(`${key}=${cleanVal}`);
      }
    }

    fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
    res.json({ success: true, message: 'Configuration saved to .env and loaded into memory' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Jobs: Pending, Applied, Rejected
app.get('/api/jobs/pending', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const jobs = jobsDb.getPendingJobs(limit);
    res.json({ count: jobs.length, jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/applied', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const jobs = jobsDb.getAppliedJobs(limit);
    res.json({ count: jobs.length, jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/rejected', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const jobs = jobsDb.getRejectedJobs(limit);
    res.json({ count: jobs.length, jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Action: Apply (Tailor Resume, Generate PDF & Cover Letter)
app.post('/api/jobs/apply', async (req, res) => {
  try {
    const { jobId, job: passedJob, tone } = req.body;
    let job = passedJob;
    if (!job && jobId) {
      job = jobsDb.findJobRecord(jobId);
    }
    if (!job) {
      return res.status(404).json({ error: `Job record not found for ID: ${jobId}` });
    }

    const profile = getMasterProfile();
    const result = await tailorJobApplication(job, profile, tone || 'Professional & Direct');
    res.json({ success: true, appliedJob: result });
  } catch (err) {
    console.error('Apply error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Action: Reject Job
app.post('/api/jobs/reject', (req, res) => {
  try {
    const { jobId, job: passedJob } = req.body;
    let job = passedJob;
    if (!job && jobId) {
      job = jobsDb.findJobRecord(jobId) || { id: jobId, title: 'Unknown', company: 'Unknown' };
    }
    if (job) {
      jobsDb.saveRejectedJob(job);
      jobsDb.removePendingJob(job.id || jobId);
    }
    res.json({ success: true, message: 'Job marked as rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Pipeline Execution (Autonomous Scan with optional Manual Overrides)
app.post('/api/pipeline/run', async (req, res) => {
  try {
    const overrides = req.body || {};
    const profile = getMasterProfile();
    const settings = settingsHelper.getSettings();

    // Use overrides if passed, otherwise fall back to profile/settings
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

    console.log(`[Manual Scan] Triggered with roles: ${targetTitles.join(', ')} | Locs: ${targetLocations.join(', ')} | Threshold: ${minThreshold}+`);

    // Temporarily apply search roles if overridden
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
    let filteredItems = runFreshnessFilter(allRawItems.map(j => ({ json: j })), freshnessHours);
    filteredItems = runGeoFilter(filteredItems, { ...profile, target_titles: targetTitles, locations: targetLocations });
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

    // Step 6: Dispatch interactive Telegram alert cards for qualified opportunities
    let telegramCardsSent = 0;
    const shouldSendTelegram = overrides.sendTelegram !== false && Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
    if (shouldSendTelegram && qualified.length > 0) {
      for (const qJob of qualified.slice(0, 5)) {
        try {
          const sent = await sendJobAlertCard(qJob);
          if (sent) telegramCardsSent++;
        } catch (tgErr) {
          console.warn('[Pipeline] Telegram alert notice:', tgErr.message);
        }
      }
    }

    res.json({
      success: true,
      stats: {
        totalFetched: allRawItems.length,
        freshCount: freshItems.length,
        unseenCount: unSeenJobs.length,
        scoredCount: scoredJobs.length,
        qualifiedCount: qualified.length,
        rejectedCount: rejected.length,
        telegramCardsSent
      },
      qualifiedJobs: qualified,
      allScored: scoredJobs
    });
  } catch (err) {
    console.error('Pipeline error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 9. Telegram Diagnostics & Control Routes
app.get('/api/telegram/status', async (req, res) => {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    let botInfo = null;

    if (botToken) {
      try {
        const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
        const meData = await meRes.json();
        if (meData.ok) botInfo = meData.result;
      } catch (_) {}
    }

    res.json({
      configured: Boolean(botToken && chatId),
      botTokenPresent: Boolean(botToken),
      targetChatId: chatId || null,
      bot: botInfo,
      bridge: {
        running: bridgeStatus.running,
        pid: bridgeStatus.pid,
        startedAt: bridgeStatus.startedAt,
        restarts: bridgeStatus.restarts,
        lastError: bridgeStatus.lastError
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/telegram/test-ping', async (req, res) => {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) {
      return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing in .env' });
    }

    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const meData = await meRes.json();
    if (!meData.ok) {
      return res.status(400).json({ error: `Telegram Bot Error: ${meData.description}` });
    }

    const customText = req.body?.message || `🚀 <b>Jobryt AI Agent Connected!</b>\n\n` +
      `Your Telegram Bot (<b>@${meData.result.username}</b>) is connected to chat <code>${chatId}</code>.\n\n` +
      `Features Active:\n` +
      `• Multi-board job scanning alerts\n` +
      `• 1-tap ATS PDF Resume & Cover Letter generation\n` +
      `• Recruiter & HR contact intelligence\n\n` +
      `<i>Tap Find Jobs below to run a live scan!</i>`;

    const sent = await sendTelegramMessage(customText, {
      inline_keyboard: [
        [{ text: '🔍 Find Jobs Now', callback_data: 'TRIGGER_PIPELINE' }],
        [{ text: '👤 Master Profile', callback_data: 'VIEW_PROFILE' }],
        [{ text: '⚙️ Settings', callback_data: 'SET_MENU:MAIN' }]
      ]
    });

    res.json({
      success: true,
      bot: meData.result,
      targetChatId: chatId,
      sent: Boolean(sent)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/telegram/bridge/start', (req, res) => {
  const started = startTelegramBridge();
  res.json({ success: started, bridge: bridgeStatus });
});

app.post('/api/telegram/bridge/stop', (req, res) => {
  const stopped = stopTelegramBridge();
  res.json({ success: stopped, bridge: bridgeStatus });
});

// 9. Manual Single Job Evaluator (Paste Any Job Posting to Score & Tailor)
app.post('/api/pipeline/evaluate-custom', async (req, res) => {
  try {
    const { title, company, location, description, url, source } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and Job Description are required' });
    }

    const profile = getMasterProfile();
    const rawJob = {
      id: `manual_${Date.now()}`,
      title: title.trim(),
      company: (company || 'Employer').trim(),
      location: (location || 'Remote').trim(),
      description: description.trim(),
      job_url: (url || '').trim(),
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

// 10. Recruiter & Hiring Team Finder / X-Ray Search Generator
app.get('/api/recruiters/search', (req, res) => {
  try {
    const company = (req.query.company || '').trim();
    const city = (req.query.city || '').trim();
    if (!company) {
      return res.status(400).json({ error: 'Company parameter is required' });
    }

    const profile = getMasterProfile();
    const candidateRole = (profile.target_titles && profile.target_titles[0]) || 'Specialist';

    // Generate Google X-Ray Search queries for LinkedIn
    const locQuery = city ? `("${city}" OR Canada OR USA)` : '(Canada OR USA)';
    const xRayQuery1 = `site:linkedin.com/in/ ("recruiter" OR "talent acquisition" OR "technical recruiter" OR "hiring manager") "${company}" ${locQuery}`;
    const xRayQuery2 = `site:linkedin.com/in/ ("engineering manager" OR "director" OR "head of") "${company}" ${locQuery}`;

    const googleSearchUrl1 = `https://www.google.com/search?q=${encodeURIComponent(xRayQuery1)}`;
    const googleSearchUrl2 = `https://www.google.com/search?q=${encodeURIComponent(xRayQuery2)}`;
    const linkedInCompanyUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${company} recruiter`)}`;

    // Draft connection request note (≤300 chars for LinkedIn limit)
    const draftNote = `Hi there! I noticed your talent leadership at ${company} and recently applied for the ${candidateRole} role. My background aligns strongly with your team's mission. Would love to connect and share how I can add immediate value!`;

    res.json({
      success: true,
      company,
      city,
      xRaySearchUrl: googleSearchUrl1,
      leadershipSearchUrl: googleSearchUrl2,
      linkedInSearchUrl: linkedInCompanyUrl,
      draftLinkedInNote: draftNote
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. PDF Resume Download / Stream
app.get('/api/resume/download/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(dataDir, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'PDF file not found' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Spreadsheet Export (Excel .xlsx and CSV)
app.get('/api/export/xlsx', (req, res) => {
  try {
    let XLSX;
    try { XLSX = require('xlsx'); } catch (_) {}
    if (!XLSX) return res.status(500).json({ error: 'XLSX package unavailable' });

    const applied = jobsDb.getAppliedJobs(1000);
    const wb = XLSX.utils.book_new();

    // Tab 1: Applied Jobs Master
    const rows = applied.map(a => ({
      'ID': a.id,
      'Applied Date': a.applied_at,
      'Job Title': a.title,
      'Company': a.company,
      'Location': a.location,
      'Match Score': a.match_score,
      'ATS Fit %': a.ats_keyword_fit,
      'Job URL': a.job_url,
      'Source': a.source,
      'Status': a.status,
      'PDF Resume': a.pdf_filename
    }));
    const ws1 = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Message': 'No applied jobs recorded yet' }]);
    XLSX.utils.book_append_sheet(wb, ws1, 'Applications Master');

    // Tab 2: Cover Letters
    const letterRows = applied.map(a => ({
      'Role': a.title,
      'Company': a.company,
      'Cover Letter Draft': a.cover_letter,
      'Tailored Summary': a.tailored_summary
    }));
    const ws2 = XLSX.utils.json_to_sheet(letterRows.length ? letterRows : [{ 'Message': 'No letters recorded yet' }]);
    XLSX.utils.book_append_sheet(wb, ws2, 'Resumes & Cover Letters');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Applied_Jobs_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/export/csv', (req, res) => {
  try {
    const applied = jobsDb.getAppliedJobs(1000);
    const headers = ['ID', 'Applied Date', 'Job Title', 'Company', 'Location', 'Match Score', 'ATS Fit %', 'Job URL', 'Source', 'Status', 'PDF Resume'];
    const escapeCsv = (val) => {
      const s = String(val == null ? '' : val).replace(/"/g, '""');
      return `"${s}"`;
    };

    let csvContent = headers.join(',') + '\n';
    for (const a of applied) {
      const row = [
        escapeCsv(a.id),
        escapeCsv(a.applied_at),
        escapeCsv(a.title),
        escapeCsv(a.company),
        escapeCsv(a.location),
        escapeCsv(a.match_score),
        escapeCsv(a.ats_keyword_fit),
        escapeCsv(a.job_url),
        escapeCsv(a.source),
        escapeCsv(a.status),
        escapeCsv(a.pdf_filename)
      ];
      csvContent += row.join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Applied_Jobs_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 13. Webhook listener for Telegram callbacks / tests
app.post('/webhook/telegram-callback', (req, res) => {
  console.log('[Webhook] Received update:', JSON.stringify(req.body).slice(0, 120));
  res.json({ ok: true, received: true });
});

// 14. Fallback to SPA index.html
app.use((req, res) => {
  res.sendFile(path.join(rootDir, 'public', 'index.html'));
});

// ── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log(`================================================================`);
  console.log(`🚀 Jobryt AI Agent Web Dashboard active at http://${HOST}:${PORT}`);
  console.log(`================================================================`);
});
