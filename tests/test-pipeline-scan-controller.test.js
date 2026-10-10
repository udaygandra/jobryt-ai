const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');

test('Phase 29: Pipeline Scan Controller & Discovery UX Verification', async (t) => {
  const pipelineModulePath = path.join(__dirname, '..', 'src', 'routes', 'pipeline.js');
  const indexHtmlPath = path.join(__dirname, '..', 'public', 'index.html');
  const opportunitiesJsPath = path.join(__dirname, '..', 'public', 'js', 'opportunities.js');
  const lastScanJsonPath = path.join(__dirname, '..', 'data', 'tracking', 'last_scan_result.json');

  await t.test('Plan 29.1: Concurrency Mutex & Signal Propagation in pipeline.js', () => {
    const pipelineCode = fs.readFileSync(pipelineModulePath, 'utf8');

    // Mutex verification
    assert.match(pipelineCode, /activeScanState\.status === 'running'/, 'Must guard concurrent scans with activeScanState mutex check');
    assert.match(pipelineCode, /status === 'already_running'[\s\S]*?res\.status\(409\)\.json/, 'Must return HTTP 409 already_running on duplicate trigger');

    // AbortController verification
    assert.match(pipelineCode, /new AbortController\(\)/, 'Must instantiate AbortController on scan run');
    assert.match(pipelineCode, /signal\s*[:}]|signal\s*,/, 'Must pass abort signal into fetchAllJobs');
    assert.match(pipelineCode, /signal\.aborted/, 'Must check signal in scoring worker loop');

    // Stop endpoint
    assert.match(pipelineCode, /router\.post\('\/stop'/, 'Must expose POST /api/pipeline/stop endpoint');
    assert.match(pipelineCode, /activeScanState\.abortController\.abort\(\)/, 'Stop endpoint must call abort() on active controller');

    // Status endpoint & Breakdown
    assert.match(pipelineCode, /router\.get\('\/status'/, 'Must expose GET /api/pipeline/status endpoint');
    assert.match(pipelineCode, /boardBreakdown/, 'Must track per-board ingestion count in boardBreakdown map');
    assert.match(pipelineCode, /saveLastScanResult/, 'Must persist last scan results to disk');
  });

  await t.test('Plan 29.1: Live Express Server API test for Mutex, Stop, and Status', async () => {
    const { router } = require('../src/routes/pipeline');
    const app = express();
    app.use(express.json());
    app.use('/api/pipeline', router);

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}/api/pipeline`;

    try {
      // 1. Test GET /api/pipeline/status when idle
      const statusRes = await fetch(`${baseUrl}/status`);
      assert.equal(statusRes.status, 200, 'Status endpoint must return 200');
      const statusData = await statusRes.json();
      assert.equal(statusData.success, true, 'Status response success must be true');
      assert.ok('isRunning' in statusData, 'Status response must indicate isRunning state');
      assert.ok('boardBreakdown' in statusData, 'Status response must include boardBreakdown');

      // 2. Test POST /api/pipeline/stop when idle
      const stopRes = await fetch(`${baseUrl}/stop`, { method: 'POST' });
      assert.equal(stopRes.status, 200, 'Stop endpoint must return 200');
      const stopData = await stopRes.json();
      assert.equal(stopData.success, false, 'Stop on idle scan should return success: false');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('Plan 29.1: Last Scan Result Persistence format', () => {
    if (fs.existsSync(lastScanJsonPath)) {
      const content = fs.readFileSync(lastScanJsonPath, 'utf8');
      const parsed = JSON.parse(content);
      assert.ok('status' in parsed, 'Persisted scan result must have status');
      assert.ok('stats' in parsed, 'Persisted scan result must have stats');
      assert.ok('boardBreakdown' in parsed, 'Persisted scan result must have boardBreakdown');
      assert.ok(Array.isArray(parsed.logs), 'Persisted scan result must have logs array');
    }
  });

  await t.test('Plan 29.2 & 29.3: Frontend HTML Structure in public/index.html', () => {
    const html = fs.readFileSync(indexHtmlPath, 'utf8');

    // Replacement of duplicate "Scan Feeds" button with "Scan Insights & Logs"
    assert.match(html, /id="btn-scan-insights"/, 'Must contain #btn-scan-insights button');
    assert.match(html, /id="scan-status-dot"/, 'Must contain #scan-status-dot indicator');
    assert.doesNotMatch(html, />Scan Feeds</, 'Duplicate "Scan Feeds" button text must be removed');

    // Search and Filter toolbar
    assert.match(html, /id="opp-filter-bar"/, 'Must contain #opp-filter-bar');
    assert.match(html, /id="opp-search-input"/, 'Must contain #opp-search-input for live title/company/skills searching');
    assert.match(html, /id="opp-score-filter"/, 'Must contain #opp-score-filter threshold controls');
    assert.match(html, /id="opp-worktype-filter"/, 'Must contain #opp-worktype-filter controls');
    assert.match(html, /id="opp-filtered-count"/, 'Must contain #opp-filtered-count badge');

    // Discovery Scan Diagnostics Modal & Stop Button
    assert.match(html, /id="scan-modal"/, 'Must contain #scan-modal');
    assert.match(html, /id="btn-stop-scan"/, 'Must contain #btn-stop-scan button');
    assert.match(html, /id="scan-board-breakdown"/, 'Must contain #scan-board-breakdown container');
    assert.match(html, /id="scan-logs"/, 'Must contain #scan-logs live terminal stream');
  });

  await t.test('Plan 29.2 & 29.3: Frontend Logic in public/js/opportunities.js', () => {
    const js = fs.readFileSync(opportunitiesJsPath, 'utf8');

    // Filter logic
    assert.match(js, /function filterOpportunities/, 'Must implement filterOpportunities');
    assert.match(js, /function setScoreFilter/, 'Must implement setScoreFilter');
    assert.match(js, /function setWorktypeFilter/, 'Must implement setWorktypeFilter');
    assert.match(js, /function resetOppFilters/, 'Must implement resetOppFilters');

    // Diagnostics & Stop Scan logic
    assert.match(js, /function openScanModal/, 'Must implement openScanModal');
    assert.match(js, /function closeScanModal/, 'Must implement closeScanModal');
    assert.match(js, /function stopScan/, 'Must implement stopScan');
    assert.match(js, /function checkScanStatus/, 'Must implement checkScanStatus');
    assert.match(js, /function renderScanDiagnostics/, 'Must implement renderScanDiagnostics');

    // 409 mutex attach logic
    assert.match(js, /res\.status === 409 \|\| data\.status === 'already_running'/, 'Must attach to live scan on HTTP 409 already_running');

    // Window exports
    assert.match(js, /window\.filterOpportunities = filterOpportunities/, 'Must export filterOpportunities to window');
    assert.match(js, /window\.openScanModal = openScanModal/, 'Must export openScanModal to window');
    assert.match(js, /window\.stopScan = stopScan/, 'Must export stopScan to window');
  });
});
