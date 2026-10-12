const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { normalizeProfileFields, SYSTEM_PROMPT } = require('../scripts/engine/resume-to-profile');

describe('Unified Resume Parser & Market Target Roles (Plan 25.1)', () => {
  test('SYSTEM_PROMPT and resume-parser.txt contain market role discovery and country rules', () => {
    const promptFile = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'resume-parser.txt'), 'utf8');
    assert.match(promptFile, /MARKET-VALIDATED TARGET TITLES DISCOVERY/i);
    assert.match(promptFile, /ZERO SENIORITY INFLATION/i);
    assert.match(promptFile, /STRICT NON-PADDING/i);
    assert.match(promptFile, /country_code/i);
    assert.match(SYSTEM_PROMPT, /country_code/i);
  });

  test('normalizeProfileFields normalizes and caps target_titles at 10 without padding', () => {
    const input = {
      name: 'John Doe',
      target_titles: [
        'Data Analyst',
        'Business Intelligence Analyst',
        'data analyst', // duplicate
        'Power BI Developer',
        'Reporting Analyst',
        'Analytics Engineer',
        'Tableau Developer',
        'Senior Data Analyst',
        'BI Specialist',
        'Financial Data Analyst',
        'Operations Analyst',
        'Database Analyst', // 11th - should be truncated
        'Data Ninja' // Banned buzzword
      ],
      contact: { location: 'Austin, TX, USA' },
      experience: []
    };

    const normalized = normalizeProfileFields(input);
    assert.ok(Array.isArray(normalized.target_titles));
    assert.equal(normalized.target_titles.length, 10);
    assert.equal(normalized.target_titles[0], 'Data Analyst');
    assert.ok(!normalized.target_titles.some(t => /ninja/i.test(t)));
    assert.equal(normalized.target_roles.length, 10);
    assert.equal(normalized.role, 'Data Analyst');
  });

  test('normalizeProfileFields preserves natural count when fewer than 10 roles (no padding)', () => {
    const input = {
      name: 'Jane Smith',
      target_titles: [
        'Cloud Solutions Architect',
        'AWS Solutions Architect',
        'Infrastructure Engineer'
      ],
      contact: { location: 'Toronto, ON, Canada' },
      experience: []
    };

    const normalized = normalizeProfileFields(input);
    assert.ok(normalized.target_titles.length >= 3 && normalized.target_titles.length <= 10, 'Should have 3-10 market titles');
    assert.ok(normalized.target_titles.includes('Cloud Solutions Architect'));
    assert.ok(normalized.target_titles.includes('AWS Solutions Architect'));
    assert.ok(normalized.target_titles.includes('Infrastructure Engineer'));
    assert.equal(normalized.role, 'Cloud Solutions Architect');
  });

  test('normalizeProfileFields falls back to experience roles if target_titles is empty', () => {
    const input = {
      name: 'Alice Wong',
      target_titles: [],
      experience: [
        { role: 'Full Stack Engineer', company: 'Acme Corp' },
        { role: 'Frontend Developer', company: 'Beta LLC' },
        { role: 'Full Stack Engineer', company: 'Alpha Inc' } // duplicate role
      ],
      contact: { location: 'London, UK' }
    };

    const normalized = normalizeProfileFields(input);
    assert.ok(normalized.target_titles.length >= 2 && normalized.target_titles.length <= 10, 'Should expand experience roles into market titles');
    assert.ok(normalized.target_titles.includes('Full Stack Engineer'));
    assert.ok(normalized.target_titles.includes('Frontend Developer'));
    assert.equal(normalized.role, 'Full Stack Engineer');
  });

  test('normalizeProfileFields synchronizes country_code from location if not explicitly provided', () => {
    const usProfile = normalizeProfileFields({
      name: 'Bob US',
      target_titles: ['DevOps Engineer'],
      contact: { location: 'Seattle, WA, USA' }
    });
    assert.equal(usProfile.country_code, 'US');
    assert.equal(usProfile.contact.country_code, 'US');

    const caProfile = normalizeProfileFields({
      name: 'Claire CA',
      target_titles: ['DevOps Engineer'],
      contact: { location: 'Vancouver, BC, Canada' }
    });
    assert.equal(caProfile.country_code, 'CA');
    assert.equal(caProfile.contact.country_code, 'CA');
  });

  test('normalizeProfileFields respects explicit contact.country_code', () => {
    const profile = normalizeProfileFields({
      name: 'Dev India',
      target_titles: ['Software Engineer'],
      contact: { location: 'Bengaluru', country_code: 'IN' }
    });
    assert.equal(profile.country_code, 'IN');
    assert.equal(profile.contact.country_code, 'IN');
  });
});
