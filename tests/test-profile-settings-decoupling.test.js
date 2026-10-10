const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('Plan 28.1 - Profile vs Search Preferences Decoupling Verification', async (t) => {
  await t.test('index.html contains #prof-current-role and single resident location field', () => {
    const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // 1. Single current role / professional title input exists
    assert.match(html, /id="prof-current-role"/, 'Input prof-current-role must exist in Master Profile form');
    assert.match(html, /Current Role \/ Professional Title/, 'Label must read Current Role / Professional Title');

    // 2. Single resident location input exists
    assert.match(html, /id="prof-location"/, 'Input prof-location must exist for resident location');
    assert.match(html, /Current Resident City \/ Location/, 'Label must emphasize resident city / location');

    // 3. Multi-role comma-separated input must no longer exist in master profile form
    assert.doesNotMatch(html, /id="prof-target-roles"/, 'Legacy prof-target-roles input should not be in index.html');
  });

  await t.test('profile.js populates and synchronizes single current role and resident city', () => {
    const jsPath = path.join(__dirname, '..', 'public', 'js', 'profile.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    // 1. Populates prof-current-role
    assert.match(js, /document\.getElementById\('prof-current-role'\)\.value\s*=\s*currentRole/, 'populateProfileForm must set prof-current-role');

    // 2. syncFormToJson extracts currentRole to profile.role
    assert.match(js, /prof-current-role[\s\S]*?profile\.role\s*=\s*currentRole/, 'syncFormToJson must store single currentRole in profile.role');

    // 3. Validation targets prof-current-role
    assert.match(js, /field:\s*document\.getElementById\('prof-current-role'\)/, 'saveMasterProfile must validate prof-current-role');
  });

  await t.test('POST /api/settings does not mutate master-profile.json', () => {
    const settingsRoutePath = path.join(__dirname, '..', 'src', 'routes', 'settings.js');
    const code = fs.readFileSync(settingsRoutePath, 'utf8');

    // Ensure the sync block mutating master-profile.json is removed
    assert.doesNotMatch(code, /prof\.target_titles\s*=\s*newSettings\.target_titles/, 'POST /api/settings must not overwrite master-profile.json target_titles');
    assert.doesNotMatch(code, /prof\.locations\s*=\s*newSettings\.locations/, 'POST /api/settings must not overwrite master-profile.json locations');
  });

  await t.test('syncProfileToSettings routes 4-10 discovered roles to settings without altering candidate profile baseline', () => {
    const { syncProfileToSettings } = require('../scripts/core/settings-helper');
    const candidateProfile = {
      name: 'Taylor Developer',
      role: 'Full Stack Developer',
      contact: { location: 'Toronto, ON, Canada' },
      skills: ['JavaScript', 'TypeScript', 'Node.js', 'React', 'Docker', 'PostgreSQL'],
      experience: [
        { role: 'Full Stack Developer', company: 'TechWorks Inc.', dates: '2021 - Present' }
      ]
    };

    const synced = syncProfileToSettings(candidateProfile);
    assert.ok(Array.isArray(synced.target_roles), 'synced settings must contain target_roles array');
    assert.ok(synced.target_roles.length >= 4 && synced.target_roles.length <= 10, 'Must have 4-10 discovered market target roles');
    assert.ok(synced.target_roles.some(r => r.toLowerCase().includes('full stack') || r.toLowerCase().includes('software')), 'Must match candidate domain');
  });
});
