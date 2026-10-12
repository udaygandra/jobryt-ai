const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseWorkModes,
  isRemoteOnly,
  clampRadiusKm,
  kmToMiles,
  freshnessDays,
  freshnessToLinkedIn,
  snapLinkedInDistance,
  coreTitle,
  redact,
  buildAdzuna,
  buildLinkedIn,
  buildJobBank,
  buildIndeed,
  buildUSAJobs,
  classifyWorkMode
} = require('../scripts/engine/board-requests');

describe('board-requests pure unit tests', () => {
  test('clampRadiusKm and kmToMiles conversion', () => {
    assert.strictEqual(clampRadiusKm(25), 25);
    assert.strictEqual(clampRadiusKm(-5), 0);
    assert.strictEqual(clampRadiusKm(150), 100);
    assert.strictEqual(clampRadiusKm('bad'), 25);
    assert.strictEqual(kmToMiles(25), 16);
    assert.strictEqual(snapLinkedInDistance(25), 25); // 16 miles snaps to 25
  });

  test('freshness mappings for hours to days and LinkedIn codes', () => {
    assert.strictEqual(freshnessDays(24), 1);
    assert.strictEqual(freshnessDays(72), 3);
    assert.strictEqual(freshnessDays(0), null);
    assert.strictEqual(freshnessToLinkedIn(24), 'r86400');
    assert.strictEqual(freshnessToLinkedIn(72), 'r259200');
    assert.strictEqual(freshnessToLinkedIn(168), 'r604800');
    assert.strictEqual(freshnessToLinkedIn(0), '');
  });

  test('coreTitle strips seniority words for recall', () => {
    assert.strictEqual(coreTitle('Senior Data Analyst'), 'Data Analyst');
    assert.strictEqual(coreTitle('Lead Software Engineer'), 'Software Engineer');
    assert.strictEqual(coreTitle('Junior Developer'), 'Developer');
    assert.strictEqual(coreTitle('Data Analyst'), 'Data Analyst');
  });

  test('redact hides credentials in URLs', () => {
    const url = 'https://api.adzuna.com/v1/api/jobs/ca/search/1?app_id=123&app_key=SECRET_KEY&what=test';
    const clean = redact(url);
    assert.strictEqual(clean.includes('SECRET_KEY'), false);
    assert.strictEqual(clean.includes('app_key=***'), true);
  });

  test('buildAdzuna with local commute radius and freshness', () => {
    const ctx = {
      role: 'Senior Data Analyst',
      loc: 'Toronto, ON',
      cityQuery: 'Toronto',
      workType: 'Hybrid & Remote',
      radiusKm: 25,
      freshnessHours: 72
    };
    const reqs = buildAdzuna(ctx, { appId: 'id1', appKey: 'key1', countryCode: 'ca', pages: 2 });
    assert.strictEqual(reqs.length, 2);
    assert.strictEqual(reqs[0].url.includes('what=Data%20Analyst'), true);
    assert.strictEqual(reqs[0].url.includes('where=Toronto'), true);
    assert.strictEqual(reqs[0].url.includes('distance=25'), true);
    assert.strictEqual(reqs[0].url.includes('max_days_old=3'), true);
    assert.strictEqual(reqs[0].safeUrl.includes('key1'), false);
  });

  test('buildAdzuna with Remote-only omits where and distance', () => {
    const ctx = {
      role: 'Data Analyst',
      loc: 'Toronto, ON',
      cityQuery: 'Toronto',
      workType: 'Remote',
      radiusKm: 25,
      freshnessHours: 72
    };
    const reqs = buildAdzuna(ctx, { appId: 'id1', appKey: 'key1', countryCode: 'ca', pages: 1 });
    assert.strictEqual(reqs.length, 1);
    assert.strictEqual(reqs[0].url.includes('where='), false);
    assert.strictEqual(reqs[0].url.includes('distance='), false);
  });

  test('buildAdzuna with radius 0 omits distance param (exact city)', () => {
    const ctx = {
      role: 'Data Analyst',
      loc: 'Toronto, ON',
      cityQuery: 'Toronto',
      workType: 'Onsite',
      radiusKm: 0,
      freshnessHours: 24
    };
    const reqs = buildAdzuna(ctx, { appId: 'id1', appKey: 'key1', countryCode: 'ca', pages: 1 });
    assert.strictEqual(reqs[0].url.includes('where=Toronto'), true);
    assert.strictEqual(reqs[0].url.includes('distance='), false);
  });

  test('buildLinkedIn builds proper variants for Hybrid & Remote', () => {
    const ctx = {
      role: 'Data Analyst',
      loc: 'Toronto, ON',
      cityQuery: 'Toronto, ON',
      scope: 'CA',
      workType: 'Hybrid & Remote',
      radiusKm: 25,
      freshnessHours: 72
    };
    const variants = buildLinkedIn(ctx, { pages: 2 });
    // Expect two variants: remote and hybrid
    const modes = variants.map(v => v.mode);
    assert.strictEqual(modes.includes('remote'), true);
    assert.strictEqual(modes.includes('hybrid'), true);

    const remoteVariant = variants.find(v => v.mode === 'remote');
    assert.strictEqual(remoteVariant.urls[0].includes('f_WT=2'), true);
    assert.strictEqual(remoteVariant.urls[0].includes('location=Canada'), true);
    assert.strictEqual(remoteVariant.urls[0].includes('f_TPR=r259200'), true);

    const hybridVariant = variants.find(v => v.mode === 'hybrid');
    assert.strictEqual(hybridVariant.urls[0].includes('f_WT=3'), true);
    assert.strictEqual(hybridVariant.urls[0].includes('location=Toronto%2C%20ON'), true);
  });

  test('buildJobBank creates local and remote URLs', () => {
    const ctx = {
      role: 'Data Analyst II',
      loc: 'Toronto, ON',
      cityQuery: 'Toronto',
      workType: 'Hybrid & Remote'
    };
    const reqs = buildJobBank(ctx);
    assert.strictEqual(reqs.length, 2);
    assert.strictEqual(reqs[0].url.includes('searchstring=Data%20Analyst'), true);
    assert.strictEqual(reqs[0].url.includes('locationstring=Toronto'), true);
    assert.strictEqual(reqs[1].url.includes('locationstring=Canada'), true);
  });

  test('buildUSAJobs respects remote and location settings', () => {
    const ctx = {
      role: 'Program Analyst',
      loc: 'Washington, DC',
      workType: 'Hybrid & Remote',
      radiusKm: 25,
      freshnessHours: 72
    };
    const reqs = buildUSAJobs(ctx);
    assert.strictEqual(reqs[0].url.includes('Keyword=Program%20Analyst'), true);
    assert.strictEqual(reqs[0].url.includes('LocationName=Washington%2C%20DC'), true);
    assert.strictEqual(reqs[0].url.includes('Radius=16'), true);
    assert.strictEqual(reqs[0].url.includes('DatePosted=3'), true);
  });

  test('classifyWorkMode shared classifier handles hybrid, remote, and onsite correctly', () => {
    // 1. Hybrid mentions win over remote keywords
    assert.strictEqual(
      classifyWorkMode('Data Analyst', 'Vancouver, BC', 'Role is hybrid with 2 in-office and 3 remote days in Vancouver.'),
      'hybrid'
    );
    // 2. Pure remote
    assert.strictEqual(
      classifyWorkMode('Senior Data Analyst (Remote)', 'Toronto, ON', '100% remote across Canada.'),
      'remote'
    );
    // 3. Negative remote
    assert.strictEqual(
      classifyWorkMode('Data Analyst', 'Toronto, ON', 'On-site only. No remote or work from home permitted.'),
      'onsite'
    );
    // 4. Default / unknown
    assert.strictEqual(
      classifyWorkMode('Data Analyst', 'Toronto, ON', 'Perform reporting and SQL data analysis.'),
      'unknown'
    );
  });
});
