const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { syncProfileToSettings, getSettings, updateSettings } = require('../scripts/core/settings-helper');
const settingsPath = path.join(__dirname, '..', 'data', 'config', 'settings.json');

describe('Automatic Resume-to-Settings Sync Engine (Plan 25.2)', () => {
  let originalSettingsContent = '';

  beforeEach(() => {
    if (fs.existsSync(settingsPath)) {
      originalSettingsContent = fs.readFileSync(settingsPath, 'utf8');
    }
  });

  afterEach(() => {
    if (originalSettingsContent) {
      fs.writeFileSync(settingsPath, originalSettingsContent, 'utf8');
    }
  });

  test('syncProfileToSettings updates target_roles with authentic candidate roles without padding', () => {
    const profile = {
      name: 'Sarah Connor',
      target_titles: [
        'Security Operations Analyst',
        'Cyber Threat Analyst',
        'SOC Analyst',
        'Information Security Specialist'
      ],
      locations: ['Austin, TX, USA'],
      country_code: 'US'
    };

    const synced = syncProfileToSettings(profile);
    assert.ok(Array.isArray(synced.target_roles));
    assert.equal(synced.target_roles.length, 4);
    assert.deepEqual(synced.target_roles, [
      'Security Operations Analyst',
      'Cyber Threat Analyst',
      'SOC Analyst',
      'Information Security Specialist'
    ]);
    assert.equal(synced.country_scope, 'US');
    assert.ok(synced.target_locations.includes('Austin, TX, USA'));
  });

  test('syncProfileToSettings enforces strict 10-role quota guardrail on overflow', () => {
    const profile = {
      name: 'Overloaded Roles',
      target_titles: [
        'Role 1', 'Role 2', 'Role 3', 'Role 4', 'Role 5',
        'Role 6', 'Role 7', 'Role 8', 'Role 9', 'Role 10',
        'Role 11', 'Role 12', 'Role 13'
      ],
      locations: ['Toronto, ON, Canada'],
      country_code: 'CA'
    };

    const synced = syncProfileToSettings(profile);
    assert.equal(synced.target_roles.length, 10);
    assert.equal(synced.target_roles[0], 'Role 1');
    assert.equal(synced.target_roles[9], 'Role 10');
    assert.equal(synced.country_scope, 'CA');
  });

  test('syncProfileToSettings filters out buzzword junk and deduplicates titles', () => {
    const profile = {
      name: 'Buzzword Candidate',
      target_titles: [
        'Data Analyst',
        'DATA ANALYST', // duplicate
        'Data Ninja', // banned buzzword
        'Rockstar Developer', // banned buzzword
        'BI Developer'
      ],
      locations: ['Seattle, WA, USA'],
      country_code: 'US'
    };

    const synced = syncProfileToSettings(profile);
    assert.ok(synced.target_roles.includes('Data Analyst'));
    assert.ok(synced.target_roles.includes('BI Developer'));
    assert.ok(!synced.target_roles.includes('Data Ninja'));
    assert.ok(!synced.target_roles.includes('Rockstar Developer'));
    assert.equal(synced.target_roles.filter(r => r.toLowerCase() === 'data analyst').length, 1);
  });

  test('syncProfileToSettings caps target_locations at 5', () => {
    const profile = {
      name: 'Nomad Candidate',
      target_titles: ['Software Engineer'],
      locations: ['City 1', 'City 2', 'City 3', 'City 4', 'City 5', 'City 6', 'City 7'],
      country_code: 'US'
    };

    const synced = syncProfileToSettings(profile);
    assert.equal(synced.target_locations.length, 5);
  });
});
