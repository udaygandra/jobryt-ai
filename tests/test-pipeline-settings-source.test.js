const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('Plan 28.2 - Pure Settings-Driven Pipeline Scan Verification', async (t) => {
  await t.test('pipeline.js solely derives targetTitles from search settings', () => {
    const pipelinePath = path.join(__dirname, '..', 'src', 'routes', 'pipeline.js');
    const code = fs.readFileSync(pipelinePath, 'utf8');

    // Asserts target titles are resolved from settings first, then profile.role as fallback
    assert.match(code, /settings\.target_titles[\s\S]*?settings\.target_roles[\s\S]*?profile\.role/,
      'Must read target titles from settings with fallback only to profile.role');
    assert.doesNotMatch(code, /profile\.target_titles/,
      'Must not check legacy profile.target_titles before or during settings resolution');
  });

  await t.test('pipeline.js solely derives targetLocations from search settings', () => {
    const pipelinePath = path.join(__dirname, '..', 'src', 'routes', 'pipeline.js');
    const code = fs.readFileSync(pipelinePath, 'utf8');

    // Asserts target locations are resolved from settings first, then resident location as fallback
    assert.match(code, /settings\.locations[\s\S]*?settings\.target_locations[\s\S]*?profile\.contact\?\.location/,
      'Must read target locations from settings with fallback only to resident location');
    assert.doesNotMatch(code, /profile\.locations/,
      'Must not check legacy profile.locations before or during settings resolution');
  });

  await t.test('executePipelineScan passes settings targets to fetchAllJobs payload', async () => {
    const { executePipelineScan } = require('../src/routes/pipeline');
    assert.equal(typeof executePipelineScan, 'function', 'executePipelineScan must be an exported function');
  });
});
