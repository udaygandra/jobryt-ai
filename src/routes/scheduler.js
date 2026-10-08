/**
 * src/routes/scheduler.js — Native Background Cron Scheduler
 * Configures and manages autonomous job scanning without n8n or external services.
 */

const express = require('express');
const router = express.Router();
const cron = require('node-cron');
const settingsHelper = require('../../scripts/core/settings-helper');

let activeCronJob = null;
let pipelineScanHandler = null;

const schedulerState = {
  enabled: true,
  preset: 'DAILY',
  schedule: '0 9 * * *',
  description: 'Daily at 9:00 AM',
  isRunning: false,
  lastRun: null,
  lastRunStatus: null,
  lastRunQualifiedCount: 0
};

function applyCronSchedule() {
  if (activeCronJob) {
    activeCronJob.stop();
    activeCronJob = null;
  }

  if (!schedulerState.enabled || !schedulerState.schedule) {
    console.log('⏰ [Scheduler] Background Cron is currently DISABLED.');
    return;
  }

  if (!cron.validate(schedulerState.schedule)) {
    console.error(`❌ [Scheduler] Invalid cron expression: "${schedulerState.schedule}"`);
    return;
  }

  activeCronJob = cron.schedule(schedulerState.schedule, async () => {
    if (schedulerState.isRunning) {
      console.log('⏰ [Scheduler] Previous scan still running, skipping tick.');
      return;
    }
    schedulerState.isRunning = true;
    schedulerState.lastRun = new Date().toISOString();
    console.log(`⏰ [Scheduler] Running automated background scan (${schedulerState.schedule})...`);
    try {
      if (typeof pipelineScanHandler === 'function') {
        const result = await pipelineScanHandler({ source: 'cron' });
        schedulerState.lastRunStatus = 'success';
        schedulerState.lastRunQualifiedCount = result.stats?.qualifiedCount || 0;
        console.log(`✅ [Scheduler] Scan complete. Found ${schedulerState.lastRunQualifiedCount} qualified opportunities.`);
      }
    } catch (err) {
      schedulerState.lastRunStatus = `error: ${err.message}`;
      console.error('❌ [Scheduler] Scan failed:', err.message);
    } finally {
      schedulerState.isRunning = false;
    }
  });

  console.log(`⏰ [Scheduler] Background Cron active: "${schedulerState.schedule}" (${schedulerState.description})`);
}

function initCronScheduler(scanFn) {
  if (typeof scanFn === 'function') {
    pipelineScanHandler = scanFn;
  }
  try {
    const settings = settingsHelper.getSettings();
    const isEnabled = settings.cron_enabled !== undefined ? Boolean(settings.cron_enabled) : true;
    const schedule = settings.cron_schedule || '0 9 * * *';
    const description = settings.cron_description || 'Daily at 9:00 AM';
    const preset = settings.cron_preset || 'DAILY';

    schedulerState.enabled = isEnabled;
    schedulerState.schedule = schedule;
    schedulerState.description = description;
    schedulerState.preset = preset;

    applyCronSchedule();
  } catch (err) {
    console.warn('[Scheduler] Init warning:', err.message);
  }
}

// GET /api/scheduler
router.get('/', (req, res) => {
  res.json({
    ...schedulerState,
    presets: settingsHelper.SCHEDULE_PRESETS
  });
});

// POST /api/scheduler
router.post('/', (req, res) => {
  try {
    const { enabled, preset, schedule, description } = req.body;
    if (schedule && !cron.validate(schedule)) {
      return res.status(400).json({ error: `Invalid cron expression format: ${schedule}` });
    }

    const updated = settingsHelper.updateSettings({
      cron_enabled: enabled !== undefined ? Boolean(enabled) : schedulerState.enabled,
      cron_schedule: schedule || schedulerState.schedule,
      cron_description: description || schedulerState.description,
      cron_preset: preset || schedulerState.preset
    });

    schedulerState.enabled = updated.cron_enabled;
    schedulerState.schedule = updated.cron_schedule;
    schedulerState.description = updated.cron_description;
    schedulerState.preset = updated.cron_preset;

    applyCronSchedule();

    res.json({
      success: true,
      message: 'Background scheduler settings saved.',
      scheduler: {
        ...schedulerState,
        presets: settingsHelper.SCHEDULE_PRESETS
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scheduler/trigger
router.post('/trigger', async (req, res) => {
  if (schedulerState.isRunning) {
    return res.status(409).json({ error: 'A background scan is already in progress' });
  }
  schedulerState.isRunning = true;
  schedulerState.lastRun = new Date().toISOString();
  try {
    if (typeof pipelineScanHandler === 'function') {
      const result = await pipelineScanHandler({ source: 'manual-trigger' });
      schedulerState.lastRunStatus = 'success';
      schedulerState.lastRunQualifiedCount = result.stats?.qualifiedCount || 0;
      res.json({ success: true, result });
    } else {
      schedulerState.lastRunStatus = 'error: pipeline handler not initialized';
      res.status(500).json({ error: 'Pipeline scan handler not initialized' });
    }
  } catch (err) {
    schedulerState.lastRunStatus = `error: ${err.message}`;
    res.status(500).json({ error: err.message });
  } finally {
    schedulerState.isRunning = false;
  }
});

module.exports = { router, initCronScheduler, schedulerState };
