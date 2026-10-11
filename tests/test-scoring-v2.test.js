/**
 * tests/test-scoring-v2.test.js
 *
 * Comprehensive Test Suite for Scoring Engine v2 Across 10 Diverse Personas.
 *
 * Validates:
 * 1. 4-Pillar Formula: 45% Skills + 30% Seniority + 10% Function + 15% Location (Gate).
 * 2. Location Hard Gate: Out-of-commute non-remote roles fail gate, are capped at <= 45%, and should_apply = false.
 * 3. Remote Roles: 100% location fit across all candidate locations within country/global scope.
 * 4. In-Radius Gradient: Proximity provides an 85–100% gradient but does NOT displace skills/seniority ranking.
 * 5. 10 Diverse Professional Personas (Engineers, Analysts, Executives, Product, Mobile, Security, ML, Writers, Quants).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  locationGate,
  combine,
  WEIGHTS
} = require('../scripts/engine/scoring-v2');

const {
  computeHeuristicScore,
  runParseScore
} = require('../scripts/engine/node-logic');

describe('Scoring Engine v2 — 10 Diverse Personas & Mathematical Guarantees', () => {

  it('1. Persona: Senior Full-Stack Engineer (Toronto, Hybrid/Onsite, R=30km)', () => {
    const resume = {
      skills: ['Node.js', 'React', 'TypeScript', 'PostgreSQL', 'Docker', 'AWS'],
      target_titles: ['Senior Full-Stack Engineer', 'Senior Software Engineer'],
      locations: ['Toronto, ON, Canada'],
      country_scope: 'CA',
      work_type: 'Hybrid'
    };
    const settings = {
      target_locations: ['Toronto, ON, Canada'],
      target_roles: ['Senior Full-Stack Engineer'],
      target_radius: 30,
      target_country: 'CA',
      work_type: 'Hybrid',
      score_threshold: 65
    };

    // Case A: Local Toronto in-radius role
    const torontoJob = {
      id: 'job-toronto-fs',
      title: 'Senior Full Stack Developer',
      company: 'Toronto FinTech',
      location: 'Toronto, ON',
      description: 'Senior Full Stack role requiring Node.js, React, TypeScript, and AWS.',
      seniority: 'Senior'
    };
    const resA = computeHeuristicScore(torontoJob, resume, settings);
    assert.strictEqual(resA.scoring_pillars.location_gate_passed, true);
    assert.ok(resA.overall_score >= 80, `Expected score >= 80, got ${resA.overall_score}`);
    assert.strictEqual(resA.should_apply, true);

    // Case B: Remote role in Canada
    const remoteJob = {
      id: 'job-canada-remote',
      title: 'Senior Software Engineer',
      company: 'Remote Inc',
      location: 'Remote, Canada',
      description: 'Fully remote. Looking for Senior engineer skilled in Node.js, React, TypeScript.',
      seniority: 'Senior',
      remote: true
    };
    const resB = computeHeuristicScore(remoteJob, resume, settings);
    assert.strictEqual(resB.scoring_pillars.location_gate_passed, true);
    assert.strictEqual(resB.scoring_pillars.location_fit_score, 100);
    assert.strictEqual(resB.should_apply, true);

    // Case C: Vancouver Hybrid job (Hard Gate Failure!)
    const vancouverJob = {
      id: 'job-van-hybrid',
      title: 'Senior Full Stack Engineer',
      company: 'BC Tech Corp',
      location: 'Vancouver, BC',
      description: 'Hybrid role: 3 days/week in our downtown Vancouver office. Required: Node.js, React, TypeScript, Docker.',
      seniority: 'Senior'
    };
    const resC = computeHeuristicScore(vancouverJob, resume, settings);
    assert.strictEqual(resC.scoring_pillars.location_gate_passed, false, 'Vancouver hybrid must fail location gate for Toronto candidate');
    assert.ok(resC.overall_score <= 45, `Out-of-commute non-remote role must cap at <= 45, got ${resC.overall_score}`);
    assert.strictEqual(resC.should_apply, false);
  });

  it('2. Persona: Junior Data Analyst (Calgary, Remote-preferred, R=50km)', () => {
    const resume = {
      skills: ['SQL', 'Python', 'Tableau', 'Excel', 'Power BI'],
      target_titles: ['Junior Data Analyst', 'Data Analyst'],
      locations: ['Calgary, AB, Canada'],
      country_scope: 'CA',
      work_type: 'Remote'
    };
    const settings = {
      target_locations: ['Calgary, AB, Canada'],
      target_roles: ['Junior Data Analyst', 'Data Analyst'],
      target_radius: 50,
      target_country: 'CA',
      work_type: 'Remote',
      score_threshold: 65
    };

    // Junior remote role -> High match
    const goodJob = {
      id: 'job-jr-remote',
      title: 'Junior Data Analyst',
      company: 'Cloud Insights',
      location: 'Remote, Canada',
      description: 'Entry-level / junior data analyst to work with SQL, Python, Tableau dashboards.',
      remote: true
    };
    const resGood = computeHeuristicScore(goodJob, resume, settings);
    assert.ok(resGood.overall_score >= 80, `Expected score >= 80, got ${resGood.overall_score}`);
    assert.strictEqual(resGood.should_apply, true);

    // Executive VP role in Calgary -> Seniority mismatch disqualification
    const execJob = {
      id: 'job-vp-data',
      title: 'Vice President of Data & Analytics',
      company: 'Energy Global',
      location: 'Calgary, AB',
      description: 'Executive leadership managing 40+ data scientists and analysts with SQL, Python.',
      seniority: 'Executive'
    };
    const resExec = computeHeuristicScore(execJob, resume, settings);
    assert.ok(resExec.overall_score <= 50, `Executive role for junior must score low, got ${resExec.overall_score}`);
    assert.strictEqual(resExec.should_apply, false);
  });

  it('3. Persona: VP of Engineering (New York, Onsite, R=25km)', () => {
    const resume = {
      skills: ['Engineering Management', 'System Architecture', 'Strategy', 'Hiring', 'Cloud Infrastructure'],
      target_titles: ['VP of Engineering', 'Director of Engineering'],
      locations: ['New York, NY, USA'],
      country_scope: 'US',
      work_type: 'On-site'
    };
    const settings = {
      target_locations: ['New York, NY, USA'],
      target_roles: ['VP of Engineering'],
      target_radius: 25,
      target_country: 'US',
      work_type: 'On-site',
      score_threshold: 70
    };

    // Executive role in NYC -> High match
    const execJob = {
      id: 'job-vpe-nyc',
      title: 'VP of Engineering',
      company: 'Manhattan Scale-up',
      location: 'New York, NY',
      description: 'VP of Engineering to lead organizational strategy, hiring, and system architecture.',
      seniority: 'Executive'
    };
    const resExec = computeHeuristicScore(execJob, resume, settings);
    assert.strictEqual(resExec.scoring_pillars.location_gate_passed, true);
    assert.ok(resExec.overall_score >= 80);
    assert.strictEqual(resExec.should_apply, true);

    // Intern / Junior SWE in NYC -> Seniority mismatch penalty
    const internJob = {
      id: 'job-intern-nyc',
      title: 'Software Engineer Intern',
      company: 'Manhattan Scale-up',
      location: 'New York, NY',
      description: 'Summer internship for undergrads learning cloud infrastructure.',
      seniority: 'Junior'
    };
    const resIntern = computeHeuristicScore(internJob, resume, settings);
    assert.ok(resIntern.overall_score <= 45, `Intern role for VP candidate must be capped <= 45, got ${resIntern.overall_score}`);
    assert.strictEqual(resIntern.should_apply, false);
  });

  it('4. Persona: DevOps / Platform Engineer (Austin, TX, Open to All, R=40km)', () => {
    const resume = {
      skills: ['Kubernetes', 'Terraform', 'AWS', 'CI/CD', 'Prometheus', 'Linux'],
      target_titles: ['DevOps Engineer', 'Platform Engineer'],
      locations: ['Austin, TX, USA'],
      country_scope: 'US',
      work_type: 'Open to All'
    };
    const settings = {
      target_locations: ['Austin, TX, USA'],
      target_roles: ['DevOps Engineer', 'Platform Engineer'],
      target_radius: 40,
      target_country: 'US',
      work_type: 'Open to All',
      score_threshold: 65
    };

    // Dallas onsite role (> 300km away) -> Fails gate
    const dallasJob = {
      id: 'job-dallas-onsite',
      title: 'Platform Engineer',
      company: 'Dallas Telecom',
      location: 'Dallas, TX',
      description: '100% on-site at our Dallas headquarters. Kubernetes, Terraform, AWS.',
      seniority: 'Mid-Senior'
    };
    const resDallas = computeHeuristicScore(dallasJob, resume, settings);
    assert.strictEqual(resDallas.scoring_pillars.location_gate_passed, false);
    assert.ok(resDallas.overall_score <= 45);
    assert.strictEqual(resDallas.should_apply, false);
  });

  it('5. Persona: Product Manager (London, UK, Hybrid, R=20km)', () => {
    const resume = {
      skills: ['Product Strategy', 'Roadmapping', 'Agile', 'User Research', 'Data Analysis', 'Jira'],
      target_titles: ['Product Manager', 'Senior Product Manager'],
      locations: ['London, UK'],
      country_scope: 'UK',
      work_type: 'Hybrid'
    };
    const settings = {
      target_locations: ['London, UK'],
      target_roles: ['Product Manager'],
      target_radius: 20,
      target_country: 'GB',
      work_type: 'Hybrid',
      score_threshold: 65
    };

    // London role
    const londonJob = {
      id: 'job-pm-london',
      title: 'Product Manager',
      company: 'City Tech UK',
      location: 'London, England',
      description: 'Lead roadmap and product strategy in London office 2 days/week. Agile and User Research required.'
    };
    const resLondon = computeHeuristicScore(londonJob, resume, settings);
    assert.strictEqual(resLondon.scoring_pillars.location_gate_passed, true);
    assert.strictEqual(resLondon.should_apply, true);

    // Manchester onsite role -> Fails gate
    const manchesterJob = {
      id: 'job-pm-mcr',
      title: 'Product Manager',
      company: 'Northern Logistics',
      location: 'Manchester, England',
      description: 'On-site position in Manchester. Product roadmap and Agile.'
    };
    const resMcr = computeHeuristicScore(manchesterJob, resume, settings);
    assert.strictEqual(resMcr.scoring_pillars.location_gate_passed, false);
    assert.ok(resMcr.overall_score <= 45);
  });

  it('6. Persona: Machine Learning Engineer (San Francisco, CA, Remote Only)', () => {
    const resume = {
      skills: ['PyTorch', 'TensorFlow', 'LLMs', 'Python', 'MLOps', 'Transformers'],
      target_titles: ['Machine Learning Engineer', 'AI Engineer'],
      locations: ['San Francisco, CA, USA'],
      country_scope: 'US',
      work_type: 'Remote'
    };
    const settings = {
      target_locations: ['San Francisco, CA, USA'],
      target_roles: ['Machine Learning Engineer'],
      target_radius: 25,
      target_country: 'US',
      work_type: 'Remote',
      score_threshold: 65
    };

    // Remote ML role
    const remoteJob = {
      id: 'job-ml-remote',
      title: 'Machine Learning Engineer',
      company: 'OpenAI Ecosystem Partner',
      location: 'Remote, USA',
      description: '100% remote. Building fine-tuning pipelines using PyTorch, Transformers, Python, MLOps.',
      remote: true
    };
    const resRemote = computeHeuristicScore(remoteJob, resume, settings);
    assert.strictEqual(resRemote.scoring_pillars.location_gate_passed, true);
    assert.ok(resRemote.overall_score >= 85);
    assert.strictEqual(resRemote.should_apply, true);
  });

  it('7. Persona: Mobile Developer (Montreal, QC, Hybrid, R=35km)', () => {
    const resume = {
      skills: ['Swift', 'iOS', 'SwiftUI', 'Objective-C', 'Xcode', 'CocoaPods'],
      target_titles: ['iOS Developer', 'Mobile Developer'],
      locations: ['Montreal, QC, Canada'],
      country_scope: 'CA',
      work_type: 'Hybrid'
    };
    const settings = {
      target_locations: ['Montreal, QC, Canada'],
      target_roles: ['iOS Developer'],
      target_radius: 35,
      target_country: 'CA',
      work_type: 'Hybrid',
      score_threshold: 65
    };

    // Montreal role
    const mtlJob = {
      id: 'job-mtl-ios',
      title: 'iOS Developer',
      company: 'Studio QC',
      location: 'Montreal, QC',
      description: 'Swift and SwiftUI mobile apps for iOS. Hybrid 2 days in Montreal.'
    };
    const resMtl = computeHeuristicScore(mtlJob, resume, settings);
    assert.strictEqual(resMtl.scoring_pillars.location_gate_passed, true);
    assert.strictEqual(resMtl.should_apply, true);

    // Toronto onsite role -> Fails gate
    const torJob = {
      id: 'job-tor-ios',
      title: 'iOS Developer',
      company: 'Bay St Mobile',
      location: 'Toronto, ON',
      description: 'On-site in downtown Toronto 5 days a week. Swift and iOS.'
    };
    const resTor = computeHeuristicScore(torJob, resume, settings);
    assert.strictEqual(resTor.scoring_pillars.location_gate_passed, false);
    assert.ok(resTor.overall_score <= 45);
  });

  it('8. Persona: Cybersecurity Analyst (Ottawa, ON, Onsite, R=25km)', () => {
    const resume = {
      skills: ['SIEM', 'Splunk', 'Incident Response', 'Network Security', 'Wireshark', 'SOC'],
      target_titles: ['Cybersecurity Analyst', 'Security Operations Analyst'],
      locations: ['Ottawa, ON, Canada'],
      country_scope: 'CA',
      work_type: 'On-site'
    };
    const settings = {
      target_locations: ['Ottawa, ON, Canada'],
      target_roles: ['Cybersecurity Analyst'],
      target_radius: 25,
      target_country: 'CA',
      work_type: 'On-site',
      score_threshold: 65
    };

    // Ottawa role
    const ottJob = {
      id: 'job-ott-sec',
      title: 'Cybersecurity Analyst',
      company: 'GovSecure Solutions',
      location: 'Ottawa, ON',
      description: 'On-site security operations analyst using SIEM, Splunk, Incident Response.'
    };
    const resOtt = computeHeuristicScore(ottJob, resume, settings);
    assert.strictEqual(resOtt.scoring_pillars.location_gate_passed, true);
    assert.strictEqual(resOtt.should_apply, true);
  });

  it('9. Persona: Technical Writer (Chicago, IL, Open to All, R=50km) — Unstated Skills Baseline', () => {
    const resume = {
      skills: ['Documentation', 'API Documentation', 'Markdown', 'Git', 'Confluence'],
      target_titles: ['Technical Writer', 'API Technical Writer'],
      locations: ['Chicago, IL, USA'],
      country_scope: 'US',
      work_type: 'Open to All'
    };
    const settings = {
      target_locations: ['Chicago, IL, USA'],
      target_roles: ['Technical Writer'],
      target_radius: 50,
      target_country: 'US',
      work_type: 'Open to All',
      score_threshold: 65
    };

    // Stealth startup posting without explicit skill requirements
    const unstatedJob = {
      id: 'job-chicago-writer',
      title: 'Technical Writer',
      company: 'Stealth Chicago Docs',
      location: 'Chicago, IL',
      description: 'Join our early-stage founding team. Work closely with product and engineering leaders. Role expectations and toolsets will be screened on the initial phone call.'
    };
    const resWriter = computeHeuristicScore(unstatedJob, resume, settings);
    assert.strictEqual(resWriter.scoring_pillars.unstated_skills_default, true);
    assert.strictEqual(resWriter.scoring_pillars.skills_fit_score, 70, 'Must award 70% skills baseline when JD omits skill list');
    assert.strictEqual(resWriter.scoring_pillars.location_gate_passed, true);
    assert.ok(resWriter.overall_score >= 70);
    assert.strictEqual(resWriter.should_apply, true);
  });

  it('10. Persona: Quantitative Researcher (Toronto, ON, Hybrid, R=25km) — Radius Precision', () => {
    const resume = {
      skills: ['Stochastic Calculus', 'Python', 'C++', 'Algorithmic Trading', 'Time Series'],
      target_titles: ['Quantitative Researcher', 'Quant Analyst'],
      locations: ['Toronto, ON, Canada'],
      country_scope: 'CA',
      work_type: 'Hybrid'
    };
    const settings = {
      target_locations: ['Toronto, ON, Canada'],
      target_roles: ['Quantitative Researcher'],
      commute_radius_km: 25, // 25km radius
      target_country: 'CA',
      work_type: 'Hybrid',
      score_threshold: 65
    };

    // North York, ON (~12km from Toronto) -> Within 25km radius -> Passes gate
    const northYorkJob = {
      id: 'job-ny-quant',
      title: 'Quantitative Researcher',
      company: 'North York Capital',
      location: 'North York, ON',
      description: 'Hybrid quant research: Python, C++, Time Series, Algorithmic Trading.'
    };
    const resNY = computeHeuristicScore(northYorkJob, resume, settings);
    assert.strictEqual(resNY.scoring_pillars.location_gate_passed, true, 'North York ON (~12km) must pass 25km radius gate');
    assert.ok(resNY.scoring_pillars.location_fit_score >= 80, `Expected in-radius gradient score >= 80, got ${resNY.scoring_pillars.location_fit_score}`);
    assert.strictEqual(resNY.should_apply, true);

    // Waterloo, ON (~100km away from Toronto) -> Outside 25km radius -> Fails gate
    const waterlooJob = {
      id: 'job-waterloo-quant',
      title: 'Quantitative Researcher',
      company: 'Kitchener-Waterloo Quant',
      location: 'Waterloo, ON',
      description: 'Hybrid quantitative research requiring Python and C++.'
    };
    const resWat = computeHeuristicScore(waterlooJob, resume, settings);
    assert.strictEqual(resWat.scoring_pillars.location_gate_passed, false, 'Waterloo ON (~100km) must fail 25km radius gate');
    assert.ok(resWat.overall_score <= 45);
    assert.strictEqual(resWat.should_apply, false);
  });

  it('Ranking Invariant: Within radius, Skills & Seniority drive ranking, not Location', () => {
    // Both jobs are in Toronto (in-radius).
    // Job 1 has 100% skills fit, 95% seniority.
    // Job 2 has 65% skills fit, 70% seniority.
    // Even if Job 2 is located right next door (100% loc) and Job 1 is slightly further (90% loc), Job 1 MUST rank higher.
    const score1 = combine({ skills: 100, seniority: 95, fn: 90, location: 90, gateFailed: false, disqs: [] });
    const score2 = combine({ skills: 65, seniority: 70, fn: 70, location: 100, gateFailed: false, disqs: [] });
    // 0.45*100 + 0.30*95 + 0.10*90 + 0.15*90 = 45 + 28.5 + 9 + 13.5 = 96
    // 0.45*65 + 0.30*70 + 0.10*70 + 0.15*100 = 29.25 + 21 + 7 + 15 = 72.25 -> 72
    assert.ok(score1 > score2, `Job 1 with superior skills/seniority (${score1}) must rank above Job 2 (${score2})`);
    assert.strictEqual(score1, 96);
    assert.strictEqual(score2, 72);
  });
});
