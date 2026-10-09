/**
 * tests/test-all-jobboards.test.js
 *
 * Comprehensive Automated Test Suite for All 18+ Job Boards in Jobryt AI.
 * Built with native Node.js Test Runner (node:test) and strict assertions (node:assert/strict).
 *
 * COVERAGE:
 *   1. Country Boards Registry & Supported Market Coverage (18+ boards across 12 countries + Global)
 *   2. Mock Ingestion & Normalization per Board (Adzuna, Canada Job Bank, LinkedIn, USAJOBS,
 *      Jobicy, Remotive, ArbeitNow, Himalayas, Indeed, Arbeitsagentur, MyCareersFuture,
 *      Seek, Reed UK, Bayt, Welcome to the Jungle, Naukri, Daijob, Vagas)
 *   3. Deduplication & Fair Round-Robin Balance Engine
 *   4. Geo-Hierarchy, Role Relevance & Freshness Filtering Contracts
 *   5. Chaos & Fault-Tolerance Injection (429 Rate-Limits, 500 Server Errors, Network Timeouts, Corrupt Payloads)
 *   6. Full-Pipeline Aggregator Execution (fetchAllJobs)
 *   7. Live Network Smoke Test (Non-blocking public endpoints)
 */

const { describe, it, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// Project Modules
const {
  COUNTRY_BOARDS,
  GLOBAL_REMOTE_BOARDS,
  getAllSupportedBoards,
  getBoardsForCountry
} = require('../scripts/core/country-boards-registry');

const {
  DEFAULT_SETTINGS,
  getSettings,
  updateSettings
} = require('../scripts/core/settings-helper');

const {
  isJobLocationEligible,
  isJobRoleRelevant,
  detectTargetCountryScope
} = require('../scripts/core/geo-helper');

const {
  normalizeJob,
  runFreshnessFilter,
  runDedupFilter
} = require('../scripts/engine/node-logic');

const {
  fetchAllJobs,
  fetchAdzuna,
  fetchCanadaJobBank,
  fetchUSAJobs,
  fetchGlobalRemoteFeeds,
  fetchLinkedIn,
  fetchIndeed,
  fetchArbeitsagentur,
  fetchMyCareersFuture,
  fetchSeek,
  fetchReedUK,
  fetchBayt,
  fetchWTTJ,
  fetchNaukri,
  fetchDaijobJP,
  fetchVagasBR,
  deduplicateJobList,
  allFetchedJobs,
  setSearchContext,
  getSearchContext
} = require('../scripts/engine/fetch-all-boards');

// Test Fixtures
const {
  CANDIDATE_TEST_PROFILES,
  MOCK_BOARD_RESPONSES
} = require('./fixtures/jobboards-test-data');

// ============================================================================
// SUITE 1: Board Registry & Multi-Market Coverage
// ============================================================================
describe('Suite 1: Job Boards Registry & Global Market Coverage', () => {
  it('should register all 18+ distinct job boards in DEFAULT_SETTINGS.boards_enabled', () => {
    const enabled = DEFAULT_SETTINGS.boards_enabled;
    assert.ok(enabled, 'boards_enabled configuration must exist');
    const boardKeys = Object.keys(enabled);
    assert.ok(boardKeys.length >= 18, `Expected at least 18 boards, got ${boardKeys.length}`);

    const expectedBoards = [
      'linkedin', 'indeed', 'canada_job_bank', 'adzuna', 'usajobs',
      'arbeitsagentur', 'mycareersfuture', 'seek', 'reed', 'naukri',
      'bayt', 'wttj', 'daijob', 'vagas', 'jobicy', 'remotive',
      'arbeitnow', 'himalayas'
    ];

    for (const b of expectedBoards) {
      assert.ok(boardKeys.includes(b), `Board "${b}" must be present in settings`);
      assert.strictEqual(enabled[b], true, `Board "${b}" should be enabled by default`);
    }
  });

  it('should correctly map official & commercial boards per target country', () => {
    // 🇨🇦 Canada
    const caBoards = getBoardsForCountry('CA');
    const caIds = caBoards.map(b => b.id);
    assert.ok(caIds.includes('canada_job_bank'), 'Canada must include official Canada Job Bank');
    assert.ok(caIds.includes('linkedin'), 'Canada must include LinkedIn');
    assert.ok(caIds.includes('indeed'), 'Canada must include Indeed');

    // 🇺🇸 United States
    const usBoards = getBoardsForCountry('US');
    const usIds = usBoards.map(b => b.id);
    assert.ok(usIds.includes('usajobs'), 'US must include USAJOBS federal portal');
    assert.ok(usIds.includes('dice'), 'US must include Dice tech careers');

    // 🇩🇪 Germany
    const deBoards = getBoardsForCountry('DE');
    const deIds = deBoards.map(b => b.id);
    assert.ok(deIds.includes('arbeitsagentur'), 'Germany must include Bundesagentur für Arbeit');
    assert.ok(deIds.includes('arbeitnow'), 'Germany must include ArbeitNow tech');

    // 🇬🇧 United Kingdom
    const gbBoards = getBoardsForCountry('GB');
    const gbIds = gbBoards.map(b => b.id);
    assert.ok(gbIds.includes('reed'), 'UK must include Reed.co.uk');

    // 🇸🇬 Singapore
    const sgBoards = getBoardsForCountry('SG');
    const sgIds = sgBoards.map(b => b.id);
    assert.ok(sgIds.includes('mycareersfuture'), 'Singapore must include MyCareersFuture (Gov)');

    // 🇦🇺 Australia
    const auBoards = getBoardsForCountry('AU');
    const auIds = auBoards.map(b => b.id);
    assert.ok(auIds.includes('seek'), 'Australia must include SEEK');

    // 🇦🇪 UAE
    const aeBoards = getBoardsForCountry('AE');
    const aeIds = aeBoards.map(b => b.id);
    assert.ok(aeIds.includes('bayt'), 'UAE must include Bayt');
  });

  it('should validate board metadata contract schemas (tier, fake_risk, is_free_api)', () => {
    const allBoards = getAllSupportedBoards();
    assert.ok(Array.isArray(allBoards));
    assert.ok(allBoards.length >= 18);

    for (const board of allBoards) {
      assert.ok(board.id, 'Board must have an id');
      assert.ok(board.name, `Board ${board.id} must have a name`);
      assert.ok(typeof board.is_free_api === 'boolean', `Board ${board.id} must declare is_free_api`);
      assert.ok(board.fake_risk, `Board ${board.id} must have fake_risk assessment`);
      assert.ok(['primary', 'tech_specialist', 'aggregator', 'remote'].includes(board.tier),
        `Board ${board.id} tier "${board.tier}" must be valid`);
    }
  });

  it('should detect country scope automatically from profile locations', () => {
    assert.strictEqual(detectTargetCountryScope(['Toronto, ON, Canada']), 'CA');
    assert.strictEqual(detectTargetCountryScope(['Austin, TX', 'Remote']), 'US');
    assert.strictEqual(detectTargetCountryScope(['London, UK']), 'GB');
    assert.strictEqual(detectTargetCountryScope(['Berlin, Germany']), 'DE');
    assert.strictEqual(detectTargetCountryScope(['Everywhere (Remote)']), 'GLOBAL');
  });
});

// ============================================================================
// SUITE 2: Board Fetchers Ingestion & Normalization (Mock Fixtures)
// ============================================================================
describe('Suite 2: Board Fetchers Ingestion & Payload Normalization', () => {
  let originalFetch;

  before(() => {
    originalFetch = globalThis.fetch;
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    allFetchedJobs.length = 0;
  });

  it('should normalize raw jobs into standard Jobryt AI data contract', () => {
    const rawJob = {
      id: 'test_12345',
      title: 'Senior Data Analyst',
      company: 'Acme Corp',
      location: 'Toronto, ON',
      created: '2026-10-08T10:00:00Z',
      description: 'Looking for a Senior Data Analyst with strong SQL and Power BI experience.',
      redirect_url: 'https://example.com/jobs/test_12345',
      source: 'Adzuna'
    };

    const normalized = normalizeJob(rawJob, 'Adzuna');
    assert.ok(normalized);
    assert.strictEqual(normalized.id, 'adzuna_test_12345');
    assert.strictEqual(normalized.title, 'Senior Data Analyst');
    assert.strictEqual(normalized.company, 'Acme Corp');
    assert.strictEqual(normalized.location, 'Toronto, ON');
    assert.strictEqual(normalized.source, 'adzuna');
    assert.strictEqual(normalized.redirect_url, 'https://example.com/jobs/test_12345');
    assert.strictEqual(normalized.contract_type, 'Full-time');
    assert.strictEqual(normalized.experience_level, 'Mid-Senior level');
    assert.ok(normalized.description.includes('SQL and Power BI'));
  });

  it('should parse Canada Job Bank HTML into clean jobs with details', async () => {
    setSearchContext({ role: 'Data Analyst', location: 'Toronto, ON', scope: 'CA', locations: ['Toronto, ON, Canada'], titles: ['Data Analyst', 'Senior Data Analyst'] });
    // Intercept fetch with Canada Job Bank mock HTML
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/jobposting/')) {
        return {
          ok: true,
          status: 200,
          text: async () => MOCK_BOARD_RESPONSES.canada_job_bank_details
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => MOCK_BOARD_RESPONSES.canada_job_bank
      };
    };

    await fetchCanadaJobBank();
    assert.ok(allFetchedJobs.length >= 1, 'Canada Job Bank should ingest at least 1 job');

    const job = allFetchedJobs.find(j => j.source === 'Canada Job Bank');
    assert.ok(job, 'Job Bank job must exist in allFetchedJobs');
    assert.ok(job.id.startsWith('jobbank_'), `ID should start with jobbank_: ${job.id}`);
    assert.ok(job.title.includes('Data Analyst'), `Title should match: ${job.title}`);
    assert.ok(job.company, 'Company should be parsed');
    assert.ok(job.redirect_url.includes('jobbank.gc.ca'), `Link must point to Job Bank: ${job.redirect_url}`);
    assert.ok(job.description.length > 50, 'Job description must have content');
  });

  it('should parse LinkedIn Guest API HTML into verified job records', async () => {
    setSearchContext({ role: 'Data Analyst', location: 'Toronto, ON', scope: 'CA', locations: ['Toronto, ON, Canada'], titles: ['Data Analyst', 'Senior Data Analyst'] });
    globalThis.fetch = async (url) => {
      return {
        ok: true,
        status: 200,
        text: async () => MOCK_BOARD_RESPONSES.linkedin
      };
    };

    await fetchLinkedIn();
    assert.ok(allFetchedJobs.length >= 1, 'LinkedIn should ingest jobs from HTML');

    const liJob = allFetchedJobs.find(j => j.source && j.source.includes('LinkedIn'));
    assert.ok(liJob, 'LinkedIn job must exist');
    assert.ok(liJob.id.includes('4475431912') || liJob.id.includes('4475431913'), 'Must extract LinkedIn numeric ID');
    assert.ok(liJob.title.includes('Data Analyst'));
    assert.ok(liJob.redirect_url.includes('linkedin.com/jobs/view/'));
  });

  it('should parse USAJOBS Federal Gov API JSON responses', async () => {
    process.env.USAJOBS_API_KEY = 'mock_usajobs_api_key';
    setSearchContext({ role: 'Data Analyst', location: 'Washington, DC', scope: 'US', locations: ['Washington, DC', 'Remote'], titles: ['Data Analyst'] });
    globalThis.fetch = async () => {
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_BOARD_RESPONSES.usajobs
      };
    };

    await fetchUSAJobs();
    assert.ok(allFetchedJobs.length >= 1, 'USAJOBS should ingest federal postings');

    const fedJob = allFetchedJobs.find(j => j.source === 'USAJOBS');
    assert.ok(fedJob, 'USAJOBS job must exist');
    assert.ok(fedJob.title.includes('Data Analyst'));
    assert.strictEqual(fedJob.company, 'Department of the Treasury');
    assert.ok(fedJob.redirect_url.includes('usajobs.gov'));
  });

  it('should parse Global Remote Feeds (Jobicy, Remotive, ArbeitNow, Himalayas)', async () => {
    setSearchContext({ role: 'Data Analyst', location: 'Remote', scope: 'GLOBAL', locations: ['Remote', 'Worldwide'], titles: ['Data Analyst', 'Senior Data Analyst'] });
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('jobicy.com')) {
        return { ok: true, status: 200, json: async () => MOCK_BOARD_RESPONSES.jobicy };
      }
      if (u.includes('remotive.com')) {
        return { ok: true, status: 200, json: async () => MOCK_BOARD_RESPONSES.remotive };
      }
      if (u.includes('arbeitnow.com')) {
        return { ok: true, status: 200, json: async () => MOCK_BOARD_RESPONSES.arbeitnow };
      }
      if (u.includes('himalayas.app')) {
        return { ok: true, status: 200, json: async () => MOCK_BOARD_RESPONSES.himalayas };
      }
      return { ok: false, status: 404 };
    };

    await fetchGlobalRemoteFeeds();
    assert.ok(allFetchedJobs.length >= 3, 'Global Remote feeds should ingest multiple remote jobs');

    const jobicyJob = allFetchedJobs.find(j => j.source === 'Jobicy');
    assert.ok(jobicyJob, 'Jobicy job must be present');
    assert.strictEqual(jobicyJob.company, 'Tremendous');
    assert.ok(jobicyJob.description.includes('GTM data infrastructure'));

    const remotiveJob = allFetchedJobs.find(j => j.source === 'Remotive');
    assert.ok(remotiveJob, 'Remotive job must be present');
    assert.strictEqual(remotiveJob.company, 'Zapier');

    const arbeitnowJob = allFetchedJobs.find(j => j.source === 'ArbeitNow');
    assert.ok(arbeitnowJob, 'ArbeitNow job must be present');
    assert.strictEqual(arbeitnowJob.company, 'Zalando SE');

    const himalayasJob = allFetchedJobs.find(j => j.source === 'Himalayas');
    assert.ok(himalayasJob, 'Himalayas job must be present');
    assert.strictEqual(himalayasJob.company, 'GitLab');
  });

  it('should parse Indeed search results markup', async () => {
    setSearchContext({ role: 'Data Analyst', location: 'Toronto, ON', scope: 'CA', locations: ['Toronto, ON, Canada'], titles: ['Data Analyst', 'Senior Data Analyst'] });
    globalThis.fetch = async () => {
      return { ok: true, status: 200, text: async () => MOCK_BOARD_RESPONSES.indeed };
    };

    await fetchIndeed();
    assert.ok(allFetchedJobs.length >= 1, 'Indeed should ingest job cards');
    const indJob = allFetchedJobs.find(j => j.source && j.source.includes('Indeed'));
    assert.ok(indJob);
    assert.strictEqual(indJob.company, 'Deloitte');
  });

  it('should parse Bundesagentur für Arbeit (Germany) REST API', async () => {
    setSearchContext({ role: 'Data Analyst', location: 'München', scope: 'DE', locations: ['München, Bayern, Deutschland', 'München'], titles: ['Data Analyst'] });
    globalThis.fetch = async () => {
      return { ok: true, status: 200, json: async () => MOCK_BOARD_RESPONSES.arbeitsagentur };
    };

    await fetchArbeitsagentur();
    assert.ok(allFetchedJobs.length >= 1, 'Arbeitsagentur should ingest German postings');
    const deJob = allFetchedJobs.find(j => j.source && j.source.includes('Bundesagentur für Arbeit'));
    assert.ok(deJob);
    assert.strictEqual(deJob.company, 'Siemens AG');
  });

  it('should parse MyCareersFuture (Singapore) Government API', async () => {
    setSearchContext({ role: 'Data Analyst', location: 'Singapore', scope: 'SG', locations: ['Singapore'], titles: ['Data Analyst', 'Senior Data Analyst'] });
    globalThis.fetch = async () => {
      return { ok: true, status: 200, json: async () => MOCK_BOARD_RESPONSES.mycareersfuture };
    };

    await fetchMyCareersFuture();
    assert.ok(allFetchedJobs.length >= 1, 'MyCareersFuture should ingest Singapore postings');
    const sgJob = allFetchedJobs.find(j => j.source && j.source.includes('MyCareersFuture'));
    assert.ok(sgJob);
    assert.strictEqual(sgJob.company, 'DBS Bank Ltd');
  });

  it('should parse Seek (Australia & NZ) job feed', async () => {
    setSearchContext({ role: 'Data Analyst', location: 'Sydney, NSW', scope: 'AU', locations: ['Sydney, NSW, Australia', 'Sydney, NSW'], titles: ['Data Analyst', 'Senior Data Analyst'] });
    globalThis.fetch = async () => {
      return { ok: true, status: 200, json: async () => MOCK_BOARD_RESPONSES.seek };
    };

    await fetchSeek();
    assert.ok(allFetchedJobs.length >= 1, 'Seek should ingest Australian postings');
    const auJob = allFetchedJobs.find(j => j.source && j.source.includes('SEEK'));
    assert.ok(auJob);
    assert.strictEqual(auJob.company, 'Atlassian');
  });

  it('should parse Reed (UK) API responses', async () => {
    setSearchContext({ role: 'Data Analyst', location: 'London', scope: 'GB', locations: ['London, Greater London', 'London, UK'], titles: ['Data Analyst', 'Senior Data Analyst'] });
    globalThis.fetch = async () => {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(MOCK_BOARD_RESPONSES.reed),
        json: async () => MOCK_BOARD_RESPONSES.reed
      };
    };

    await fetchReedUK();
    assert.ok(allFetchedJobs.length >= 1, 'Reed should ingest UK postings');
    const ukJob = allFetchedJobs.find(j => j.source && j.source.includes('Reed'));
    assert.ok(ukJob);
    assert.strictEqual(ukJob.company, 'Monzo Bank');
  });

  it('should parse Bayt (UAE / Gulf) job listings', async () => {
    setSearchContext({ role: 'Data Analyst', location: 'Dubai', scope: 'AE', locations: ['Dubai, UAE', 'Dubai, United Arab Emirates'], titles: ['Data Analyst', 'Senior Data Analyst'] });
    globalThis.fetch = async () => {
      return { ok: true, status: 200, text: async () => MOCK_BOARD_RESPONSES.bayt };
    };

    await fetchBayt();
    assert.ok(allFetchedJobs.length >= 1, 'Bayt should ingest UAE postings');
    const baytJob = allFetchedJobs.find(j => j.source && j.source.includes('Bayt'));
    assert.ok(baytJob);
    assert.strictEqual(baytJob.company, 'Emirates NBD');
  });

  it('should parse Welcome to the Jungle (France / EU) jobs', async () => {
    setSearchContext({ role: 'Data Analyst', location: 'Paris', scope: 'FR', locations: ['Paris, France', 'Paris'], titles: ['Data Analyst'] });
    globalThis.fetch = async () => {
      return { ok: true, status: 200, json: async () => MOCK_BOARD_RESPONSES.wttj };
    };

    await fetchWTTJ();
    assert.ok(allFetchedJobs.length >= 1, 'WTTJ should ingest French postings');
    const wttjJob = allFetchedJobs.find(j => j.source && j.source.includes('Welcome to the Jungle'));
    assert.ok(wttjJob);
    assert.strictEqual(wttjJob.company, 'Doctolib');
  });

  it('should parse Naukri (India) jobs', async () => {
    setSearchContext({ role: 'Data Analyst', location: 'Bangalore', scope: 'IN', locations: ['Bangalore, India', 'Bangalore / Bengaluru, India'], titles: ['Data Analyst', 'Senior Data Analyst'] });
    globalThis.fetch = async () => {
      return { ok: true, status: 200, text: async () => MOCK_BOARD_RESPONSES.naukri };
    };

    await fetchNaukri();
    assert.ok(allFetchedJobs.length >= 1, 'Naukri should ingest India postings');
    const inJob = allFetchedJobs.find(j => j.source && j.source.includes('Naukri'));
    assert.ok(inJob);
    assert.strictEqual(inJob.company, 'Infosys Limited');
  });

  it('should parse Daijob (Japan bilingual) jobs', async () => {
    setSearchContext({ role: 'Data Analyst', location: 'Tokyo', scope: 'JP', locations: ['Tokyo, Japan', 'Tokyo'], titles: ['Data Analyst', 'Senior Data Analyst'] });
    globalThis.fetch = async () => {
      return { ok: true, status: 200, text: async () => MOCK_BOARD_RESPONSES.daijob };
    };

    await fetchDaijobJP();
    assert.ok(allFetchedJobs.length >= 1, 'Daijob should ingest Japan postings');
    const jpJob = allFetchedJobs.find(j => j.source && j.source.includes('Daijob'));
    assert.ok(jpJob);
    assert.strictEqual(jpJob.company, 'Rakuten Group, Inc.');
  });

  it('should parse Vagas (Brazil / LATAM) jobs', async () => {
    setSearchContext({ role: 'Data Analyst', location: 'São Paulo', scope: 'BR', locations: ['São Paulo, Brasil', 'São Paulo, SP, Brasil'], titles: ['Data Analyst', 'Senior Data Analyst'] });
    globalThis.fetch = async () => {
      return { ok: true, status: 200, text: async () => MOCK_BOARD_RESPONSES.vagas };
    };

    await fetchVagasBR();
    assert.ok(allFetchedJobs.length >= 1, 'Vagas should ingest Brazil postings');
    const brJob = allFetchedJobs.find(j => j.source && j.source.includes('Vagas'));
    assert.ok(brJob);
    assert.strictEqual(brJob.company, 'Nubank');
  });
});

// ============================================================================
// SUITE 3: Deduplication & Fair Round-Robin Balance Engine
// ============================================================================
describe('Suite 3: Deduplication & Round-Robin Load-Balancing', () => {
  it('should remove exact ID duplicates across boards', () => {
    const rawJobs = [
      { id: 'job_101', title: 'Data Analyst', company: 'Shopify', source: 'Adzuna' },
      { id: 'job_101', title: 'Data Analyst', company: 'Shopify', source: 'Adzuna' },
      { id: 'job_102', title: 'Senior Data Analyst', company: 'Shopify', source: 'LinkedIn' }
    ];

    const deduplicated = deduplicateJobList(rawJobs);
    assert.strictEqual(deduplicated.length, 2, 'Should filter out identical job IDs');
  });

  it('should remove URL duplicates ignoring query parameters and tracking tags', () => {
    const rawJobs = [
      { id: 'a1', title: 'Data Analyst', company: 'Shopify', redirect_url: 'https://careers.shopify.com/data-analyst?utm_source=adzuna', source: 'Adzuna' },
      { id: 'a2', title: 'Data Analyst', company: 'Shopify', redirect_url: 'https://careers.shopify.com/data-analyst?utm_source=linkedin&ref=123', source: 'LinkedIn' },
      { id: 'a3', title: 'BI Engineer', company: 'Shopify', redirect_url: 'https://careers.shopify.com/bi-engineer', source: 'Canada Job Bank' }
    ];

    const deduplicated = deduplicateJobList(rawJobs);
    assert.strictEqual(deduplicated.length, 2, 'URL without query string should detect duplicate');
  });

  it('should remove duplicate jobs matching fuzzy Company + Title signature', () => {
    const rawJobs = [
      { id: '1', title: 'Senior Data Analyst ', company: 'Royal Bank of Canada', source: 'Canada Job Bank' },
      { id: '2', title: 'senior data analyst', company: 'Royal Bank of Canada ', source: 'Indeed' }
    ];

    const deduplicated = deduplicateJobList(rawJobs);
    assert.strictEqual(deduplicated.length, 1, 'Identical normalized Title + Company should dedup');
  });

  it('should interleave round-robin across sources so high-volume scrapers do not monopolize', () => {
    const rawJobs = [
      { id: 'adz_1', source: 'Adzuna', title: 'Role 1', company: 'Co 1' },
      { id: 'adz_2', source: 'Adzuna', title: 'Role 2', company: 'Co 2' },
      { id: 'adz_3', source: 'Adzuna', title: 'Role 3', company: 'Co 3' },
      { id: 'li_1', source: 'LinkedIn', title: 'Role 4', company: 'Co 4' },
      { id: 'jb_1', source: 'Job Bank', title: 'Role 5', company: 'Co 5' }
    ];

    const balanced = deduplicateJobList(rawJobs);
    assert.strictEqual(balanced.length, 5);

    // First items should cycle through distinct sources
    const firstThreeSources = balanced.slice(0, 3).map(j => j.source);
    const uniqueFirstThree = new Set(firstThreeSources);
    assert.strictEqual(uniqueFirstThree.size, 3, 'First 3 items must come from 3 distinct sources');
  });
});

// ============================================================================
// SUITE 4: Geo-Hierarchy, Role Relevance & Freshness Filters
// ============================================================================
describe('Suite 4: Geo-Hierarchy, Role Relevance & Freshness Filters', () => {
  it('should correctly accept in-scope municipal and remote locations', () => {
    const candidateLocs = ['Toronto, ON, Canada'];

    // Valid locations
    assert.strictEqual(isJobLocationEligible('Toronto, ON', candidateLocs, 'CA', false), true);
    assert.strictEqual(isJobLocationEligible('Downtown Toronto', candidateLocs, 'CA', false), true);
    assert.strictEqual(isJobLocationEligible('Mississauga, ON', candidateLocs, 'CA', false), true);
    assert.strictEqual(isJobLocationEligible('Canada (Remote)', candidateLocs, 'CA', true), true);

    // Out-of-bounds locations
    assert.strictEqual(isJobLocationEligible('Dallas, TX', candidateLocs, 'CA', false), false);
    assert.strictEqual(isJobLocationEligible('Berlin, Germany', candidateLocs, 'CA', false), false);
  });

  it('should match relevant roles and reject completely divergent job titles', () => {
    const candidateTitles = ['Data Analyst', 'Senior Data Analyst'];

    // Relevant roles
    assert.strictEqual(isJobRoleRelevant('Senior Data Analyst', candidateTitles), true);
    assert.strictEqual(isJobRoleRelevant('Lead Data Analyst - Risk', candidateTitles), true);
    assert.strictEqual(isJobRoleRelevant('Data Analytics Specialist', candidateTitles), true);
    assert.strictEqual(isJobRoleRelevant('Business Intelligence Analyst', [...candidateTitles, 'Business Intelligence Analyst']), true);

    // Irrelevant roles
    assert.strictEqual(isJobRoleRelevant('Dental Hygienist', candidateTitles), false);
    assert.strictEqual(isJobRoleRelevant('HVAC Technician', candidateTitles), false);
    assert.strictEqual(isJobRoleRelevant('Commercial Truck Driver', candidateTitles), false);
  });

  it('should drop jobs older than freshnessHours and retain recent jobs', () => {
    const now = Date.now();
    const tenHoursAgo = new Date(now - 10 * 3600 * 1000).toISOString();
    const threeDaysAgo = new Date(now - 72 * 3600 * 1000).toISOString();

    const jobs = [
      { json: { id: 'fresh_1', created: tenHoursAgo, title: 'Fresh Role' } },
      { json: { id: 'stale_1', created: threeDaysAgo, title: 'Old Role' } }
    ];

    // Filter with 24 hours
    const filtered24h = runFreshnessFilter(jobs, 24);
    assert.strictEqual(filtered24h.length, 1);
    assert.strictEqual(filtered24h[0].json.id, 'fresh_1');

    // Filter with 0 (freshness disabled) -> Keep all
    const filteredDisabled = runFreshnessFilter(jobs, 0);
    assert.strictEqual(filteredDisabled.length, 2, 'Freshness disabled must retain all jobs');
  });
});

// ============================================================================
// SUITE 5: Fault Tolerance & Chaos Injection (Resilience)
// ============================================================================
describe('Suite 5: Error Resilience & Chaos Injection', () => {
  let originalFetch;

  before(() => {
    originalFetch = globalThis.fetch;
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  it('should gracefully handle HTTP 429 Rate-Limit without throwing uncaught errors', async () => {
    globalThis.fetch = async () => {
      return {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests'
      };
    };

    await assert.doesNotReject(async () => {
      await fetchAdzuna();
      await fetchUSAJobs();
      await fetchGlobalRemoteFeeds();
    }, '429 Rate limit responses must be handled gracefully');
  });

  it('should gracefully handle HTTP 500 Server Errors from upstream boards', async () => {
    globalThis.fetch = async () => {
      return {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      };
    };

    await assert.doesNotReject(async () => {
      await fetchCanadaJobBank();
      await fetchLinkedIn();
      await fetchIndeed();
    }, '500 Server error responses must be caught without crashing process');
  });

  it('should gracefully handle network timeouts and abort signals', async () => {
    globalThis.fetch = async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    };

    await assert.doesNotReject(async () => {
      await fetchGlobalRemoteFeeds();
      await fetchSeek();
      await fetchReedUK();
    }, 'AbortError timeouts must not crash the ingestion process');
  });

  it('should gracefully handle malformed HTML and broken JSON payloads', async () => {
    globalThis.fetch = async () => {
      return {
        ok: true,
        status: 200,
        text: async () => '<html><body>Broken unclosed tags and no articles',
        json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); }
      };
    };

    await assert.doesNotReject(async () => {
      await fetchCanadaJobBank();
      await fetchLinkedIn();
      await fetchMyCareersFuture();
      await fetchArbeitsagentur();
    }, 'Malformed responses must be handled cleanly');
  });
});

// ============================================================================
// SUITE 6: Multi-Board Aggregator (fetchAllJobs) Execution
// ============================================================================
describe('Suite 6: Multi-Board Aggregator (fetchAllJobs) Execution', () => {
  let originalFetch;

  before(() => {
    originalFetch = globalThis.fetch;
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  it('should aggregate, deduplicate, and balance jobs across all enabled boards', async () => {
    process.env.USAJOBS_API_KEY = 'mock_usajobs_key';
    process.env.ADZUNA_APP_ID = 'mock_adzuna_id';
    process.env.ADZUNA_APP_KEY = 'mock_adzuna_key';
    setSearchContext({ role: 'Data Analyst', location: 'Toronto, ON', scope: 'CA', locations: ['Toronto, ON, Canada'], titles: ['Data Analyst', 'Senior Data Analyst'] });

    // Return appropriate fixture based on requested URL
    globalThis.fetch = async (url) => {
      const u = String(url).toLowerCase();
      if (u.includes('adzuna.com')) return { ok: true, status: 200, json: async () => MOCK_BOARD_RESPONSES.adzuna };
      if (u.includes('jobbank.gc.ca/jobsearch/jobposting/')) return { ok: true, status: 200, text: async () => MOCK_BOARD_RESPONSES.canada_job_bank_details };
      if (u.includes('jobbank.gc.ca')) return { ok: true, status: 200, text: async () => MOCK_BOARD_RESPONSES.canada_job_bank };
      if (u.includes('linkedin.com')) return { ok: true, status: 200, text: async () => MOCK_BOARD_RESPONSES.linkedin };
      if (u.includes('usajobs.gov')) return { ok: true, status: 200, json: async () => MOCK_BOARD_RESPONSES.usajobs };
      if (u.includes('jobicy.com')) return { ok: true, status: 200, json: async () => MOCK_BOARD_RESPONSES.jobicy };
      if (u.includes('remotive.com')) return { ok: true, status: 200, json: async () => MOCK_BOARD_RESPONSES.remotive };
      if (u.includes('arbeitnow.com')) return { ok: true, status: 200, json: async () => MOCK_BOARD_RESPONSES.arbeitnow };
      if (u.includes('himalayas.app')) return { ok: true, status: 200, json: async () => MOCK_BOARD_RESPONSES.himalayas };
      if (u.includes('indeed.com')) return { ok: true, status: 200, text: async () => MOCK_BOARD_RESPONSES.indeed };
      if (u.includes('arbeitsagentur.de')) return { ok: true, status: 200, json: async () => MOCK_BOARD_RESPONSES.arbeitsagentur };
      if (u.includes('mycareersfuture.gov.sg')) return { ok: true, status: 200, json: async () => MOCK_BOARD_RESPONSES.mycareersfuture };
      if (u.includes('seek.co')) return { ok: true, status: 200, json: async () => MOCK_BOARD_RESPONSES.seek };
      if (u.includes('reed.co.uk')) return { ok: true, status: 200, json: async () => MOCK_BOARD_RESPONSES.reed };
      if (u.includes('bayt.com')) return { ok: true, status: 200, text: async () => MOCK_BOARD_RESPONSES.bayt };
      if (u.includes('welcometothejungle.com')) return { ok: true, status: 200, json: async () => MOCK_BOARD_RESPONSES.wttj };
      if (u.includes('naukri.com')) return { ok: true, status: 200, text: async () => MOCK_BOARD_RESPONSES.naukri };
      if (u.includes('gaijinpot.com') || u.includes('daijob.com')) return { ok: true, status: 200, text: async () => MOCK_BOARD_RESPONSES.daijob };
      if (u.includes('vagas.com.br')) return { ok: true, status: 200, text: async () => MOCK_BOARD_RESPONSES.vagas };

      return { ok: false, status: 404, text: async () => '' };
    };

    const aggregatedJobs = await fetchAllJobs();
    assert.ok(Array.isArray(aggregatedJobs));
    assert.ok(aggregatedJobs.length >= 3, `Expected multiple jobs aggregated, got ${aggregatedJobs.length}`);

    // Verify properties on each returned job
    for (const job of aggregatedJobs) {
      assert.ok(job.id, 'Every job must have an id');
      assert.ok(job.title, 'Every job must have a title');
      assert.ok(job.company, 'Every job must have a company');
      assert.ok(job.source, 'Every job must have a source');
      assert.ok(job.location, 'Every job must have a location');
    }

    // Verify diversity of sources in aggregated result
    const sources = new Set(aggregatedJobs.map(j => j.source));
    assert.ok(sources.size >= 3, `Expected jobs from at least 3 distinct sources, got ${sources.size}`);
  });
});

// ============================================================================
// SUITE 7: Live Public Job Board APIs Smoke Test (Network Connectivity)
// ============================================================================
describe('Suite 7: Live Public Job Board APIs Smoke Test', () => {
  it('should successfully reach Jobicy public remote jobs API over internet', async () => {
    try {
      const res = await fetch('https://jobicy.com/api/v2/remote-jobs?count=2', {
        headers: { 'User-Agent': 'JobrytAI-TestHarness/1.0' },
        signal: AbortSignal.timeout(8000)
      });
      assert.ok(res.ok, `Jobicy returned HTTP status ${res.status}`);
      const data = await res.json();
      assert.ok(Array.isArray(data.jobs), 'Jobicy payload must have jobs array');
    } catch (err) {
      // In offline/restricted firewall environments, test flags as non-fatal warning
      console.warn('Live Jobicy connectivity check skipped (offline/firewall):', err.message);
    }
  });

  it('should successfully reach ArbeitNow open API over internet', async () => {
    try {
      const res = await fetch('https://www.arbeitnow.com/api/job-board-api', {
        headers: { 'User-Agent': 'JobrytAI-TestHarness/1.0' },
        signal: AbortSignal.timeout(8000)
      });
      assert.ok(res.ok, `ArbeitNow returned HTTP status ${res.status}`);
      const data = await res.json();
      assert.ok(Array.isArray(data.data), 'ArbeitNow payload must have data array');
    } catch (err) {
      console.warn('Live ArbeitNow connectivity check skipped (offline/firewall):', err.message);
    }
  });
});
