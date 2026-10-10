const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');

test('Phase 30: True Full Reset Engine, Settings Persistence & Pre-Scan Validation Guardrails', async (t) => {
  const rootDir = path.join(__dirname, '..');
  const profilesDir = path.join(rootDir, 'data', 'profiles');
  const configDir = path.join(rootDir, 'data', 'config');
  const trackingDir = path.join(rootDir, 'data', 'tracking');
  const masterProfilePath = path.join(profilesDir, 'master-profile.json');
  const settingsJsonPath = path.join(configDir, 'settings.json');
  const lastScanJsonPath = path.join(trackingDir, 'last_scan_result.json');

  // Backup original state before running stateful tests
  const originalProfile = fs.existsSync(masterProfilePath) ? fs.readFileSync(masterProfilePath, 'utf8') : null;
  const originalSettings = fs.existsSync(settingsJsonPath) ? fs.readFileSync(settingsJsonPath, 'utf8') : null;

  t.after(() => {
    // Restore original state
    if (originalProfile !== null) {
      fs.writeFileSync(masterProfilePath, originalProfile, 'utf8');
    }
    if (originalSettings !== null) {
      fs.writeFileSync(settingsJsonPath, originalSettings, 'utf8');
    }
  });

  await t.test('Test 1: Full Reset wipes master-profile, uploaded resumes, job records, and resets settings without scanning', async () => {
    // Seed dummy profile, dummy resume file, and dummy tracking files
    if (!fs.existsSync(profilesDir)) fs.mkdirSync(profilesDir, { recursive: true });
    if (!fs.existsSync(trackingDir)) fs.mkdirSync(trackingDir, { recursive: true });

    const dummyProfile = {
      name: 'Jane Doe',
      role: 'Staff Platform Engineer',
      skills: ['Kubernetes', 'Go', 'Terraform'],
      experience: [{ title: 'Staff Engineer', company: 'TechCorp' }],
      target_titles: ['Staff Platform Engineer'],
      locations: ['San Francisco, CA']
    };
    fs.writeFileSync(masterProfilePath, JSON.stringify(dummyProfile, null, 2), 'utf8');

    const dummyResumePath = path.join(profilesDir, 'upload-temp-test-resume.pdf');
    fs.writeFileSync(dummyResumePath, 'fake-pdf-content', 'utf8');

    fs.writeFileSync(lastScanJsonPath, JSON.stringify({ scanId: 'scan-old', status: 'completed' }), 'utf8');

    // Mount settings router
    const { router: settingsRouter } = require('../src/routes/settings');
    const app = express();
    app.use(express.json());
    app.use('/api/settings', settingsRouter);

    const server = http.createServer(app);
    await new Promise((res) => server.listen(0, res));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}/api/settings`;

    try {
      const resetRes = await fetch(`${baseUrl}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fresh_start' })
      });
      assert.equal(resetRes.status, 200, 'Reset request must succeed with 200');
      const resetData = await resetRes.json();
      assert.equal(resetData.success, true, 'Reset success flag must be true');

      // Verify master-profile.json is wiped to clean template
      const wipedProfile = JSON.parse(fs.readFileSync(masterProfilePath, 'utf8'));
      assert.equal(wipedProfile.name, '', 'Candidate name must be wiped');
      assert.equal(wipedProfile.role, '', 'Candidate role must be wiped');
      assert.deepEqual(wipedProfile.skills, [], 'Skills array must be empty');
      assert.deepEqual(wipedProfile.experience, [], 'Experience array must be empty');

      // Verify dummy resume file was unlinked
      assert.equal(fs.existsSync(dummyResumePath), false, 'Uploaded resume files must be deleted');

      // Verify last_scan_result.json was wiped
      assert.equal(fs.existsSync(lastScanJsonPath), false, 'last_scan_result.json must be removed');

      // Verify settings.json was reset to empty titles/locations
      const wipedSettings = JSON.parse(fs.readFileSync(settingsJsonPath, 'utf8'));
      assert.deepEqual(wipedSettings.target_titles, [], 'Settings target_titles must be empty');
      assert.deepEqual(wipedSettings.locations, [], 'Settings locations must be empty');
      assert.equal(wipedSettings.country_scope, 'AUTO', 'Settings country_scope must default to AUTO');
    } finally {
      server.close();
    }
  });

  await t.test('Test 2: Modifying target roles, country scope, and cities in POST /api/settings persists to disk and maintains bidirectional integrity', async () => {
    const { router: settingsRouter } = require('../src/routes/settings');
    const app = express();
    app.use(express.json());
    app.use('/api/settings', settingsRouter);

    const server = http.createServer(app);
    await new Promise((res) => server.listen(0, res));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}/api/settings`;

    try {
      const updatePayload = {
        target_titles: ['Senior Cloud Architect', 'Site Reliability Engineer'],
        locations: ['Toronto, ON', 'Vancouver, BC'],
        country_scope: 'CA',
        score_threshold: 80
      };

      const saveRes = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      });
      assert.equal(saveRes.status, 200, 'Saving settings must succeed');
      const savedData = await saveRes.json();
      assert.equal(savedData.success, true);

      // Verify settings on disk
      const diskSettings = JSON.parse(fs.readFileSync(settingsJsonPath, 'utf8'));
      assert.deepEqual(diskSettings.target_titles, ['Senior Cloud Architect', 'Site Reliability Engineer']);
      assert.deepEqual(diskSettings.target_roles, ['Senior Cloud Architect', 'Site Reliability Engineer'], 'target_roles must synchronize with target_titles');
      assert.deepEqual(diskSettings.locations, ['Toronto, ON', 'Vancouver, BC']);
      assert.deepEqual(diskSettings.target_locations, ['Toronto, ON', 'Vancouver, BC'], 'target_locations must synchronize with locations');
      assert.equal(diskSettings.country_scope, 'CA');
      assert.equal(diskSettings.score_threshold, 80);
    } finally {
      server.close();
    }
  });

  await t.test('Test 3: Pre-scan validation on backend blocks scan with HTTP 422 if criteria missing', async () => {
    const { router: pipelineRouter, validateScanCriteria } = require('../src/routes/pipeline');
    assert.equal(typeof validateScanCriteria, 'function', 'validateScanCriteria must be exported');

    // 1. Direct unit test of validateScanCriteria with empty parameters
    const emptyCheck = validateScanCriteria({
      targetTitles: [],
      targetLocations: [],
      boardsEnabled: {},
      profile: {}
    });
    assert.equal(emptyCheck.isValid, false, 'Validation with empty criteria must fail');
    assert.equal(emptyCheck.errors.length, 4, 'Must identify 4 missing fields: roles, locations, boards, profile');
    const errorFields = emptyCheck.errors.map(e => e.field);
    assert.ok(errorFields.includes('roles'), 'Must flag missing roles');
    assert.ok(errorFields.includes('locations'), 'Must flag missing locations');
    assert.ok(errorFields.includes('boards'), 'Must flag disabled boards');
    assert.ok(errorFields.includes('profile'), 'Must flag empty profile');

    // 2. Integration test through Express HTTP endpoints
    // Temporarily factory reset settings and profile to simulate unconfigured state
    fs.writeFileSync(masterProfilePath, JSON.stringify({ name: '', role: '', skills: [], experience: [] }, null, 2), 'utf8');
    const settingsHelper = require('../scripts/core/settings-helper');
    settingsHelper.factoryResetSettings();

    const app = express();
    app.use(express.json());
    app.use('/api/pipeline', pipelineRouter);

    const server = http.createServer(app);
    await new Promise((res) => server.listen(0, res));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}/api/pipeline`;

    try {
      // Test GET /api/pipeline/validate
      const valRes = await fetch(`${baseUrl}/validate`);
      assert.equal(valRes.status, 200, 'GET /validate must return 200');
      const valData = await valRes.json();
      assert.equal(valData.isValid, false, 'GET /validate must return isValid: false for blank setup');
      assert.ok(valData.errors.length > 0, 'GET /validate must return error items');

      // Test POST /api/pipeline/run returning 422
      const runRes = await fetch(`${baseUrl}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      assert.equal(runRes.status, 422, 'POST /run must return HTTP 422 Unprocessable Entity when validation fails');
      const runData = await runRes.json();
      assert.equal(runData.status, 'validation_failed', 'Status must be validation_failed');
      assert.ok(Array.isArray(runData.validationErrors), 'Must return validationErrors array');
    } finally {
      server.close();
    }
  });

  await t.test('Test 4: Pre-scan validation passes when criteria are valid', async () => {
    const { validateScanCriteria, executePipelineScan } = require('../src/routes/pipeline');

    const validCheck = validateScanCriteria({
      targetTitles: ['Backend Engineer'],
      targetLocations: ['New York, NY'],
      boardsEnabled: { linkedin: true, indeed: true },
      profile: {
        role: 'Software Engineer',
        skills: ['Node.js', 'PostgreSQL']
      }
    });
    assert.equal(validCheck.isValid, true, 'Validation must pass when all 4 pillars are provided');
    assert.equal(validCheck.errors.length, 0, 'There should be 0 validation errors');

    // Test with injectedRawJobs (bypass network to verify execution gate allows pipeline flow)
    const scanResult = await executePipelineScan({
      targetTitles: ['Backend Engineer'],
      targetLocations: ['New York, NY'],
      injectedRawJobs: []
    });
    assert.notEqual(scanResult.status, 'validation_failed', 'Must not fail validation when valid criteria are present');
  });

  await t.test('Test 5: Frontend DOM elements exist in public/index.html', () => {
    const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');

    assert.match(html, /id="scan-validation-modal"/, 'Must contain #scan-validation-modal');
    assert.match(html, /id="scan-validation-checklist"/, 'Must contain #scan-validation-checklist');
    assert.match(html, /id="btn-fix-settings"/, 'Must contain #btn-fix-settings');
    assert.match(html, /id="btn-fix-profile"/, 'Must contain #btn-fix-profile');
    assert.match(html, /id="fresh-start-banner"/, 'Must contain #fresh-start-banner');
  });

  await t.test('Test 6: Frontend client script exports exist in opportunities.js and settings.js', () => {
    const oppJs = fs.readFileSync(path.join(rootDir, 'public', 'js', 'opportunities.js'), 'utf8');
    const settingsJs = fs.readFileSync(path.join(rootDir, 'public', 'js', 'settings.js'), 'utf8');

    assert.match(oppJs, /validateScanPreconditions/, 'opportunities.js must implement validateScanPreconditions');
    assert.match(oppJs, /showScanValidationModal/, 'opportunities.js must implement showScanValidationModal');
    assert.match(oppJs, /closeScanValidationModal/, 'opportunities.js must implement closeScanValidationModal');
    assert.match(oppJs, /goToSettingsFromValidation/, 'opportunities.js must implement goToSettingsFromValidation');
    assert.match(oppJs, /goToProfileFromValidation/, 'opportunities.js must implement goToProfileFromValidation');

    assert.match(settingsJs, /showFreshStartBanner/, 'settings.js must implement showFreshStartBanner');
  });
});
