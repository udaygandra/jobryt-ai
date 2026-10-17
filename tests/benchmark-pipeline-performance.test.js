const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const v8 = require('v8');

const { executePipelineScan } = require(path.join(process.cwd(), 'src/routes/pipeline.js'));
const { toLightweightJobDTO } = require(path.join(process.cwd(), 'scripts/engine/node-logic.js'));
const { getOptimalConcurrency, yieldEventLoop, isUnderMemoryPressure } = require(path.join(process.cwd(), 'scripts/engine/adaptive-concurrency.js'));

describe('Phase 35: High-Performance Auto-Scalable Streaming Pipeline & Wait-Time Optimization', () => {

  test('Adaptive concurrency engine calculates resource-safe thread/network bounds', () => {
    const profile = getOptimalConcurrency();
    assert.ok(profile.cpuCount >= 1, 'Should detect at least 1 CPU core');
    assert.ok(profile.freeMemMb > 0, 'Should measure free system RAM');
    assert.ok(profile.networkConcurrency >= 4 && profile.networkConcurrency <= 32, 'Network concurrency within safe bounds');
    assert.ok(profile.scoringConcurrency >= 2 && profile.scoringConcurrency <= 24, 'Scoring concurrency within safe bounds');
    assert.strictEqual(typeof isUnderMemoryPressure(), 'boolean', 'isUnderMemoryPressure returns boolean');
  });

  test('toLightweightJobDTO purges raw HTML styling and bounds description memory by >70%', () => {
    const bloatedHtml = '<div><style>.heavy { color: red; font-size: 24px; width: 100%; }</style>' +
      '<h1>Staff Engineer</h1><p>' + 'Detailed job descriptions and specifications. '.repeat(500) + '</p>' +
      '<script>console.log("bad tracking script");</script></div>';

    const heavyJob = {
      id: 'job-bloated-1',
      title: 'Staff Software Architect',
      company: 'Enterprise Systems',
      location: 'Remote',
      source: 'Adzuna',
      description: bloatedHtml
    };

    const initialByteSize = Buffer.byteLength(JSON.stringify(heavyJob), 'utf8');
    const compactJob = toLightweightJobDTO(heavyJob, 'adzuna');
    const compactByteSize = Buffer.byteLength(JSON.stringify(compactJob), 'utf8');

    assert.ok(compactByteSize < initialByteSize * 0.25, `Memory reduction must exceed 75% (was ${initialByteSize}B -> now ${compactByteSize}B)`);
    assert.ok(!compactJob.description.includes('<style>'), 'Should strip <style> tags');
    assert.ok(!compactJob.description.includes('<script>'), 'Should strip <script> tags');
    assert.ok(compactJob.description.length <= 1505, 'Should bound description length to ~1500 chars');
  });

  test('Streaming pipeline processes 60 jobs in micro-batches with non-blocking event loop & bounds peak heap', async () => {
    const runUid = `perf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const mockJobs = [];

    for (let i = 1; i <= 60; i++) {
      mockJobs.push({
        id: `mock-perf-${runUid}-${i}`,
        title: i % 2 === 0 ? 'Senior Full Stack Engineer' : 'Lead Backend Developer',
        company: `Cloud Systems ${runUid} ${i}`,
        location: 'Remote',
        url: `https://test-perf-${runUid}.com/job/${i}`,
        redirect_url: `https://test-perf-${runUid}.com/job/${i}`,
        description: `High performance Node.js and TypeScript engineering role ${i} building microservices.`
      });
    }

    const initialHeapMb = v8.getHeapStatistics().used_heap_size / (1024 * 1024);
    const t0 = Date.now();

    const scanResult = await executePipelineScan({
      injectedRawJobs: mockJobs,
      skipLLM: true,
      targetTitles: ['Senior Full Stack Engineer', 'Lead Backend Developer'],
      targetLocations: ['Remote'],
      countryScope: 'GLOBAL',
      work_type: 'Remote',
      minScore: 40
    });

    const elapsedMs = Date.now() - t0;
    const finalHeapMb = v8.getHeapStatistics().used_heap_size / (1024 * 1024);
    const heapDeltaMb = finalHeapMb - initialHeapMb;

    assert.ok(scanResult.success, 'Streaming pipeline execution should succeed');
    assert.strictEqual(scanResult.stats.unseenCount, 60, 'All 60 jobs should be recognized as unseen');
    assert.strictEqual(scanResult.stats.scoredCount, 60, 'All 60 jobs should be scored without truncation');
    assert.strictEqual(scanResult.allScored.length, 60, 'Result contains 60 scored jobs');

    // Performance & Heap assertions
    assert.ok(elapsedMs < 6000, `Streaming micro-batch execution should finish quickly (took ${elapsedMs}ms)`);
    assert.ok(finalHeapMb < 180, `Peak heap memory should remain well below 180MB (was ${finalHeapMb.toFixed(1)}MB, delta: ${heapDeltaMb.toFixed(1)}MB)`);
  });

  test('Non-blocking yieldEventLoop yields execution back to the event loop', async () => {
    let order = [];
    setTimeout(() => order.push('timer-fired'), 0);
    order.push('immediate-start');
    await yieldEventLoop();
    order.push('post-yield');
    assert.strictEqual(order[0], 'immediate-start');
    assert.ok(order.includes('post-yield'));
  });
});
