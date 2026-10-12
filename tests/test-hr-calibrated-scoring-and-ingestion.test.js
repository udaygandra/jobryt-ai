const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { isJobRoleRelevant } = require('../scripts/core/geo-helper');
const { computeHeuristicScore, runParseScore } = require('../scripts/engine/node-logic');

describe('Phase 31: Multi-Board Ingestion, Precision Matching & HR-Calibrated Scoring', () => {

  it('Test 1: LinkedIn and Job Bank ingestion pagination logic is unthrottled with 25-step pagination', () => {
    const fetchBoardsSource = fs.readFileSync(path.join(__dirname, '../scripts/engine/fetch-all-boards.js'), 'utf8');
    
    // Check LinkedIn 25-step pagination
    assert.ok(
      fetchBoardsSource.includes('start = page * 25'),
      'LinkedIn fetcher must paginate by 25-item intervals (start = page * 25)'
    );
    assert.ok(
      fetchBoardsSource.includes('page < 3') || fetchBoardsSource.includes('page <= 2'),
      'LinkedIn fetcher must paginate at least 3 pages (start = 0, 25, 50)'
    );
    assert.ok(
      fetchBoardsSource.includes('seenLiIds'),
      'LinkedIn fetcher must deduplicate seen IDs'
    );

    // Check Canada Job Bank multi-page pagination
    assert.ok(
      fetchBoardsSource.includes('page <= 3') && fetchBoardsSource.includes('seenJbIds'),
      'Canada Job Bank fetcher must paginate pages 1 to 3 with deduplication'
    );
  });

  it('Test 2: Role relevance strictly rejects electrical grid, cybersecurity/DLP, and architect roles for Data Analyst candidate', () => {
    const targetRoles = [
      'Data Analyst',
      'BI Analyst',
      'Analytics Engineer',
      'Data Governance Analyst',
      'Business Intelligence Developer',
      'Power Developer',
      'SQL Analyst',
      'Fraud Analyst',
      'Reporting Analyst'
    ];

    // Power Systems / Grid roles should NOT match "Power Developer"
    assert.strictEqual(
      isJobRoleRelevant('Power Systems Senior Consultant (Power Grid SME)', targetRoles),
      false,
      'Power Systems / Power Grid must NOT match Power Developer'
    );
    assert.strictEqual(
      isJobRoleRelevant('Electrical Substation Power Engineer', targetRoles),
      false,
      'Electrical Substation Engineer must NOT match Power Developer'
    );

    // Cybersecurity / DLP roles should NOT match "Data Analyst"
    assert.strictEqual(
      isJobRoleRelevant('Senior Specialist, Data Loss Prevention', targetRoles),
      false,
      'Data Loss Prevention specialist must NOT match Data Analyst'
    );
    assert.strictEqual(
      isJobRoleRelevant('Security Operations Center (SOC) Analyst', targetRoles),
      false,
      'SOC Security Analyst must NOT match Data Analyst'
    );

    // Enterprise / Solution Architect roles should NOT match "Data Analyst"
    assert.strictEqual(
      isJobRoleRelevant('Senior Data Architect', targetRoles),
      false,
      'Senior Data Architect must NOT match Data Analyst unless candidate explicitly targets Architect'
    );
    assert.strictEqual(
      isJobRoleRelevant('Principal Enterprise Architect', targetRoles),
      false,
      'Enterprise Architect must NOT match Data Analyst'
    );

    // Research / Pure Data Scientist should NOT match "Data Analyst" unless candidate explicitly targets Scientist
    assert.strictEqual(
      isJobRoleRelevant('Principal Data Scientist (Deep Learning / NLP)', targetRoles),
      false,
      'Data Scientist must NOT match Data Analyst unless explicitly targeted'
    );
  });

  it('Test 3: Role relevance accepts genuine target roles, governance roles, and Power Platform developer roles', () => {
    const targetRoles = [
      'Data Analyst',
      'BI Analyst',
      'Analytics Engineer',
      'Data Governance Analyst',
      'Business Intelligence Developer',
      'Power Developer',
      'SQL Analyst',
      'Fraud Analyst',
      'Reporting Analyst'
    ];

    assert.strictEqual(
      isJobRoleRelevant('Business Intelligence Analyst', targetRoles),
      true,
      'Business Intelligence Analyst must be relevant'
    );
    assert.strictEqual(
      isJobRoleRelevant('Analytics Engineer (dbt & Snowflake)', targetRoles),
      true,
      'Analytics Engineer must be relevant'
    );
    assert.strictEqual(
      isJobRoleRelevant('Pricing Analyst, Governance & Insights', targetRoles),
      true,
      'Pricing Analyst, Governance & Insights must be relevant'
    );
    assert.strictEqual(
      isJobRoleRelevant('Power Platform Developer', targetRoles),
      true,
      'Power Platform Developer must match Power Developer target'
    );
    assert.strictEqual(
      isJobRoleRelevant('Senior Reporting & SQL Analyst', targetRoles),
      true,
      'Reporting & SQL Analyst must be relevant'
    );
    assert.strictEqual(
      isJobRoleRelevant('Financial Crime & Fraud Analyst', targetRoles),
      true,
      'Fraud Analyst must be relevant'
    );
  });

  it('Test 4: HR-calibrated scoring scores partial matches (2-3 skills out of 20) in the 55-70% range rather than 85%+', () => {
    const heavyStackJob = {
      title: 'Senior Data Architect',
      description: 'Requires 10 years experience with AWS, Snowflake, Kubernetes, Scala, Spark, Kafka, Terraform, Cassandra, Java, Python, Airflow, dbt, Flink, Iceberg, Databricks, Redshift, BigQuery, Docker, CI/CD, Microservices',
      location: 'Toronto, ON'
    };

    const candidateProfile = {
      skills: ['Python', 'SQL'],
      target_titles: ['Data Analyst'],
      locations: ['Toronto, ON, Canada'],
      country_scope: 'CA',
      work_type: 'Open to All'
    };

    const searchSettings = {
      score_threshold: 65,
      target_locations: ['Toronto, ON, Canada'],
      target_country: 'CA',
      work_type: 'Open to All'
    };

    const res = computeHeuristicScore(heavyStackJob, candidateProfile, searchSettings);

    // Candidate matches only Python out of ~18-20 stated technologies
    assert.ok(
      res.scoring_pillars.skills_fit_score <= 62,
      `Skills score for 2/20 tools should be in 50-62% range, got ${res.scoring_pillars.skills_fit_score}%`
    );
    assert.ok(
      res.score <= 72,
      `Overall score for 2/20 tools should NOT exceed 72%, got ${res.score}%`
    );
    assert.ok(
      res.score >= 50,
      `HR-encouraging stance (+20% baseline) should prevent score dropping below 50%, got ${res.score}%`
    );
  });

  it('Test 5: High match jobs (candidate possesses core required tools) score 80%+', () => {
    const matchingJob = {
      title: 'BI Analyst',
      description: 'We are seeking a BI Analyst proficient in SQL, Power BI, Tableau, Snowflake, and Python to build automated dashboards and reports.',
      location: 'Toronto, ON'
    };

    const candidateProfile = {
      skills: ['SQL', 'Power BI', 'Tableau', 'Snowflake', 'Python'],
      target_titles: ['BI Analyst', 'Data Analyst'],
      locations: ['Toronto, ON, Canada'],
      country_scope: 'CA',
      work_type: 'Open to All'
    };

    const searchSettings = {
      score_threshold: 65,
      target_locations: ['Toronto, ON, Canada'],
      target_country: 'CA',
      work_type: 'Open to All'
    };

    const res = computeHeuristicScore(matchingJob, candidateProfile, searchSettings);

    assert.ok(
      res.scoring_pillars.skills_fit_score >= 85,
      `Skills score for matching all core tools should be >= 85%, got ${res.scoring_pillars.skills_fit_score}%`
    );
    assert.ok(
      res.score >= 80,
      `Overall score for strong match role should be >= 80%, got ${res.score}%`
    );
    assert.strictEqual(res.should_apply, true);
  });

  it('Test 6: Unstated skills default to 70% neutral screening tier instead of inflated 90%', () => {
    const unstatedJob = {
      title: 'Data Analyst',
      description: 'Join our growing team. Responsibilities and toolsets will be discussed during initial recruiter conversation.',
      location: 'Toronto, ON'
    };

    const candidateProfile = {
      skills: ['SQL', 'Python'],
      target_titles: ['Data Analyst'],
      locations: ['Toronto, ON, Canada'],
      country_scope: 'CA',
      work_type: 'Open to All'
    };

    const searchSettings = {
      score_threshold: 65,
      target_locations: ['Toronto, ON, Canada'],
      target_country: 'CA',
      work_type: 'Open to All'
    };

    const res = computeHeuristicScore(unstatedJob, candidateProfile, searchSettings);

    assert.strictEqual(
      res.scoring_pillars.unstated_skills_default,
      true,
      'unstated_skills_default flag must be true'
    );
    assert.strictEqual(
      res.scoring_pillars.skills_fit_score,
      70,
      'Unstated skills fit must default to 70% screening tier instead of 90%'
    );
    assert.ok(
      res.notes_concerns.includes('70% default') || res.notes_concerns.includes('70%'),
      'Notes must indicate 70% default screening tier'
    );
  });

  it('Test 7: Opportunities UI provides dynamic threshold chip and settings sync', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    assert.ok(
      indexHtml.includes('id="opp-threshold-filter-btn"'),
      'index.html must include #opp-threshold-filter-btn in score filters'
    );

    const oppJs = fs.readFileSync(path.join(__dirname, '../public/js/opportunities.js'), 'utf8');
    assert.ok(
      oppJs.includes('updateThresholdFilterButtons'),
      'opportunities.js must implement updateThresholdFilterButtons'
    );
    assert.ok(
      oppJs.includes('job.score ?? job.match_score ?? job.overall_score'),
      'filterOpportunities must accurately check score across all properties'
    );
  });

});
