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

// POST /api/settings
router.post('/', (req, res) => {
  try {
    const newSettings = req.body;
    const updated = settingsHelper.updateSettings(newSettings);
    res.json({ success: true, settings: updated });
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

    fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
    res.json({ success: true, message: 'Configuration saved to .env and loaded into memory' });
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

      // Save to process.env and .env
      process.env.ADZUNA_APP_ID = appId;
      process.env.ADZUNA_APP_KEY = appKey;
      
      const envPath = path.join(rootDir, '.env');
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

      // Enable board
      const currSettings = settingsHelper.getSettings();
      currSettings.boards_enabled = currSettings.boards_enabled || {};
      currSettings.boards_enabled.adzuna = true;
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
      let lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split('\n') : [];
      [['USAJOBS_API_KEY', apiKey], ['USAJOBS_USER_AGENT', userAgent]].forEach(([k, v]) => {
        let found = false;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith(`${k}=`)) { lines[i] = `${k}=${v}`; found = true; break; }
        }
        if (!found) lines.push(`${k}=${v}`);
      });
      fs.writeFileSync(envPath, lines.join('\n'), 'utf8');

      const currSettings = settingsHelper.getSettings();
      currSettings.boards_enabled = currSettings.boards_enabled || {};
      currSettings.boards_enabled.usajobs = true;
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
