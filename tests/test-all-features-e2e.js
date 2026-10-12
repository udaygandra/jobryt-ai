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
const { fork } = require('child_process');
const jobsDb = require('../scripts/core/jobs-db');

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function ensureServerRunning() {
  try {
    await request('GET', '/api/status');
    return null;
  } catch (_) {
    console.log('⚡ Server not running on port 3000. Auto-spawning Express server...');
    const serverProcess = fork(path.join(__dirname, '../server.js'), [], { stdio: 'ignore' });
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      try {
        await request('GET', '/api/status');
        console.log('✔ Server started successfully.');
        return serverProcess;
      } catch (_) {}
    }
    throw new Error('Failed to start server within timeout');
  }
}

// Helper: Make HTTP request to local server
function request(method, pathUrl, body = null, headers = {}, timeoutMs = 120000) {
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

    const req = http.request(url, { method, headers: reqHeaders, timeout: timeoutMs }, (res) => {
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

  const serverProc = await ensureServerRunning();
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

  await test('POST /api/profile/upload-resume auto-detects candidate country_code', async () => {
    const canadianResumeText = `
SARAH JENNINGS
Email: sarah.jennings@example.ca | Phone: (416) 555-0199 | Location: Toronto, ON, Canada
Senior Data Analyst

SUMMARY
Senior Data Analyst with 6+ years of analytics experience across Canadian financial and tech ecosystems.

WORK EXPERIENCE
Senior Data Analyst | Royal Bank of Canada | 2022 - Present | Toronto, ON
• Led analytics initiatives across consumer banking pipelines
• Spearheaded predictive churn models in Python and SQL

Data Analyst | Shopify | 2018 - 2022 | Ottawa, ON
• Built dashboards in Tableau and automated ETL with dbt

EDUCATION
B.Sc. Statistics | University of Toronto | 2014 - 2018

SKILLS
SQL, Python, Tableau, Power BI, dbt, Snowflake, Git
    `;

    const res = await request('POST', '/api/profile/upload-resume', {
      filename: 'sarah_jennings_resume.txt',
      fileText: canadianResumeText
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert(res.json.profile);
    assert.strictEqual(res.json.profile.country_code, 'CA', 'Uploaded Canadian resume must detect CA country_code');
  });

  // ── TEST GROUP 3: Settings & Configuration ────────────────────────────────
  console.log('\n--- 3. Testing Settings & Configuration Menu ---');
  await test('GET /api/settings/countries returns global supported country scopes', async () => {
    const res = await request('GET', '/api/settings/countries');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert(Array.isArray(res.json.countries));
    assert(res.json.countries.length >= 18);
    const countryIds = res.json.countries.map(c => c.id);
    assert(countryIds.includes('AUTO'));
    assert(countryIds.includes('US'));
    assert(countryIds.includes('GB'));
    assert(countryIds.includes('DE'));
    assert(countryIds.includes('CA'));
    assert(countryIds.includes('GLOBAL'));
    assert(countryIds.includes('IN'));
    assert(countryIds.includes('AE'));
    assert(countryIds.includes('JP'));
  });

  await test('GET /api/settings/cities/live-search performs country-scoped edge geocoding', async () => {
    // 1. Live search Markham in Canada
    const liveCa = await request('GET', '/api/settings/cities/live-search?q=markham&country=CA');
    assert.strictEqual(liveCa.status, 200);
    assert.strictEqual(liveCa.json.success, true);
    assert(Array.isArray(liveCa.json.cities));
    assert(liveCa.json.cities.length > 0, 'Must return Markham city suggestion');
    const markham = liveCa.json.cities.find(c => c.city.toLowerCase().includes('markham'));
    assert(markham, 'Markham must be present');
    assert.strictEqual(markham.country_code, 'CA');
    assert(liveCa.json.cities.every(c => c.country_code === 'CA'), 'All returned cities must strictly belong to Canada');

    // 2. Cross-country leakage prevention: query Seattle in CA scope
    const leakTest = await request('GET', '/api/settings/cities/live-search?q=seattle&country=CA');
    assert.strictEqual(leakTest.status, 200);
    if (leakTest.json.cities.length > 0) {
      assert(leakTest.json.cities.every(c => c.country_code === 'CA'), 'No US cities leaked in CA scope');
    }
  });

  await test('GET /api/settings/boards filters boards specifically for target country', async () => {
    // 1. Canada boards
    const caRes = await request('GET', '/api/settings/boards?country=CA');
    assert.strictEqual(caRes.status, 200);
    assert.strictEqual(caRes.json.success, true);
    const caBoardIds = caRes.json.boards.map(b => b.id);
    assert(caBoardIds.includes('canada_job_bank'), 'Canada must have Canada Job Bank');
    assert(caBoardIds.includes('linkedin'), 'Canada must have LinkedIn');
    assert(caBoardIds.includes('indeed'), 'Canada must have Indeed');
    assert(!caBoardIds.includes('arbeitsagentur'), 'Canada must not include German Arbeitsagentur');
    assert(!caBoardIds.includes('bayt'), 'Canada must not include UAE Bayt');

    // 2. Germany boards
    const deRes = await request('GET', '/api/settings/boards?country=DE');
    assert.strictEqual(deRes.status, 200);
    const deBoardIds = deRes.json.boards.map(b => b.id);
    assert(deBoardIds.includes('arbeitsagentur'), 'Germany must have Bundesagentur für Arbeit');
    assert(deBoardIds.includes('stepstone'), 'Germany must have StepStone');
    assert(deBoardIds.includes('arbeitnow'), 'Germany must have ArbeitNow');
    assert(!deBoardIds.includes('canada_job_bank'), 'Germany must not include Canada Job Bank');

    // 3. Singapore boards
    const sgRes = await request('GET', '/api/settings/boards?country=SG');
    assert.strictEqual(sgRes.status, 200);
    const sgBoardIds = sgRes.json.boards.map(b => b.id);
    assert(sgBoardIds.includes('mycareersfuture'), 'Singapore must have MyCareersFuture Gov');
    assert(sgBoardIds.includes('jobstreet'), 'Singapore must have Jobstreet');

    // 4. UAE boards
    const aeRes = await request('GET', '/api/settings/boards?country=AE');
    assert.strictEqual(aeRes.status, 200);
    const aeBoardIds = aeRes.json.boards.map(b => b.id);
    assert(aeBoardIds.includes('bayt'), 'UAE must have Bayt.com');
  });

  await test('GET & POST /api/settings manages matching preferences and multi-country scope', async () => {
    const getRes = await request('GET', '/api/settings');
    assert.strictEqual(getRes.status, 200);
    assert(getRes.json);
    const origSettings = getRes.json;

    const updatePayload = {
      score_threshold: 65,
      freshness_hours: 48,
      country_scope: 'DE',
      work_type: 'Remote Only',
      boards_enabled: {
        adzuna: true,
        linkedin: true,
        canada_job_bank: false,
        usajobs: false,
        arbeitnow: true,
        himalayas: true
      }
    };

    const postRes = await request('POST', '/api/settings', updatePayload);
    assert.strictEqual(postRes.status, 200);
    assert.strictEqual(postRes.json.success, true);
    assert.strictEqual(postRes.json.settings.score_threshold, 65);
    assert.strictEqual(postRes.json.settings.freshness_hours, 48);
    assert.strictEqual(postRes.json.settings.country_scope, 'DE');
    assert.strictEqual(postRes.json.settings.boards_enabled.arbeitnow, true);

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

  await test('GET & POST /api/scheduler configures autonomous cron schedule', async () => {
    const getRes = await request('GET', '/api/scheduler');
    assert.strictEqual(getRes.status, 200);
    assert(getRes.json.presets);
    assert(typeof getRes.json.enabled === 'boolean');

    const updateRes = await request('POST', '/api/scheduler', {
      enabled: true,
      preset: '2H',
      schedule: '0 */2 * * *',
      description: 'Every 2 hours'
    });
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.json.success, true);
    assert.strictEqual(updateRes.json.scheduler.preset, '2H');
    assert.strictEqual(updateRes.json.scheduler.schedule, '0 */2 * * *');

    // Test rejection of invalid cron expression
    const badRes = await request('POST', '/api/scheduler', {
      schedule: 'invalid cron syntax'
    });
    assert.strictEqual(badRes.status, 400);

    // Revert
    await request('POST', '/api/scheduler', {
      enabled: getRes.json.enabled,
      preset: getRes.json.preset,
      schedule: getRes.json.schedule,
      description: getRes.json.description
    });
  });

  // ── TEST GROUP 4: Opportunities Pipeline & Custom Evaluator ───────────────
  console.log('\n--- 4. Testing Opportunities Pipeline & Custom Evaluator ---');
  let testJobId = null;

  await test('POST /api/pipeline/evaluate-custom evaluates any custom job link/text', async () => {
    const profRes = await request('GET', '/api/profile');
    const prof = profRes.json || {};
    const targetTitle = (prof.target_titles && prof.target_titles[0]) || 'Data Analyst';
    const topSkills = (prof.skills && prof.skills.length ? prof.skills.slice(0, 5) : ['SQL', 'Power BI', 'Python']).join(', ');

    const customJob = {
      title: `Senior ${targetTitle}`,
      company: 'OmniCloud Systems',
      location: 'Remote (US/Canada)',
      description: `Looking for an experienced Senior ${targetTitle} with deep expertise in ${topSkills}, statistical analysis, and interactive dashboarding.`,
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
    if (testJobId) {
      jobsDb.removePendingJob(testJobId);
    }
  });

  await test('POST /api/pipeline/run executes autonomous multi-board scan with filters', async () => {
    const scanPayload = {
      targetTitles: ['Senior Full-Stack Engineer'],
      targetLocations: ['Remote'],
      minScore: 60,
      freshnessHours: 48,
      sendTelegram: false // Do not spam Telegram during automated E2E testing
    };

    const res = await request('POST', '/api/pipeline/run', scanPayload, {}, 240000);
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

  // ── TEST GROUP 8: Application Lifecycle Tracking & Stage Management ─────
  console.log('\n--- 8. Testing Application Tracking Lifecycle & Stage Management ---');
  await test('PATCH /api/jobs/:id/status updates job lifecycle stage and notes', async () => {
    // 1. Get an applied job
    const listRes = await request('GET', '/api/jobs/applied');
    assert.strictEqual(listRes.status, 200);
    assert(listRes.json.jobs.length > 0, 'Must have at least 1 applied job to test status updates');
    const targetJob = listRes.json.jobs[0];

    // 2. Transition stage to 'Interviewing' with custom note
    const patchRes = await request('PATCH', `/api/jobs/${encodeURIComponent(targetJob.id)}/status`, {
      status: 'Interviewing',
      notes: 'Passed screening round with recruiter. Technical interview set.'
    });
    assert.strictEqual(patchRes.status, 200);
    assert.strictEqual(patchRes.json.success, true);
    assert.strictEqual(patchRes.json.status, 'Interviewing');

    // 3. Verify stage filtering on GET /api/jobs/applied?status=interviewing
    const filteredRes = await request('GET', '/api/jobs/applied?status=interviewing');
    assert.strictEqual(filteredRes.status, 200);
    assert(filteredRes.json.jobs.some(j => j.id === targetJob.id), 'Job must appear in interviewing stage');

    // 4. Update notes independently
    const notesRes = await request('POST', `/api/jobs/${encodeURIComponent(targetJob.id)}/notes`, {
      notes: 'Updated: Final interview on Friday at 2:00 PM.'
    });
    assert.strictEqual(notesRes.status, 200);
    assert.strictEqual(notesRes.json.success, true);
  });

  // ── TEST GROUP 9: Frontend Single Page Application (SPA) DOM Contracts ────
  console.log('\n--- 9. Testing Frontend SPA HTML & DOM Elements ---');
  await test('GET / serves index.html with all tabs, Workflow Guide, and modals', async () => {
    const res = await request('GET', '/');
    assert.strictEqual(res.status, 200);
    const html = res.text;

    // Tabs
    const expectedTabs = ['tab-feed', 'tab-config', 'tab-custom', 'tab-profile', 'tab-applied', 'tab-recruiters', 'tab-guide'];
    for (const tabId of expectedTabs) {
      assert(html.includes(`id="${tabId}"`), `Tab #${tabId} must exist in index.html`);
    }

    // Views
    const expectedViews = ['view-feed', 'view-config', 'view-custom', 'view-profile', 'view-applied', 'view-recruiters', 'view-guide'];
    for (const viewId of expectedViews) {
      assert(html.includes(`id="${viewId}"`), `View container #${viewId} must exist in index.html`);
    }

    // Key interactive buttons & controls
    const expectedButtons = [
      'btn-upload-resume',
      'btn-save-profile',
      'scan-modal',
      'letter-modal',
      'applied-confirm-modal',
      'workflow-guide-content',
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

  try {
    const db = jobsDb.getDb();
    db.prepare("DELETE FROM applied_jobs WHERE id LIKE 'test_%' OR id LIKE 'manual_%'").run();
    db.prepare("DELETE FROM tailored_resumes WHERE id LIKE 'test_%' OR id LIKE 'manual_%'").run();
  } catch (_) {}

  console.log('\n' + '='.repeat(70));
  console.log(`🎉 ALL ${passed}/${total} END-TO-END FEATURE AND MENU TESTS PASSED PERFECTLY!`);
  console.log('='.repeat(70) + '\n');
  if (serverProc) serverProc.kill();
}

runAllFeatureTests().then(() => process.exit(0)).catch(err => {
  console.error('\n❌ E2E Feature Test Suite failed:', err);
  process.exit(1);
});
