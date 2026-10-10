/**
 * src/routes/settings.js — User Settings & Environment Configuration Routes
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const settingsHelper = require('../../scripts/core/settings-helper');

const rootDir = path.resolve(__dirname, '../../');

// GET /api/settings
router.get('/', (req, res) => {
  try {
    const settings = settingsHelper.getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/countries
router.get('/countries', (req, res) => {
  try {
    const { SUPPORTED_COUNTRIES } = require('../../scripts/core/geo-helper');
    res.json({ success: true, countries: SUPPORTED_COUNTRIES });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/boards?country=CA
router.get('/boards', (req, res) => {
  try {
    const { getBoardsForCountry, getAllSupportedBoards } = require('../../scripts/core/country-boards-registry');
    const country = (req.query.country || 'GLOBAL').toUpperCase();
    const boards = getBoardsForCountry(country);
    res.json({ success: true, country, boards, all_boards: getAllSupportedBoards() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/cities?country=CA&tier=1&q=toronto
router.get('/cities', (req, res) => {
  try {
    const rawCountry = (req.query.country || 'ALL').toUpperCase().trim();
    const queryTier = req.query.tier ? String(req.query.tier).toLowerCase().trim() : null;
    const querySearch = req.query.q ? String(req.query.q).toLowerCase().trim() : null;
    const globalCitiesPath = path.join(rootDir, 'public', 'data', 'global-cities.json');

    if (!fs.existsSync(globalCitiesPath)) {
      return res.status(404).json({ success: false, error: 'Cities dataset not found' });
    }

    const data = JSON.parse(fs.readFileSync(globalCitiesPath, 'utf8'));

    // Determine target cities pool
    let cityObjects = [];
    let countryName = 'Worldwide / All Supported Countries';
    let countryFlag = '🌐';
    let popularHubs = [
      'Toronto, ON, Canada',
      'New York, NY, USA',
      'London, UK',
      'San Francisco, CA, USA',
      'Bengaluru, KA, India',
      'Berlin, Germany',
      'Sydney, NSW, Australia',
      'Dubai, UAE',
      'Singapore',
      'Remote'
    ];

    if (rawCountry === 'ALL' || rawCountry === 'GLOBAL' || rawCountry === 'AUTO') {
      // Gather all city objects across all countries
      for (const countryMeta of Object.values(data.by_country || {})) {
        if (Array.isArray(countryMeta.cities)) {
          cityObjects.push(...countryMeta.cities);
        }
      }
    } else {
      const countryMeta = (data.by_country || {})[rawCountry];
      if (countryMeta) {
        countryName = countryMeta.name;
        countryFlag = countryMeta.flag;
        popularHubs = countryMeta.popular_hubs || [];
        cityObjects = [...(countryMeta.cities || [])];
      } else {
        cityObjects = [];
      }
    }

    // Apply tier filter if specified
    if (queryTier && queryTier !== 'all') {
      const allowedTiers = queryTier.split(',').map(t => parseInt(t.trim(), 10)).filter(Boolean);
      if (allowedTiers.length > 0) {
        cityObjects = cityObjects.filter(c => allowedTiers.includes(c.tier));
      }
    }

    // Apply text search query if specified
    if (querySearch) {
      cityObjects = cityObjects.filter(c =>
        c.city.toLowerCase().includes(querySearch) ||
        (c.formatted && c.formatted.toLowerCase().includes(querySearch)) ||
        (c.region && c.region.toLowerCase().includes(querySearch))
      );
    }

    const tier1 = cityObjects.filter(c => c.tier === 1).map(c => c.formatted);
    const tier2 = cityObjects.filter(c => c.tier === 2).map(c => c.formatted);
    const tier3 = cityObjects.filter(c => c.tier === 3).map(c => c.formatted);
    const formattedList = Array.from(new Set(cityObjects.map(c => c.formatted)));

    res.json({
      success: true,
      country: rawCountry,
      name: countryName,
      flag: countryFlag,
      total: formattedList.length,
      popular_hubs: popularHubs,
      by_tier: {
        tier1,
        tier2,
        tier3
      },
      cities: formattedList
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/settings/cities/live-search?q=markham&country=CA
router.get('/cities/live-search', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    const country = String(req.query.country || 'ALL').toUpperCase().trim();

    if (query.length < 2) {
      return res.json({ success: true, country, query, total: 0, cities: [] });
    }

    const { searchLiveCities } = require('../../scripts/core/geo-helper');
    const cities = await searchLiveCities(query, country);

    res.json({
      success: true,
      country,
      query,
      total: cities.length,
      cities
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/settings
router.post('/', (req, res) => {
  try {
    const newSettings = req.body;
    if (Array.isArray(newSettings.target_titles)) {
      newSettings.target_titles = newSettings.target_titles.slice(0, 10);
    }
    if (Array.isArray(newSettings.locations)) {
      newSettings.locations = newSettings.locations.slice(0, 5);
    }
    const updated = settingsHelper.updateSettings(newSettings);

    // Sync target_titles and locations with master profile if provided
    if (Array.isArray(newSettings.target_titles) || Array.isArray(newSettings.locations)) {
      try {
        const { getMasterProfile } = require('./profile');
        const { writeJsonFile, getDataDir } = require('../../scripts/core/common-utils');
        const prof = getMasterProfile();
        if (Array.isArray(newSettings.target_titles)) prof.target_titles = newSettings.target_titles;
        if (Array.isArray(newSettings.locations)) prof.locations = newSettings.locations;
        const profilePath = path.join(getDataDir(), 'profiles', 'master-profile.json');
        writeJsonFile(profilePath, prof);
      } catch (profSyncErr) {
        console.warn('Could not sync profile titles/locations:', profSyncErr.message);
      }
    }

    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/reset
router.post('/reset', async (req, res) => {
  try {
    const action = req.body?.action || 'clear_and_rescan';
    const jobsDb = require('../../scripts/core/jobs-db');
    let message = '';
    let updatedSettings = null;

    if (action === 'clear_queue' || action === 'clear_opportunities') {
      // 1. Purge pending jobs & seen jobs without initiating background scan
      jobsDb.clearPendingJobs();
      jobsDb.clearSeenJobs();
      message = 'Opportunities queue cleared. You can now run a manual scan when ready.';
    } else if (action === 'clear_and_rescan') {
      // Purge pending jobs & seen jobs so live boards can re-feed current criteria
      jobsDb.clearPendingJobs();
      jobsDb.clearSeenJobs();
      message = 'Opportunities cleared. Fresh job boards scan initiated in background.';

      // Run scan in background
      try {
        const { executePipelineScan } = require('./pipeline');
        executePipelineScan({ source: 'reset_rescan' }).catch(err => {
          console.warn('[Settings Reset] Background rescan error:', err.message);
        });
      } catch (_) {}
    } else if (action === 'reset_preferences') {
      // 2. Restore default settings (preserve user's titles/locations)
      const current = settingsHelper.getSettings();
      const defaultPrefs = {
        score_threshold: 70,
        commute_radius_km: 25,
        freshness_hours: 24,
        work_type: 'Open to All',
        country_scope: current.country_scope || 'AUTO',
        boards_enabled: {
          linkedin: true,
          indeed: true,
          canada_job_bank: true,
          adzuna: true,
          usajobs: true,
          arbeitsagentur: true,
          mycareersfuture: true,
          seek: true,
          reed: true,
          naukri: true,
          bayt: true,
          wttj: true,
          daijob: true,
          vagas: true,
          jobicy: true,
          remotive: true,
          arbeitnow: true,
          himalayas: true,
        }
      };
      updatedSettings = settingsHelper.updateSettings(defaultPrefs);
      message = 'Preferences reset to defaults (70% score, 25 km radius, 24h freshness, all boards enabled).';
    } else if (action === 'fresh_start') {
      // 3. Full factory reset
      jobsDb.clearPipelineData();
      const defaultPrefs = {
        score_threshold: 70,
        commute_radius_km: 25,
        freshness_hours: 24,
        work_type: 'Open to All',
        boards_enabled: {
          linkedin: true,
          indeed: true,
          canada_job_bank: true,
          adzuna: true,
          usajobs: true,
          arbeitsagentur: true,
          mycareersfuture: true,
          seek: true,
          reed: true,
          naukri: true,
          bayt: true,
          wttj: true,
          daijob: true,
          vagas: true,
          jobicy: true,
          remotive: true,
          arbeitnow: true,
          himalayas: true,
        }
      };
      updatedSettings = settingsHelper.updateSettings(defaultPrefs);
      message = 'All job tracking data purged and settings reset to defaults. Clean scan running.';

      try {
        const { executePipelineScan } = require('./pipeline');
        executePipelineScan({ source: 'fresh_start' }).catch(err => {
          console.warn('[Settings Reset] Background fresh start error:', err.message);
        });
      } catch (_) {}
    } else {
      return res.status(400).json({ error: `Unknown reset action: ${action}` });
    }

    res.json({
      success: true,
      action,
      message,
      settings: updatedSettings || settingsHelper.getSettings()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/env
router.get('/env', (req, res) => {
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

// POST /api/env
router.post('/env', (req, res) => {
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

    try {
      fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
      res.json({ success: true, message: 'Configuration saved to .env and loaded into memory' });
    } catch (writeErr) {
      console.warn(`[Settings] Notice: Could not persist to ${envPath} (${writeErr.message}), configuration active in runtime memory.`);
      res.json({ success: true, message: 'Configuration loaded into runtime memory (Note: .env file is read-only)' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/validate-key
router.post('/validate-key', async (req, res) => {
  try {
    const { board, credentials } = req.body || {};
    if (!board || !credentials) {
      return res.status(400).json({ success: false, error: 'Board identifier and credentials are required.' });
    }

    if (board === 'adzuna') {
      const appId = (credentials.ADZUNA_APP_ID || '').trim();
      const appKey = (credentials.ADZUNA_APP_KEY || '').trim();
      if (!appId || !appKey) {
        return res.status(400).json({ success: false, error: 'Both Adzuna App ID and App Key are required.' });
      }

      // Live probe test against Adzuna API
      try {
        const testUrl = `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}&results_per_page=1`;
        const testRes = await fetch(testUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) });
        if (!testRes.ok) {
          return res.status(400).json({ success: false, error: `Adzuna API returned authentication error (HTTP ${testRes.status}). Please verify your App ID and App Key.` });
        }
      } catch (probeErr) {
        return res.status(400).json({ success: false, error: `Could not verify Adzuna credentials: ${probeErr.message}` });
      }

      // Save to process.env
      process.env.ADZUNA_APP_ID = appId;
      process.env.ADZUNA_APP_KEY = appKey;
      
      const envPath = path.join(rootDir, '.env');
      try {
        let lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split('\n') : [];
        ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'].forEach(k => {
          const v = credentials[k];
          let found = false;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith(`${k}=`)) { lines[i] = `${k}=${v}`; found = true; break; }
          }
          if (!found) lines.push(`${k}=${v}`);
        });
        fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
      } catch (writeErr) {
        console.warn(`[Settings] Notice: Could not persist to ${envPath} (${writeErr.message}), credentials preserved in memory and settings database.`);
      }

      // Enable board and persist credentials to settings.json
      const currSettings = settingsHelper.getSettings();
      currSettings.boards_enabled = currSettings.boards_enabled || {};
      currSettings.boards_enabled.adzuna = true;
      currSettings.api_keys = currSettings.api_keys || {};
      currSettings.api_keys.adzuna = { ADZUNA_APP_ID: appId, ADZUNA_APP_KEY: appKey };
      settingsHelper.updateSettings(currSettings);

      return res.json({ success: true, message: 'Adzuna API credentials verified and activated!', board: 'adzuna' });
    }

    if (board === 'usajobs') {
      const apiKey = (credentials.USAJOBS_API_KEY || '').trim();
      const userAgent = (credentials.USAJOBS_USER_AGENT || '').trim() || process.env.SMTP_USER || 'candidate@jobryt.ai';
      if (!apiKey) {
        return res.status(400).json({ success: false, error: 'USAJOBS Authorization Key is required.' });
      }

      try {
        const testUrl = `https://data.usajobs.gov/api/search?ResultsPerPage=1`;
        const testRes = await fetch(testUrl, {
          headers: { 'Authorization-Key': apiKey, 'User-Agent': userAgent, 'Host': 'data.usajobs.gov' },
          signal: AbortSignal.timeout(6000)
        });
        if (!testRes.ok) {
          return res.status(400).json({ success: false, error: `USAJOBS API returned authentication error (HTTP ${testRes.status}). Please verify your Authorization Key.` });
        }
      } catch (probeErr) {
        return res.status(400).json({ success: false, error: `Could not verify USAJOBS credentials: ${probeErr.message}` });
      }

      process.env.USAJOBS_API_KEY = apiKey;
      if (userAgent) process.env.USAJOBS_USER_AGENT = userAgent;

      const envPath = path.join(rootDir, '.env');
      try {
        let lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split('\n') : [];
        [['USAJOBS_API_KEY', apiKey], ['USAJOBS_USER_AGENT', userAgent]].forEach(([k, v]) => {
          let found = false;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith(`${k}=`)) { lines[i] = `${k}=${v}`; found = true; break; }
          }
          if (!found) lines.push(`${k}=${v}`);
        });
        fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
      } catch (writeErr) {
        console.warn(`[Settings] Notice: Could not persist to ${envPath} (${writeErr.message}), credentials preserved in memory and settings database.`);
      }

      const currSettings = settingsHelper.getSettings();
      currSettings.boards_enabled = currSettings.boards_enabled || {};
      currSettings.boards_enabled.usajobs = true;
      currSettings.api_keys = currSettings.api_keys || {};
      currSettings.api_keys.usajobs = { USAJOBS_API_KEY: apiKey, USAJOBS_USER_AGENT: userAgent };
      settingsHelper.updateSettings(currSettings);

      return res.json({ success: true, message: 'USAJOBS API key verified and activated!', board: 'usajobs' });
    }

    // Generic boards without specific probe
    return res.json({ success: true, message: `Board ${board} credentials recorded.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = { router };
