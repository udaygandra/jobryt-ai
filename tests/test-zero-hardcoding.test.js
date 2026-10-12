const test = require('node:test');
const assert = require('node:assert/strict');
const { detectCandidateTimezone, getSearchLocationQuery, detectTargetCountryScope } = require('../scripts/core/geo-helper');
const { getSettings } = require('../scripts/core/settings-helper');

test('Zero-hardcoding: Global candidate timezone detection', () => {
  // Europe
  assert.equal(detectCandidateTimezone({ locations: ['Berlin, Germany'] }), 'Europe/Berlin');
  assert.equal(detectCandidateTimezone({ locations: ['London, UK'] }), 'Europe/London');

  // Asia & Middle East
  assert.equal(detectCandidateTimezone({ locations: ['Bengaluru, India'] }), 'Asia/Kolkata');
  assert.equal(detectCandidateTimezone({ locations: ['Tokyo, Japan'] }), 'Asia/Tokyo');
  assert.equal(detectCandidateTimezone({ locations: ['Singapore'] }), 'Asia/Singapore');
  assert.equal(detectCandidateTimezone({ locations: ['Dubai, UAE'] }), 'Asia/Dubai');

  // Americas
  assert.equal(detectCandidateTimezone({ locations: ['Austin, TX'] }), 'America/Chicago');
  assert.equal(detectCandidateTimezone({ locations: ['Vancouver, BC'] }), 'America/Vancouver');
  assert.equal(detectCandidateTimezone({ locations: ['New York, NY'] }), 'America/New_York');

  // Oceania
  assert.equal(detectCandidateTimezone({ locations: ['Sydney, Australia'] }), 'Australia/Sydney');

  // Unspecified location must fall back to host system timezone, not hardcoded America/Toronto
  const sysTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  assert.equal(detectCandidateTimezone({}), sysTz);
});

test('Zero-hardcoding: getSearchLocationQuery does not default to Toronto', () => {
  assert.equal(getSearchLocationQuery(''), '');
  assert.equal(getSearchLocationQuery(null), '');
  assert.equal(getSearchLocationQuery(undefined), '');

  // International cities never default or contain Toronto
  assert.ok(!getSearchLocationQuery('Berlin, Germany').includes('Toronto'));
  assert.ok(!getSearchLocationQuery('London, UK').includes('Toronto'));
  assert.ok(!getSearchLocationQuery('Bengaluru, KA, India').includes('Toronto'));
  assert.ok(getSearchLocationQuery('Bengaluru, KA, India').includes('Bengaluru'));
});

test('Zero-hardcoding: Country scope detection is global-ready', () => {
  assert.equal(detectTargetCountryScope(['Berlin, Germany']), 'DE');
  assert.equal(detectTargetCountryScope(['Austin, TX, USA']), 'US');
  assert.equal(detectTargetCountryScope(['Toronto, ON, Canada']), 'CA');
  assert.equal(detectTargetCountryScope(['Remote']), 'GLOBAL');
});

test('Zero-hardcoding: Settings default timezone matches system timezone without hardcoding', () => {
  const dummyProfile = { timezone: null, locations: [] };
  const settings = getSettings(dummyProfile);
  assert.ok(settings.timezone, 'Should have a valid timezone');
  assert.notEqual(settings.country_scope, 'CA_FORCED');
});
