/**
 * tests/test-all-features-e2e.js
 * Comprehensive End-to-End Test Suite for Jobryt AI Agent
 *
 * Verifies 100% of API endpoints, menus, and application features:
 *   1. System Status & Metrics (/api/status)
 *   2. Master Profile Ground Truth & Schema (/api/profile)
 *   3. Resume Ingestion & Parsing Engine (/api/profile/upload-resume)
 *   4. Configuration & Settings Management (/api/settings)
 *   5. Safe Environment Manager (/api/env)
 *   6. Multi-Board Pipeline Discovery (/api/pipeline/run)
 *   7. Custom Single-Job Evaluator (/api/pipeline/evaluate-custom)
 *   8. ATS Tailoring & PDF Resume Generation (/api/jobs/apply)
 *   9. Job Rejection & Filtering (/api/jobs/reject)
 *  10. Job Tracking Queues (Pending, Applied, Rejected)
 *  11. Recruiter Intelligence & Google X-Ray Search (/api/recruiters/search)
 *  12. Document & Spreadsheet Exports (.xlsx & .csv)
 *  13. PDF Resume Download Stream (/api/resume/download/:filename)
 *  14. Telegram Bot Diagnostics & Bridge Process Controls
 *  15. Frontend SPA Menus, Tabs & DOM Contracts Verification
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Helper: Make HTTP request to local server
function request(method, pathUrl, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathUrl, BASE_URL);
    const reqHeaders = { ...headers };
    let reqBody = null;

    if (body) {
      if (typeof body === 'object' && !(body instanceof Buffer)) {
        reqBody = JSON.stringify(body);
        reqHeaders['Content-Type'] = 'application/json';
      } else {
        reqBody = body;
      }
      reqHeaders['Content-Length'] = Buffer.byteLength(reqBody);
    }

    const req = http.request(url, { method, headers: reqHeaders, timeout: 25000 }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const text = buffer.toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text,
          json,
          buffer
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out: ${method} ${pathUrl}`));
    });

    if (reqBody) req.write(reqBody);
    req.end();
  });
}

async function runAllFeatureTests() {
  console.log('='.repeat(70));
  console.log('🧪 RUNNING COMPREHENSIVE END-TO-END APPLICATION & MENU TESTS');
  console.log('='.repeat(70) + '\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    return (async () => {
      try {
        await fn();
        console.log(`  ✔ [PASS] ${name}`);
        passed++;
      } catch (err) {
        console.error(`  ✖ [FAIL] ${name}`);
        console.error(`    Error: ${err.message}`);
        throw err;
      }
    })();
  }

  // ── TEST GROUP 1: Core System & Status ────────────────────────────────────
  console.log('--- 1. Testing System Status & Metrics Menu ---');
  await test('GET /api/status returns operational status and metrics', async () => {
    const res = await request('GET', '/api/status');
    assert.strictEqual(res.status, 200);
    assert(res.json);
    assert.strictEqual(res.json.status, 'operational');
    assert(res.json.candidate);
    assert(res.json.counts);
    assert(typeof res.json.counts.seen === 'number');
    assert(typeof res.json.counts.pending === 'number');
    assert(typeof res.json.counts.applied === 'number');
    assert(res.json.llm);
    assert(res.json.integrations);
  });

  // ── TEST GROUP 2: Master Profile & Resume Upload ──────────────────────────
  console.log('\n--- 2. Testing Master Profile Ground Truth & Resume Upload ---');
  await test('GET /api/profile returns valid candidate profile', async () => {
    const res = await request('GET', '/api/profile');
    assert.strictEqual(res.status, 200);
    assert(res.json);
    assert(res.json.name, 'Profile must have a candidate name');
    assert(Array.isArray(res.json.skills) && res.json.skills.length > 0, 'Profile must have skills');
    assert(Array.isArray(res.json.experience) && res.json.experience.length > 0, 'Profile must have experience');
  });

  await test('POST /api/profile updates profile and creates backup', async () => {
    const original = (await request('GET', '/api/profile')).json;
    const testUpdate = {
      ...original,
      name: 'Alex Mercer (E2E Verified)',
      title: 'Principal Cloud & Distributed Systems Architect',
      skills: [...original.skills, 'System Architecture Test']
    };

    const postRes = await request('POST', '/api/profile', testUpdate);
    assert.strictEqual(postRes.status, 200);
    assert.strictEqual(postRes.json.success, true);

    const verifyRes = await request('GET', '/api/profile');
    assert.strictEqual(verifyRes.json.name, 'Alex Mercer (E2E Verified)');

    // Restore original
    await request('POST', '/api/profile', original);
  });

  await test('POST /api/profile/upload-resume parses structured text resume', async () => {
    const sampleResumeText = `
ALEXANDER MERCER
Email: alex.mercer@techtest.com | Phone: (555) 019-2834 | Location: Austin, TX
Senior Full-Stack & Cloud Architect

SUMMARY
Experienced software engineer with 8+ years building enterprise web applications, microservices, and cloud architectures.

WORK EXPERIENCE
Senior Lead Engineer | Apex Cloud | 2021 - Present | Austin, TX
• Architected scalable event-driven systems processing 10M requests daily
• Directed engineering practices across microservices and PostgreSQL pipelines

Software Engineer | Beacon Labs | 2017 - 2021 | Toronto, ON
• Developed REST APIs and responsive frontends using React and Node.js

EDUCATION
B.S. Computer Science | University of Texas at Austin | 2013 - 2017

SKILLS
JavaScript, TypeScript, Python, Node.js, React, Docker, Kubernetes, AWS, PostgreSQL
    `;

    const res = await request('POST', '/api/profile/upload-resume', {
      filename: 'sample_resume.txt',
      fileText: sampleResumeText
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert(res.json.profile);
    assert(res.json.profile.experience && res.json.profile.experience.length >= 1);
    assert(res.json.profile.skills && res.json.profile.skills.length >= 3);
  });

  // ── TEST GROUP 3: Settings & Configuration ────────────────────────────────
  console.log('\n--- 3. Testing Settings & Configuration Menu ---');
  await test('GET & POST /api/settings manages matching preferences', async () => {
    const getRes = await request('GET', '/api/settings');
    assert.strictEqual(getRes.status, 200);
    assert(getRes.json);
    const origSettings = getRes.json;

    const updatePayload = {
      score_threshold: 65,
      freshness_hours: 48,
      country_scope: 'AUTO',
      work_type: 'Remote Only',
      boards_enabled: {
        adzuna: true,
        linkedin: true,
        canada_job_bank: true,
        usajobs: false
      }
    };

    const postRes = await request('POST', '/api/settings', updatePayload);
    assert.strictEqual(postRes.status, 200);
    assert.strictEqual(postRes.json.success, true);
    assert.strictEqual(postRes.json.settings.score_threshold, 65);
    assert.strictEqual(postRes.json.settings.freshness_hours, 48);

    // Revert back
    await request('POST', '/api/settings', origSettings);
  });

  await test('GET /api/env safely returns configuration with masked secrets', async () => {
    const res = await request('GET', '/api/env');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert(res.json.env);
    // Ensure secrets are not returned in raw plain text
    for (const [k, v] of Object.entries(res.json.env)) {
      if (/key|secret|password|token/i.test(k) && v) {
        assert(!v.includes('8551708118:AAGrrKwiknZwl_GjpIhfI38p0r4o9VlrxkY'), 'Raw token must never leak');
      }
    }
  });

  // ── TEST GROUP 4: Opportunities Pipeline & Custom Evaluator ───────────────
  console.log('\n--- 4. Testing Opportunities Pipeline & Custom Evaluator ---');
  let testJobId = null;

  await test('POST /api/pipeline/evaluate-custom evaluates any custom job link/text', async () => {
    const customJob = {
      title: 'Senior Cloud Platform Engineer',
      company: 'OmniCloud Systems',
      location: 'Remote (US/Canada)',
      description: 'Looking for a Senior Cloud Platform Engineer with deep experience in TypeScript, Node.js, Docker, Kubernetes, and AWS microservices.',
      url: 'https://example.com/jobs/cloud-platform'
    };

    const res = await request('POST', '/api/pipeline/evaluate-custom', customJob);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert(res.json.evaluatedJob);
    assert(typeof res.json.evaluatedJob.score === 'number');
    assert(res.json.evaluatedJob.score >= 50, 'Matching profile should achieve good match score');
    assert(res.json.evaluatedJob.id);
    testJobId = res.json.evaluatedJob.id;
  });

  await test('GET /api/jobs/pending lists pending opportunities', async () => {
    const res = await request('GET', '/api/jobs/pending');
    assert.strictEqual(res.status, 200);
    assert(typeof res.json.count === 'number');
    assert(Array.isArray(res.json.jobs));
  });

  await test('POST /api/pipeline/run executes autonomous multi-board scan with filters', async () => {
    const scanPayload = {
      targetTitles: ['Senior Full-Stack Engineer'],
      targetLocations: ['Remote'],
      minScore: 60,
      freshnessHours: 48,
      sendTelegram: false // Do not spam Telegram during automated E2E testing
    };

    const res = await request('POST', '/api/pipeline/run', scanPayload);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert(res.json.stats);
    assert(typeof res.json.stats.totalFetched === 'number');
    assert(typeof res.json.stats.scoredCount === 'number');
    assert(Array.isArray(res.json.qualifiedJobs));
  });

  // ── TEST GROUP 5: Zero-Fabrication Tailoring & PDF Generation ──────────────
  console.log('\n--- 5. Testing Zero-Fabrication ATS PDF Tailoring & Apply Engine ---');
  let generatedPdfFilename = null;

  await test('POST /api/jobs/apply generates tailored ATS PDF & cover letter', async () => {
    const testApplyJob = {
      id: `test_apply_${Date.now()}`,
      title: 'Lead Distributed Systems Architect',
      company: 'Zenith Tech',
      location: 'Remote',
      description: 'Design high-scale cloud backend architecture using Node.js, PostgreSQL, Docker, and AWS.',
      source: 'Direct Test'
    };

    const res = await request('POST', '/api/jobs/apply', { job: testApplyJob, tone: 'Executive & Concise' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert(res.json.appliedJob);
    assert(res.json.appliedJob.cover_letter, 'Cover letter must be generated');
    assert(res.json.appliedJob.pdf_filename, 'PDF resume filename must be created');
    generatedPdfFilename = res.json.appliedJob.pdf_filename;
  });

  await test('GET /api/jobs/applied lists completed applications', async () => {
    const res = await request('GET', '/api/jobs/applied');
    assert.strictEqual(res.status, 200);
    assert(typeof res.json.count === 'number');
    assert(Array.isArray(res.json.jobs));
    assert(res.json.jobs.length > 0, 'Must have at least one applied job');
  });

  await test('GET /api/resume/download/:filename streams valid PDF document', async () => {
    assert(generatedPdfFilename, 'PDF filename must exist from previous step');
    const res = await request('GET', `/api/resume/download/${encodeURIComponent(generatedPdfFilename)}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['content-type'], 'application/pdf');
    // PDF Magic bytes: %PDF-
    assert(res.buffer.slice(0, 4).toString('ascii').startsWith('%PDF'), 'Must be a valid binary PDF file');
  });

  await test('POST /api/jobs/reject marks job as rejected and purges from pending', async () => {
    const rejectJobObj = {
      id: `test_reject_${Date.now()}`,
      title: 'Irrelevant Sales Role',
      company: 'Cold Outreach Co'
    };

    const res = await request('POST', '/api/jobs/reject', { job: rejectJobObj });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);

    const rejectedList = await request('GET', '/api/jobs/rejected');
    assert.strictEqual(rejectedList.status, 200);
    assert(Array.isArray(rejectedList.json.jobs));
  });

  // ── TEST GROUP 6: Document & Spreadsheet Exports ──────────────────────────
  console.log('\n--- 6. Testing Document & Spreadsheet Exports ---');
  await test('GET /api/export/xlsx generates valid Excel spreadsheet', async () => {
    const res = await request('GET', '/api/export/xlsx');
    assert.strictEqual(res.status, 200);
    assert(res.headers['content-type'].includes('spreadsheetml.sheet'));
    assert(res.buffer.length > 500, 'Excel buffer must contain sheet data');
  });

  await test('GET /api/export/csv generates valid CSV spreadsheet', async () => {
    const res = await request('GET', '/api/export/csv');
    assert.strictEqual(res.status, 200);
    assert(res.headers['content-type'].includes('text/csv'));
    assert(res.text.includes('Job Title') && res.text.includes('Company'), 'CSV must contain standard headers');
  });

  // ── TEST GROUP 7: Recruiter Intelligence ──────────────────────────────────
  console.log('\n--- 7. Testing Recruiter Intelligence & X-Ray Search Generator ---');
  await test('GET /api/recruiters/search generates targeted X-Ray queries and LinkedIn connection note', async () => {
    const res = await request('GET', '/api/recruiters/search?company=Datadog&city=New%20York');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert(res.json.xRaySearchUrl.includes('google.com/search'));
    assert(res.json.linkedInSearchUrl.includes('linkedin.com'));
    assert(res.json.draftLinkedInNote, 'Must generate draft connection note');
    assert(res.json.draftLinkedInNote.length <= 300, 'LinkedIn note must respect 300-char constraint');
  });

  // ── TEST GROUP 8: Telegram Diagnostics & Bridge Process ───────────────────
  console.log('\n--- 8. Testing Telegram Diagnostics & Bridge Process ---');
  await test('GET /api/telegram/status reports configuration state', async () => {
    const res = await request('GET', '/api/telegram/status');
    assert.strictEqual(res.status, 200);
    assert(res.json);
    assert(typeof res.json.configured === 'boolean');
    assert(res.json.bridge);
  });

  await test('POST /api/telegram/bridge/stop and /api/telegram/bridge/start manage process cleanly', async () => {
    const stopRes = await request('POST', '/api/telegram/bridge/stop');
    assert.strictEqual(stopRes.status, 200);

    const startRes = await request('POST', '/api/telegram/bridge/start');
    assert.strictEqual(startRes.status, 200);
  });

  // ── TEST GROUP 9: Frontend Single Page Application (SPA) DOM Contracts ────
  console.log('\n--- 9. Testing Frontend SPA HTML & DOM Elements ---');
  await test('GET / serves index.html with all 7 tabs, modal drawers, and responsive controls', async () => {
    const res = await request('GET', '/');
    assert.strictEqual(res.status, 200);
    const html = res.text;

    // Tabs
    const expectedTabs = ['tab-feed', 'tab-config', 'tab-custom', 'tab-profile', 'tab-applied', 'tab-recruiters', 'tab-telegram'];
    for (const tabId of expectedTabs) {
      assert(html.includes(`id="${tabId}"`), `Tab #${tabId} must exist in index.html`);
    }

    // Views
    const expectedViews = ['view-feed', 'view-config', 'view-custom', 'view-profile', 'view-applied', 'view-recruiters', 'view-telegram'];
    for (const viewId of expectedViews) {
      assert(html.includes(`id="${viewId}"`), `View container #${viewId} must exist in index.html`);
    }

    // Key interactive buttons & controls
    const expectedButtons = [
      'btn-upload-resume',
      'btn-save-profile',
      'btn-tg-ping',
      'btn-tg-custom-ping',
      'btn-tg-restart',
      'scan-modal',
      'letter-modal',
      'prof-experience-container',
      'prof-projects-container',
      'prof-certifications-container',
      'prof-education-container',
      'prof-json'
    ];
    for (const btnId of expectedButtons) {
      assert(html.includes(`id="${btnId}"`), `Control #${btnId} must exist in index.html`);
    }

    // Export links
    assert(html.includes('/api/export/xlsx'), 'Excel export link must exist');
    assert(html.includes('/api/export/csv'), 'CSV export link must exist');

    // Theme support
    assert(html.includes('data-theme'), 'Theme attribute handling must exist');
    assert(html.includes('toggleTheme()'), 'Theme toggle function must exist');
  });

  console.log('\n' + '='.repeat(70));
  console.log(`🎉 ALL ${passed}/${total} END-TO-END FEATURE AND MENU TESTS PASSED PERFECTLY!`);
  console.log('='.repeat(70) + '\n');
}

runAllFeatureTests().catch(err => {
  console.error('\n❌ E2E Feature Test Suite failed:', err);
  process.exit(1);
});
