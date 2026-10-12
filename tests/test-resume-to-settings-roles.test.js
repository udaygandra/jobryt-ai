const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { normalizeProfileFields } = require('../scripts/engine/resume-to-profile');
const { extractResumeLocallyFromText } = require('../scripts/engine/local-resume-extractor');
const { syncProfileToSettings, getSettings } = require('../scripts/core/settings-helper');

const settingsPath = path.join(__dirname, '..', 'data', 'config', 'settings.json');

describe('End-to-End Resume Upload to Settings Sync (Plan 25.3)', () => {
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

  test('Single-prompt resume extraction seamlessly populates profile and settings with authentic market roles', () => {
    const resumeText = `
Alex Mercer
alex.mercer@example.com | +1 416-555-0199 | Toronto, ON, Canada
linkedin.com/in/alexmercer | github.com/alexmercer

PROFESSIONAL SUMMARY
Experienced Data Analyst with 5 years of experience delivering BI solutions, complex SQL pipelines, and executive dashboards across retail banking.

TECHNICAL SKILLS
Languages: SQL, Python
BI Tools: Power BI, Tableau, DAX
Databases: PostgreSQL, Snowflake, BigQuery
Data Engineering: ETL, dbt, Airflow

WORK EXPERIENCE
Data Analyst II
TD Bank – Toronto, ON, Canada
March 2021 – Present
• Designed 14 interactive Power BI dashboards reducing executive reporting latency by 45%.
• Authored optimized SQL queries and ETL transformations in Snowflake for credit risk analysis.
• Partnered with product owners to define KPI metrics and self-service analytics models.

Junior BI Developer
Scotiabank – Toronto, ON, Canada
January 2019 – February 2021
• Maintained enterprise data warehouse pipelines and automated daily ETL refreshes using SQL.
• Created Tableau workbooks and ad-hoc operational reports for mortgage operations.

EDUCATION
Bachelor of Science in Computer Science
University of Toronto – Toronto, ON, Canada
2015 – 2019
`;

    // 1. Parse locally / normalize
    const parsed = extractResumeLocallyFromText(resumeText);
    assert.ok(parsed, 'Resume should parse successfully');
    assert.equal(parsed.name, 'Alex Mercer');
    assert.equal(parsed.contact.email, 'alex.mercer@example.com');
    assert.equal(parsed.contact.location, 'Toronto, ON, Canada');
    assert.equal(parsed.contact.country_code, 'CA');

    // 2. Normalize profile fields
    const normalized = normalizeProfileFields(parsed);
    assert.ok(Array.isArray(normalized.target_titles));
    assert.ok(normalized.target_titles.length >= 2 && normalized.target_titles.length <= 10);

    // Verify zero seniority inflation: Mid-level candidate must not receive Director/Lead/VP
    const inflatedRegex = /\b(?:Director|VP|Vice President|Head of|Chief|Partner)\b/i;
    for (const title of normalized.target_titles) {
      assert.ok(!inflatedRegex.test(title), `Title "${title}" must not be inflated`);
    }

    // 3. Sync to Settings
    const updatedSettings = syncProfileToSettings(normalized);
    assert.ok(Array.isArray(updatedSettings.target_roles));
    assert.ok(updatedSettings.target_roles.length <= 10);
    assert.equal(updatedSettings.country_scope, 'CA');
    assert.ok(updatedSettings.target_locations.some(l => l.includes('Toronto')));

    // 4. Validate settings.json persistence on disk
    const diskSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.deepEqual(diskSettings.target_roles, updatedSettings.target_roles);
    assert.equal(diskSettings.country_scope, 'CA');
    assert.deepEqual(diskSettings.target_locations, updatedSettings.target_locations);
  });
});
