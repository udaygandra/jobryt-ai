const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Plan 28.3 - Uncapped High-Performance Concurrent Ingestion and Scoring', () => {

  test('pipeline.js has removed artificial MAX_TO_SCORE caps and slice limits', () => {
    const pipelineSrc = fs.readFileSync(path.join(process.cwd(), 'src/routes/pipeline.js'), 'utf8');
    assert.ok(!pipelineSrc.includes('MAX_TO_SCORE'), 'pipeline.js should not contain MAX_TO_SCORE');
    assert.ok(!pipelineSrc.includes('.slice(0, 30)'), 'pipeline.js should not slice unseen jobs to 30');
    assert.ok(pipelineSrc.includes('SCORING_CONCURRENCY'), 'pipeline.js should have concurrent scoring pool');
  });

  test('fetch-all-boards.js has removed artificial slice caps on feeds', () => {
    const boardsSrc = fs.readFileSync(path.join(process.cwd(), 'scripts/engine/fetch-all-boards.js'), 'utf8');
    // Ensure fetchArbeitnow and fetchNaukri no longer slice to 20, nor daijob to 15
    assert.ok(!boardsSrc.includes('(data.data || []).slice(0, 20)'), 'Arbeitnow should not slice to 20');
    assert.ok(!boardsSrc.includes('tupleMatches.slice(0, 20)'), 'Naukri should not slice to 20');
    assert.ok(!boardsSrc.includes('articles.slice(0, 15)'), 'Daijob should not slice to 15');
  });

  test('executePipelineScan scores all unseen jobs beyond 30 concurrently without truncation', async () => {
    const { executePipelineScan } = require(path.join(process.cwd(), 'src/routes/pipeline.js'));

    // Prepare 45 mock jobs (exceeding the old 30-job cap)
    const runUid = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const mockJobs = [];
    for (let i = 1; i <= 45; i++) {
      mockJobs.push({
        id: `mock-uncapped-${runUid}-${i}`,
        title: `Full Stack Engineer Level ${i}`,
        company: `Global Tech Co ${runUid} ${i}`,
        location: 'Remote',
        url: `https://example-test-${runUid}.com/job/${i}`,
        redirect_url: `https://example-test-${runUid}.com/job/${i}`,
        description: `Exciting software development role number ${i} with Node.js and React.`
      });
    }

    const scanResult = await executePipelineScan({
      injectedRawJobs: mockJobs,
      skipLLM: true,
      targetTitles: ['Full Stack Engineer'],
      targetLocations: ['Remote'],
      countryScope: 'GLOBAL',
      work_type: 'Remote',
      minScore: 40
    });

    assert.ok(scanResult.success, 'Scan should succeed');
    assert.strictEqual(scanResult.stats.unseenCount, 45, 'Should process all 45 jobs without truncating at 30');
    assert.strictEqual(scanResult.stats.scoredCount, 45, 'Should score all 45 jobs');
    assert.strictEqual(scanResult.allScored.length, 45, 'Should return exactly 45 scored jobs');

    // All jobs should have valid scores
    for (const job of scanResult.allScored) {
      assert.ok(typeof job.score === 'number', `Job ${job.id} should have a numeric score`);
      assert.ok(job.score >= 0, `Job ${job.id} score should be >= 0`);
    }
  });

});
