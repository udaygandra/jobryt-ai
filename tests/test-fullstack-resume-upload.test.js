const test = require('node:test');
const assert = require('node:assert/strict');
const { discoverMarketRoles } = require('../scripts/engine/market-role-discovery');
const { syncProfileToSettings, getSettings } = require('../scripts/core/settings-helper');
const { detectCandidateTimezone, detectTargetCountryScope } = require('../scripts/core/geo-helper');

test('Full Stack Developer resume discovery and settings synchronization', () => {
  const fullStackProfile = {
    name: 'Alex Chen',
    role: 'Full Stack Developer',
    headline: 'Full Stack Developer',
    total_experience_stated: '5+ years',
    years_of_experience: 5,
    contact: {
      email: 'alex.chen@example.com',
      location: 'Seattle, WA, USA',
      country_code: 'US'
    },
    locations: ['Seattle, WA, USA', 'Remote'],
    skills: ['JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'Express', 'PostgreSQL', 'Docker', 'AWS'],
    summary: 'Full Stack Developer with 5+ years building distributed cloud applications with React and Node.js.',
    experience: [
      {
        role: 'Full Stack Developer',
        company: 'CloudScale Technologies',
        dates: '2021 - Present',
        bullets: ['Architected React and Node.js microservices with PostgreSQL on AWS.']
      }
    ]
  };

  // 1. Discover roles
  const roles = discoverMarketRoles([fullStackProfile.role], fullStackProfile);
  assert.ok(roles.length >= 6 && roles.length <= 10, `Expected 6 to 10 roles, got ${roles.length}`);
  assert.ok(roles.includes('Full Stack Developer'));
  assert.ok(roles.includes('Software Engineer'));
  assert.ok(roles.includes('Frontend Developer'));
  assert.ok(roles.includes('Backend Developer'));
  assert.ok(roles.includes('React Developer'));
  assert.ok(roles.includes('Node.js Developer'));

  // Zero hardcoded Data Analyst or Toronto bias
  assert.ok(!roles.includes('Data Analyst'), 'Must not invent Data Analyst for Full Stack Developer');
  assert.ok(!roles.includes('Power BI Developer'), 'Must not invent Power BI Developer for Full Stack Developer');

  // 2. Synchronize to Settings
  fullStackProfile.target_titles = roles;
  const synced = syncProfileToSettings(fullStackProfile);

  assert.ok(Array.isArray(synced.target_roles) && synced.target_roles.length >= 6);
  assert.equal(synced.country_scope, 'US');

  // 3. Timezone detection
  const detectedTz = detectCandidateTimezone(fullStackProfile);
  assert.equal(detectedTz, 'America/Los_Angeles');

  // 4. Country scope detection
  const detectedCountry = detectTargetCountryScope(fullStackProfile.locations);
  assert.equal(detectedCountry, 'US');
});
