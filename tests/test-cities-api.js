/**
 * tests/test-cities-api.js
 * Comprehensive integration tests for multi-country cities dataset & /api/settings/cities endpoint
 * validating Tier 1, Tier 2, and Tier 3 cities across all supported markets.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

async function runTests() {
  console.log('\n======================================================');
  console.log('🌍 TESTING MULTI-COUNTRY TIER 1, 2, 3 CITIES DATASET & API');
  console.log('======================================================\n');

  // 1. Test Static JSON Datasets Integrity
  console.log('1. Checking local JSON datasets on disk...');
  const globalPath = path.resolve(__dirname, '../public/data/global-cities.json');
  const canadaPath = path.resolve(__dirname, '../public/data/canada-cities.json');

  assert.ok(fs.existsSync(globalPath), 'public/data/global-cities.json must exist');
  assert.ok(fs.existsSync(canadaPath), 'public/data/canada-cities.json must exist');

  const globalData = JSON.parse(fs.readFileSync(globalPath, 'utf8'));
  const canadaData = JSON.parse(fs.readFileSync(canadaPath, 'utf8'));

  assert.ok(Array.isArray(canadaData) && canadaData.length >= 40, 'canada-cities.json must contain at least 40 cities');
  assert.ok(globalData.total_countries >= 18, 'global-cities.json must cover at least 18 supported countries');
  assert.ok(globalData.all.length >= 500, `global-cities.json must have at least 500 unique city entries, got ${globalData.all.length}`);

  const requiredCountries = ['US', 'GB', 'CA', 'DE', 'AU', 'FR', 'IN', 'NL', 'AE', 'SG', 'JP', 'BR', 'IT', 'PL', 'ZA', 'AT', 'NZ', 'MX'];
  for (const code of requiredCountries) {
    const entry = globalData.by_country[code];
    assert.ok(entry, `Country ${code} must be present in by_country`);
    assert.ok(Array.isArray(entry.cities) && entry.cities.length >= 10, `${code} must have at least 10 cities`);
    assert.ok(Array.isArray(entry.popular_hubs) && entry.popular_hubs.length >= 3, `${code} must have popular hubs`);
    assert.ok(entry.counts && entry.counts.tier1 > 0, `${code} must have tier 1 cities`);
    assert.ok(entry.counts && entry.counts.tier2 > 0, `${code} must have tier 2 cities`);
  }
  console.log(`  ✔ Verified 18+ countries with ${globalData.all.length} total global cities covering Tiers 1, 2, and 3\n`);

  // 2. Test API Endpoints
  console.log('2. Querying GET /api/settings/cities across markets...');

  // Test Canada (CA)
  const resCA = await fetch(`${BASE_URL}/api/settings/cities?country=CA`);
  assert.strictEqual(resCA.status, 200, 'GET /api/settings/cities?country=CA should return 200');
  const dataCA = await resCA.json();
  assert.strictEqual(dataCA.success, true);
  assert.strictEqual(dataCA.country, 'CA');
  assert.ok(dataCA.cities.some(c => c.includes('Toronto')));
  assert.ok(dataCA.cities.some(c => c.includes('Guelph') || c.includes('Barrie')), 'CA should include Tier 3 cities');
  assert.ok(dataCA.popular_hubs.some(h => h.includes('Toronto')));
  assert.ok(dataCA.by_tier && dataCA.by_tier.tier1.length > 0);
  assert.ok(dataCA.by_tier && dataCA.by_tier.tier3.length > 0);
  console.log(`  ✔ Canada (CA): ${dataCA.total} cities returned (T1: ${dataCA.by_tier.tier1.length}, T2: ${dataCA.by_tier.tier2.length}, T3: ${dataCA.by_tier.tier3.length})`);

  // Test United States (US)
  const resUS = await fetch(`${BASE_URL}/api/settings/cities?country=US`);
  assert.strictEqual(resUS.status, 200);
  const dataUS = await resUS.json();
  assert.strictEqual(dataUS.success, true);
  assert.strictEqual(dataUS.country, 'US');
  assert.ok(dataUS.cities.some(c => c.includes('New York') || c.includes('San Francisco')));
  assert.ok(dataUS.cities.some(c => c.includes('Austin')));
  assert.ok(dataUS.cities.some(c => c.includes('Boise') || c.includes('Boulder')), 'US should include Tier 3 cities');
  console.log(`  ✔ United States (US): ${dataUS.total} cities returned (T1: ${dataUS.by_tier.tier1.length}, T2: ${dataUS.by_tier.tier2.length}, T3: ${dataUS.by_tier.tier3.length})`);

  // Test India (IN)
  const resIN = await fetch(`${BASE_URL}/api/settings/cities?country=IN`);
  assert.strictEqual(resIN.status, 200);
  const dataIN = await resIN.json();
  assert.strictEqual(dataIN.success, true);
  assert.strictEqual(dataIN.country, 'IN');
  assert.ok(dataIN.cities.some(c => c.includes('Bengaluru') || c.includes('Hyderabad')));
  assert.ok(dataIN.cities.some(c => c.includes('Jaipur') || c.includes('Coimbatore')));
  assert.ok(dataIN.cities.some(c => c.includes('Mysore') || c.includes('Warangal')), 'IN should include Tier 3 cities');
  console.log(`  ✔ India (IN): ${dataIN.total} cities returned (T1: ${dataIN.by_tier.tier1.length}, T2: ${dataIN.by_tier.tier2.length}, T3: ${dataIN.by_tier.tier3.length})`);

  // Test Tier Query Filter: ?country=IN&tier=1
  const resTier1 = await fetch(`${BASE_URL}/api/settings/cities?country=IN&tier=1`);
  assert.strictEqual(resTier1.status, 200);
  const dataTier1 = await resTier1.json();
  assert.strictEqual(dataTier1.success, true);
  assert.strictEqual(dataTier1.cities.length, 8, 'India has 8 primary Tier 1 mega cities');
  assert.ok(dataTier1.cities.some(c => c.includes('Bengaluru')));
  assert.ok(!dataTier1.cities.some(c => c.includes('Mysore')), 'Tier 1 query must exclude Tier 3 cities');
  console.log(`  ✔ Tier 1 Filter (?tier=1): Correctly isolated ${dataTier1.cities.length} top mega hubs`);

  // Test Text Search Query: ?q=Mysore
  const resSearch = await fetch(`${BASE_URL}/api/settings/cities?q=Mysore`);
  assert.strictEqual(resSearch.status, 200);
  const dataSearch = await resSearch.json();
  assert.strictEqual(dataSearch.success, true);
  assert.ok(dataSearch.cities.some(c => c.includes('Mysore')), 'Search query must find Mysore');
  console.log(`  ✔ Instant Search Query (?q=Mysore): Successfully matched "${dataSearch.cities[0]}"`);

  // Test Germany (DE)
  const resDE = await fetch(`${BASE_URL}/api/settings/cities?country=DE`);
  assert.strictEqual(resDE.status, 200);
  const dataDE = await resDE.json();
  assert.strictEqual(dataDE.success, true);
  assert.strictEqual(dataDE.country, 'DE');
  assert.ok(dataDE.cities.some(c => c.includes('Berlin') || c.includes('Munich')));
  console.log(`  ✔ Germany (DE): ${dataDE.total} cities returned`);

  // Test United Kingdom (GB)
  const resGB = await fetch(`${BASE_URL}/api/settings/cities?country=GB`);
  assert.strictEqual(resGB.status, 200);
  const dataGB = await resGB.json();
  assert.strictEqual(dataGB.success, true);
  assert.strictEqual(dataGB.country, 'GB');
  assert.ok(dataGB.cities.some(c => c.includes('London')));
  console.log(`  ✔ United Kingdom (GB): ${dataGB.total} cities returned`);

  // Test Global / ALL
  const resALL = await fetch(`${BASE_URL}/api/settings/cities?country=ALL`);
  assert.strictEqual(resALL.status, 200);
  const dataALL = await resALL.json();
  assert.strictEqual(dataALL.success, true);
  assert.ok(dataALL.total >= 500, 'Global cities list should be >= 500');
  console.log(`  ✔ Worldwide (ALL): ${dataALL.total} total cities available for autocomplete`);

  console.log('\n======================================================');
  console.log('🎉 ALL MULTI-COUNTRY TIER 1, 2, 3 CITIES DATASET & API TESTS PASSED!');
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
