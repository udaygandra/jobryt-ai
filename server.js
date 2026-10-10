/**
 * server.js — Jobryt AI Agent Standalone Server
 *
 * Fully modularized Express application:
 *   - /api/status       : System health, candidate summary, metrics
 *   - /api/profile      : Master profile & resume ATS parsing
 *   - /api/jobs         : Pending/Applied/Rejected lists, tailoring, lifecycle tracking
 *   - /api/pipeline     : Multi-board job discovery & custom evaluation
 *   - /api/scheduler    : Autonomous background cron scanning
 *   - /api/settings     : Search parameters & .env configuration
 *   - /api/recruiters   : Hiring manager discovery & LinkedIn outreach
 *   - /api/export       : Excel / CSV application tracking & PDF downloads
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

// 1. Environment & Utilities
const { loadEnv } = require('./scripts/core/load-env');
loadEnv();

const { getDataDir } = require('./scripts/core/common-utils');
const settingsHelper = require('./scripts/core/settings-helper');
const jobsDb = require('./scripts/core/jobs-db');
const { getLLMState, getNextWaterfallModel, getActiveModelInfo } = require('./scripts/engine/llm-state-manager');

// 2. Modular Express Routers
const profileRoutes = require('./src/routes/profile');
const jobsRoutes = require('./src/routes/jobs');
const pipelineRoutes = require('./src/routes/pipeline');
const schedulerRoutes = require('./src/routes/scheduler');
const settingsRoutes = require('./src/routes/settings');
const recruitersRoutes = require('./src/routes/recruiters');
const exportRoutes = require('./src/routes/export');

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';
const rootDir = __dirname;
const dataDir = getDataDir();

// Ensure required runtime directories exist
for (const dir of [
  dataDir,
  path.join(dataDir, 'tracking'),
  path.join(dataDir, 'profiles'),
  path.join(dataDir, 'config'),
  path.join(rootDir, 'public')
]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Initialize SQLite database
jobsDb.getDb();

// Middleware
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Static asset delivery
app.use('/data', express.static(dataDir));
app.use(express.static(path.join(rootDir, 'public')));

// 3. System Status Endpoint
app.get('/api/status', (req, res) => {
  try {
    const profile = profileRoutes.getMasterProfile();
    const settings = settingsHelper.getSettings();
    const seenCount = jobsDb.getSeenJobsCount();
    const pendingJobs = jobsDb.getPendingJobs(500);
    const appliedJobs = jobsDb.getAppliedJobs(500);
    const rejectedJobs = jobsDb.getRejectedJobs(500);

    let modelInfo = {
      provider: process.env.LLM_PROVIDER || 'gemini',
      model: process.env.LLM_MODEL || 'gemini-3.8-flash',
      active_model: process.env.LLM_MODEL || 'gemini-3.8-flash',
      top_model: 'gemini-3.8-flash',
      revisit_in_seconds: 0,
      is_cooling_down: false,
      calls_today: 0,
      rpd_limit: 20
    };
    try {
      modelInfo = getActiveModelInfo();
    } catch (_) {}

    const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

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
        provider: modelInfo.provider,
        model: modelInfo.active_model,
        active_model: modelInfo.active_model,
        top_model: modelInfo.top_model,
        revisit_in_seconds: modelInfo.revisit_in_seconds,
        is_cooling_down: modelInfo.is_cooling_down,
        hasKey: hasGeminiKey,
        callsToday: modelInfo.calls_today,
        rpdLimit: modelInfo.rpd_limit
      },
      integrations: {
        standalone: true,
        schedulerRunning: schedulerRoutes.schedulerState.enabled,
        adzunaConfigured: Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
        usajobsConfigured: Boolean(process.env.USAJOBS_API_KEY)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Mount Modular Routers
app.use('/api/profile', profileRoutes.router);
app.use('/api/jobs', jobsRoutes.router);
app.use('/api/pipeline', pipelineRoutes.router);
app.use('/api/scheduler', schedulerRoutes.router);
app.use('/api/settings', settingsRoutes.router);
app.use('/api/env', (req, res, next) => {
  req.url = '/env' + (req.url === '/' ? '' : req.url);
  settingsRoutes.router(req, res, next);
});
app.use('/api/recruiters', recruitersRoutes.router);
app.use('/api/export', exportRoutes.router);
app.use('/api/resume', exportRoutes.router);

// 5. SPA Fallback
app.use((req, res) => {
  res.sendFile(path.join(rootDir, 'public', 'index.html'));
});

// 6. Launch Server & Autonomous Scheduler
const server = app.listen(PORT, HOST, () => {
  console.log(`================================================================`);
  console.log(`🚀 Jobryt AI Agent active at http://${HOST}:${PORT}`);
  console.log(`⚡ Standalone mode: 100% native Node.js & SQLite`);
  console.log(`================================================================`);
  schedulerRoutes.initCronScheduler(pipelineRoutes.executePipelineScan);
});
server.setTimeout(300000);
server.keepAliveTimeout = 65000;

module.exports = { app, server };
