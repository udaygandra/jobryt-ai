/**
 * tests/test-payload-tuning-and-scoring.test.js
 *
 * Automated Test Suite for Job Board Payload Tuning, Strict City Isolation,
 * Deduplication Engine, and 3-Pillar Scoring with 90% Skills Match Edge Case.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Modules under test
const {
  isJobLocationEligible,
  isExplicitlyNegativeRemote,
  calculateLocationFitScore,
  detectTargetCountryScope
} = require('../scripts/core/geo-helper');

const {
  setSearchContext,
  getSearchContext,
  deduplicateJobList
} = require('../scripts/engine/fetch-all-boards');

const {
  computeHeuristicScore,
  runParseScore,
  normalizeJob
} = require('../scripts/engine/node-logic');

describe('1. Strict Geo-Filtering & City Isolation (geo-helper.js)', () => {
  it('should accept jobs matching the exact target city', () => {
    const candidateLocations = ['Toronto, ON'];
    const eligible = isJobLocationEligible('Toronto, ON, Canada', candidateLocations, 'Canada', 'onsite');
    assert.strictEqual(eligible, true, 'Toronto job should be accepted for Toronto candidate');
  });

  it('should reject jobs in a different city even if in the same province or state (City Isolation)', () => {
    const candidateLocations = ['Toronto, ON'];
    
    // Ottawa is in Ontario (ON), but candidate specified Toronto
    const ottawaJob = isJobLocationEligible('Ottawa, ON, Canada', candidateLocations, 'Canada', 'onsite');
    assert.strictEqual(ottawaJob, false, 'Ottawa job must be rejected for Toronto candidate');

    // Sudbury is in Ontario (ON)
    const sudburyJob = isJobLocationEligible('Sudbury, Ontario', candidateLocations, 'Canada', 'onsite');
    assert.strictEqual(sudburyJob, false, 'Sudbury job must be rejected for Toronto candidate');

    // Houston, TX vs Dallas, TX
    const candidateDallas = ['Dallas, TX'];
    const houstonJob = isJobLocationEligible('Houston, TX, United States', candidateDallas, 'United States', 'onsite');
    assert.strictEqual(houstonJob, false, 'Houston job must be rejected for Dallas candidate');
  });

  it('should detect explicitly negative remote phrasing and prevent false remote classification', () => {
    assert.strictEqual(isExplicitlyNegativeRemote('This is an on-site only role, not remote'), true);
    assert.strictEqual(isExplicitlyNegativeRemote('100% in-office position. No remote options available.'), true);
    assert.strictEqual(isExplicitlyNegativeRemote('Remote work is not available for this position'), true);
    assert.strictEqual(isExplicitlyNegativeRemote('Fully remote software engineer position'), false);
    assert.strictEqual(isExplicitlyNegativeRemote('Hybrid role - 2 days work from home'), false);
  });

  it('should reject a negative-remote job located in another city even if description contains the word "remote"', () => {
    const candidateLocations = ['Toronto, ON'];
    // Job is in Vancouver and explicitly says not remote
    const eligible = isJobLocationEligible(
      'Vancouver, BC',
      candidateLocations,
      'Canada',
      'remote',
      'Software Developer (On-site only, not remote, must be present in Vancouver office)'
    );
    assert.strictEqual(eligible, false, 'False-positive remote mention should not allow cross-city match');
  });

  it('should strictly reject Brossard QC, Moncton NB, Maple Ridge BC for Toronto candidate even if location string contains Canada', () => {
    const candidateLocations = ['Toronto, ON, Canada'];
    
    // The exact cases reported by user
    assert.strictEqual(
      isJobLocationEligible('Location Brossard (QC)', candidateLocations, 'CA', false),
      false,
      'Brossard QC must be rejected for Toronto candidate'
    );
    assert.strictEqual(
      isJobLocationEligible('Location Moncton (NB)', candidateLocations, 'CA', false),
      false,
      'Moncton NB must be rejected for Toronto candidate'
    );
    assert.strictEqual(
      isJobLocationEligible('Location Maple Ridge (BC)', candidateLocations, 'CA', false),
      false,
      'Maple Ridge BC must be rejected for Toronto candidate'
    );
    assert.strictEqual(
      isJobLocationEligible('Location London (ON)', candidateLocations, 'CA', false),
      false,
      'London ON must be rejected for Toronto candidate'
    );
  });

  it('should differentiate explicit nationwide search from specific city with country name', () => {
    const torontoWithCountry = ['Toronto, ON, Canada'];
    const nationwideExplicit = ['Canada (All Provinces / Nationwide)'];

    // Brossard onsite job
    assert.strictEqual(
      isJobLocationEligible('Location Brossard (QC)', torontoWithCountry, 'CA', false),
      false,
      'Toronto with country string must NOT allow nationwide jobs'
    );
    assert.strictEqual(
      isJobLocationEligible('Location Brossard (QC)', nationwideExplicit, 'CA', false),
      true,
      'Explicit nationwide preference MUST accept cross-province jobs'
    );
  });

  it('should enforce workplace eligibility for remote, hybrid, and onsite preferences', () => {
    const { isJobWorkplaceEligible } = require('../scripts/core/geo-helper');

    // Candidate wants Remote only
    assert.strictEqual(isJobWorkplaceEligible('Toronto, ON', 'Fully remote role', 'Data Analyst', 'Remote', true), true);
    assert.strictEqual(isJobWorkplaceEligible('Toronto, ON', '100% on-site in Toronto office 5 days', 'Data Analyst', 'Remote', false), false);
    assert.strictEqual(isJobWorkplaceEligible('Toronto, ON', 'Hybrid role 3 days in office', 'Data Analyst', 'Remote', false), false);

    // Candidate wants Onsite only
    assert.strictEqual(isJobWorkplaceEligible('Toronto, ON', 'On-site position in downtown office', 'Data Analyst', 'On-site', false), true);
    assert.strictEqual(isJobWorkplaceEligible('Toronto, ON', '100% remote work from home', 'Data Analyst', 'On-site', true), false);
  });

  it('should calculate location fit scores accurately with dynamic radial gradient', () => {
    // Exact city match
    const scoreExact = calculateLocationFitScore('Toronto, ON', ['Toronto, ON'], 'Canada', false, 'onsite');
    assert.strictEqual(scoreExact, 100);

    // Remote job for remote candidate
    const scoreRemote = calculateLocationFitScore('Remote, Canada', ['Toronto, ON'], 'Canada', true, 'remote');
    assert.strictEqual(scoreRemote, 100);

    // Mismatched city for onsite candidate
    const scoreMismatch = calculateLocationFitScore('Location Brossard (QC)', ['Toronto, ON, Canada'], 'CA', false, 'onsite');
    assert.ok(scoreMismatch <= 20, 'Mismatch location score must be <= 20');

    // === USER SCENARIO: R = 50 km ===
    // 1. Within 10 km radius: score in 90-100% gradient
    const score50_10km = calculateLocationFitScore('Toronto, ON', ['Toronto, ON, Canada'], 'CA', false, 'hybrid', 50);
    assert.strictEqual(score50_10km, 100);
    const score50_northYork = calculateLocationFitScore('North York, ON', ['Toronto, ON, Canada'], 'CA', false, 'hybrid', 50); // ~12 km -> near 90%
    assert.ok(score50_northYork >= 88 && score50_northYork <= 92, `North York (~12km) at R=50 should be ~89% (got ${score50_northYork})`);

    // 2. Under 25 km radius: score in 80-90% gradient
    const score50_sauga = calculateLocationFitScore('Mississauga, ON', ['Toronto, ON, Canada'], 'CA', false, 'hybrid', 50); // ~22.2 km
    assert.ok(score50_sauga >= 80 && score50_sauga <= 90, `Mississauga (~22km) at R=50 must score in 80-90% gradient (got ${score50_sauga})`);

    // 3. Under 50 km radius: score in 70-80% gradient
    const score50_brampton = calculateLocationFitScore('Brampton, ON', ['Toronto, ON, Canada'], 'CA', false, 'hybrid', 50); // ~31.7 km
    assert.ok(score50_brampton >= 70 && score50_brampton <= 80, `Brampton (~31.7km) at R=50 must score in 70-80% gradient (got ${score50_brampton})`);
    const score50_burlington = calculateLocationFitScore('Burlington, ON', ['Toronto, ON, Canada'], 'CA', false, 'hybrid', 50); // ~49.5 km
    assert.ok(score50_burlington >= 70 && score50_burlington <= 80, `Burlington (~49.5km) at R=50 must score in 70-80% gradient (got ${score50_burlington})`);

    // 4. Beyond 50 km: score <= 20%
    const score50_hamilton = calculateLocationFitScore('Hamilton, ON', ['Toronto, ON, Canada'], 'CA', false, 'hybrid', 50); // ~59.2 km
    assert.ok(score50_hamilton <= 20, `Hamilton (~59km) at R=50 must score <= 20 (got ${score50_hamilton})`);

    // === USER SCENARIO: R = 25 km (Default) ===
    // 1. Within 5 km radius: score in 90-100% gradient
    const score25_downtown = calculateLocationFitScore('Downtown Toronto, ON', ['Toronto, ON, Canada'], 'CA', false, 'onsite', 25);
    assert.strictEqual(score25_downtown, 100);

    // 2. Under 15 km radius: score in 80-90% gradient
    const score25_northYork = calculateLocationFitScore('North York, ON', ['Toronto, ON, Canada'], 'CA', false, 'onsite', 25); // ~12.2 km
    assert.ok(score25_northYork >= 80 && score25_northYork <= 90, `North York (~12km) at R=25 must score in 80-90% gradient (got ${score25_northYork})`);

    // 3. Under 25 km radius: score in 70-80% gradient
    const score25_sauga = calculateLocationFitScore('Mississauga, ON', ['Toronto, ON, Canada'], 'CA', false, 'onsite', 25); // ~22.2 km
    assert.ok(score25_sauga >= 70 && score25_sauga <= 80, `Mississauga (~22km) at R=25 must score in 70-80% gradient (got ${score25_sauga})`);
    const score25_markham = calculateLocationFitScore('Markham, ON', ['Toronto, ON, Canada'], 'CA', false, 'onsite', 25); // ~22.9 km
    assert.ok(score25_markham >= 70 && score25_markham <= 80, `Markham (~22.9km) at R=25 must score in 70-80% gradient (got ${score25_markham})`);

    // 4. Beyond 25 km: score <= 20%
    const score25_brampton = calculateLocationFitScore('Brampton, ON', ['Toronto, ON, Canada'], 'CA', false, 'onsite', 25); // ~31.7 km
    assert.ok(score25_brampton <= 20, `Brampton (~31.7km) at R=25 must score <= 20 (got ${score25_brampton})`);
  });
});

describe('2. Payload Tuning & Context Initialization (fetch-all-boards.js)', () => {
  beforeEach(() => {
    setSearchContext({
      locations: ['London, UK', 'Manchester, UK'],
      titles: ['Senior Node.js Developer', 'Backend Engineer'],
      workType: 'hybrid',
      boards: ['reed', 'adzuna'],
      freshness: '7d'
    });
  });

  it('should store and retrieve dynamic search context', () => {
    const ctx = getSearchContext();
    assert.deepStrictEqual(ctx.locations, ['London, UK', 'Manchester, UK']);
    assert.deepStrictEqual(ctx.titles, ['Senior Node.js Developer', 'Backend Engineer']);
    assert.strictEqual(ctx.workType, 'hybrid');
  });

  it('should deduplicate jobs and strip tracking query parameters from job links', () => {
    const rawJobs = [
      {
        id: 'job-1',
        title: 'Senior Node.js Developer',
        company: 'Acme Corp',
        location: 'London, UK',
        link: 'https://example.com/jobs/101?utm_source=indeed&utm_medium=cpc&ref=aggregator'
      },
      {
        id: 'job-2',
        title: 'Senior Node.js Developer',
        company: 'Acme Corp',
        location: 'London, UK',
        link: 'https://example.com/jobs/101?utm_campaign=spring2026'
      },
      {
        id: 'job-3',
        title: 'Backend Engineer',
        company: 'Beta Labs',
        location: 'Manchester, UK',
        link: 'https://example.com/jobs/202'
      }
    ];

    const deduped = deduplicateJobList(rawJobs);
    assert.strictEqual(deduped.length, 2, 'Duplicate Acme Corp job must be removed');
    assert.strictEqual(deduped[0].company, 'Acme Corp');
    assert.strictEqual(deduped[1].company, 'Beta Labs');
  });
});

describe('3. Top-Tier 3-Pillar Scoring & Edge Cases (node-logic.js)', () => {
  const resume = {
    basics: { title: 'Senior Backend Engineer', location: 'Toronto, ON' },
    skills: {
      technical: ['Node.js', 'TypeScript', 'PostgreSQL', 'Docker', 'AWS'],
      soft: ['Mentorship', 'Agile']
    },
    work: [
      { position: 'Senior Backend Engineer', company: 'Tech Inc', summary: 'Architected microservices in Node.js' }
    ]
  };

  const settings = {
    target_locations: ['Toronto, ON'],
    target_roles: ['Senior Backend Engineer'],
    work_type: 'hybrid',
    score_threshold: 70
  };

  it('should calculate heuristic score using Scoring v2 weights', () => {
    const job = {
      id: 'job-100',
      title: 'Senior Backend Engineer',
      company: 'GoodFit Co',
      location: 'Toronto, ON',
      description: 'Looking for Senior Backend Engineer with Node.js, TypeScript, Docker, and AWS experience.',
      seniority: 'Senior'
    };

    const result = computeHeuristicScore(job, resume, settings);
    assert.ok(result.overall_score >= 80, `Expected score >= 80, got ${result.overall_score}`);
    assert.strictEqual(result.should_apply, true);
    assert.strictEqual(result.scoring_pillars.formula, '45% skills + 30% seniority + 10% function + 15% location (gate)');
    assert.ok(result.scoring_pillars.skills_fit_score >= 80);
    assert.ok(result.scoring_pillars.seniority_fit_score >= 80);
    assert.ok(result.scoring_pillars.location_fit_score >= 80);
  });

  it('EDGE CASE: Should award 70% skills match when job description does not list specific skills', () => {
    const jobNoSkills = {
      id: 'job-verbal',
      title: 'Senior Backend Engineer',
      company: 'Secretive Stealth Startup',
      location: 'Toronto, ON',
      // Description intentionally lacks skill keywords (skills will be screened verbally on the call)
      description: 'Join our dynamic founding team. We will discuss specific technical skills and expectations over the introductory phone call.',
      seniority: 'Senior'
    };

    const result = computeHeuristicScore(jobNoSkills, resume, settings);
    
    assert.strictEqual(
      result.scoring_pillars.skills_fit_score,
      70,
      'When JD omits required skills, skills match must default to 70%'
    );
    assert.strictEqual(result.skills_edge_case, true, 'skills_edge_case flag must be true');
    assert.ok(result.overall_score >= 70, `Expected overall score >= 70 due to 70% skills baseline, got ${result.overall_score}`);
    assert.strictEqual(result.should_apply, true);
  });

  it('should strictly disqualify jobs with location mismatches or severe seniority mismatch', () => {
    const jobWrongLocation = {
      id: 'job-mismatch-loc',
      title: 'Senior Backend Engineer',
      company: 'Mismatched Inc',
      location: 'Tokyo, Japan',
      description: 'Senior Backend Engineer with Node.js, TypeScript, Docker, AWS.',
      seniority: 'Senior'
    };

    const result = computeHeuristicScore(jobWrongLocation, resume, settings);
    assert.ok(result.overall_score <= 45, `Expected capped score <= 45, got ${result.overall_score}`);
    assert.strictEqual(result.should_apply, false, 'Should not apply to wrong location job');
  });

  it('runParseScore should enforce the 70% neutral screening rule even if an LLM outputs 0 for unstated skills', async () => {
    const job = {
      id: 'job-test-llm',
      title: 'Senior Backend Engineer',
      company: 'Stealth AI',
      location: 'Toronto, ON',
      description: 'Great culture and mission. Technical stack discussed during first phone conversation.'
    };

    // Simulate an LLM output that failed to identify skills and gave 0
    const mockLlmResponse = JSON.stringify({
      skills_fit_score: 0,
      seniority_fit_score: 95,
      location_fit_score: 100,
      reasoning: 'No skills found in description.',
      missing_skills: [],
      skills_edge_case: true
    });

    const parsed = await runParseScore(mockLlmResponse, job, resume, settings);
    
    // The deterministic code-node logic must catch this edge case and enforce 70% skills fit
    assert.strictEqual(parsed.scoring_pillars.skills_fit_score, 70, 'Must override to 70% skills fit');
    assert.strictEqual(parsed.skills_edge_case, true);
    assert.ok(parsed.overall_score >= 70, `Expected score >= 70 with 70% skills fit, got ${parsed.overall_score}`);
  });

  it('should award 100% location fit for dual-location City + Remote and Canada-wide Remote roles', () => {
    // Dual location: City (Remote)
    const scoreDualLoc = calculateLocationFitScore('Ottawa, ON (Remote)', ['Toronto, ON, Canada'], 'CA', false, 'Open to All');
    assert.strictEqual(scoreDualLoc, 100, 'Dual-location City (Remote) must score 100%');

    // Canada-wide Remote
    const scoreCanadaWide = calculateLocationFitScore('Canada Wide Remote', ['Toronto, ON, Canada'], 'CA', true, 'Open to All');
    assert.strictEqual(scoreCanadaWide, 100, 'Canada Wide Remote must score 100%');

    // Remote in description
    const scoreDescRemote = calculateLocationFitScore('Vancouver, BC', ['Toronto, ON, Canada'], 'CA', false, 'Open to All', 25, 'This is a 100% remote position based in Canada.');
    assert.strictEqual(scoreDescRemote, 100, 'Remote in JD must score 100%');
  });

  it('should not artificially cap overall score when titleFit is low but skills and location fit are strong', async () => {
    const job = {
      id: 'job-title-test',
      title: 'Analytics Associate',
      company: 'Data Co',
      location: 'Toronto, ON',
      description: 'Senior technical role requiring Node.js, TypeScript, AWS, Docker, PostgreSQL.'
    };

    const mockLlmResponse = JSON.stringify({
      skills_fit_score: 95,
      seniority_fit_score: 90,
      location_fit_score: 100,
      breakdown: {
        skills_fit_score: 95,
        seniority_fit_score: 90,
        location_fit_score: 100,
        title_fit_score: 40 // Title variation from target "Senior Backend Engineer"
      },
      missing_skills: [],
      disqualification_reasons: [] // No hard blockers!
    });

    const parsed = await runParseScore(mockLlmResponse, job, resume, settings);
    // Arithmetic: 95*0.4 + 90*0.3 + 100*0.3 = 38 + 27 + 30 = 95
    assert.ok(parsed.overall_score >= 85, `Overall score should not be capped at 45 due to title wording (got ${parsed.overall_score})`);
    assert.strictEqual(parsed.should_apply, true, 'Role with high skill/location overlap should be qualified');
  });

  it('should support database table purging for reset and fresh-start operations', () => {
    const jobsDb = require('../scripts/core/jobs-db');
    assert.strictEqual(typeof jobsDb.clearPendingJobs, 'function');
    assert.strictEqual(typeof jobsDb.clearSeenJobs, 'function');
    assert.strictEqual(typeof jobsDb.clearRejectedJobs, 'function');
    assert.strictEqual(typeof jobsDb.clearPipelineData, 'function');

    // Test execution
    assert.strictEqual(jobsDb.clearPendingJobs(), true);
    assert.strictEqual(jobsDb.clearSeenJobs(), true);
  });

  it('should verify clear_queue action purges pending and seen records cleanly', () => {
    const jobsDb = require('../scripts/core/jobs-db');

    // Insert dummy test record in pending_jobs and seen_jobs
    const testId = 'test-clear-queue-id';
    jobsDb.markJobsSeen([testId]);
    jobsDb.savePendingJob({ id: testId, title: 'Test Role', company: 'Test Corp', location: 'Toronto, ON' });

    assert.strictEqual(jobsDb.isJobSeen(testId), true, 'Job must be marked seen initially');

    // Execute clearPendingJobs and clearSeenJobs (equivalent to clear_queue)
    jobsDb.clearPendingJobs();
    jobsDb.clearSeenJobs();

    assert.strictEqual(jobsDb.isJobSeen(testId), false, 'Seen job must be cleared after queue purge');
    const pending = jobsDb.getPendingJobs();
    assert.strictEqual(pending.length, 0, 'Pending jobs must be 0 after queue purge');
  });
});

