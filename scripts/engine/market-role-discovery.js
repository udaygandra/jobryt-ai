/**
 * market-role-discovery.js — Intelligent Market Target Roles Discovery Engine
 *
 * PURPOSE:
 *   Analyzes candidate profile (headline, experience, tools, domain, seniority)
 *   and discovers 4 to 10 real, searchable, market-validated job titles.
 *   Prevents single-role bottlenecks when resumes only state a single job title
 *   or when LLM/local extractors return sparse outputs.
 */

const BANNED_TITLE_REGEX = /\b(?:ninja|guru|rockstar|wizard)\b|^(?:employee|professional|staff|worker|confidential)$/i;

function cleanTitle(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/^[\s•*·\-–—\d.)\]]+\s*/, '')
    .replace(/[\s•*·\-–—]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Discover 4 to 10 authentic, market-validated target roles for a candidate.
 *
 * @param {Array<string>} existingTitles - Titles already proposed or parsed
 * @param {Object} profile - Master profile object
 * @returns {Array<string>} Up to 10 deduplicated, market-calibrated job titles
 */
function discoverMarketRoles(existingTitles = [], profile = {}) {
  const seen = new Set();
  const results = [];

  function addTitle(t) {
    if (!t || typeof t !== 'string') return;
    const cleaned = cleanTitle(t);
    if (!cleaned || cleaned.length < 3 || cleaned.length > 60) return;
    if (BANNED_TITLE_REGEX.test(cleaned)) return;
    const lower = cleaned.toLowerCase();
    const baseWithoutLevel = cleaned.replace(/\s+(?:II|III|IV|I)$/i, '').trim();
    if (baseWithoutLevel !== cleaned && seen.has(baseWithoutLevel.toLowerCase())) {
      return; // Deduplicate e.g. "Data Analyst II" when "Data Analyst" exists
    }
    if (!seen.has(lower)) {
      seen.add(lower);
      results.push(cleaned);
    }
  }

  // 1. Process existing titles first
  if (Array.isArray(existingTitles)) {
    for (const t of existingTitles) addTitle(t);
  } else if (typeof existingTitles === 'string') {
    existingTitles.split(/[,;\n]+/).forEach(addTitle);
  }

  // If candidate already has multiple distinct valid titles (>= 2), respect them without adding filler
  if (results.length >= 2) {
    return results.slice(0, 10);
  }

  // 2. Otherwise (results.length <= 1): expand using experience history, tools, and domain
  if (Array.isArray(profile.experience)) {
    for (const exp of profile.experience) {
      if (exp && exp.role) addTitle(exp.role);
    }
  }

  // If experience provided multiple distinct roles, respect them
  if (results.length >= 2) {
    return results.slice(0, 10);
  }

  // 3. Candidate only has 1 title or 0: discover full market equivalents based on stack & domain
  const allSkills = Array.isArray(profile.skills)
    ? profile.skills.map(s => String(s).toLowerCase())
    : [];
  const skillsText = allSkills.join(' ');
  const summaryText = (profile.summary || '').toLowerCase();
  const expBulletsText = Array.isArray(profile.experience)
    ? profile.experience.map(e => (e.role || '') + ' ' + (e.company || '') + ' ' + (Array.isArray(e.bullets) ? e.bullets.join(' ') : '')).join(' ').toLowerCase()
    : '';
  const fullCorpus = `${summaryText} ${skillsText} ${expBulletsText}`;

  const yearsExp = parseFloat(profile.total_experience_stated || profile.years_of_experience || 0) || 0;
  const isSenior = yearsExp >= 4 || /\bsenior\b/i.test(results[0] || '');

  const hasSkill = (term) => {
    const r = new RegExp(`\\b${term}\\b`, 'i');
    return r.test(skillsText) || r.test(fullCorpus);
  };

  const hasDomain = (term) => {
    const r = new RegExp(`\\b${term}\\b`, 'i');
    return r.test(summaryText) || r.test(expBulletsText);
  };

  const primaryRole = (results[0] || profile.role || '').toLowerCase();

  // ── Archetype 1: Data Analytics & Business Intelligence ───────────────────────
  const isDataAnalyst = /\b(data analyst|business intelligence|bi analyst|bi developer|analytics|reporting analyst|power bi)\b/i.test(primaryRole) ||
    ((hasSkill('sql') || hasSkill('power bi') || hasSkill('tableau')) && (hasSkill('analyst') || hasDomain('analytics') || hasDomain('dashboard')));

  if (isDataAnalyst) {
    addTitle('Data Analyst');
    addTitle('Business Intelligence Analyst');
    if (isSenior) addTitle('Senior Data Analyst');
    if (hasSkill('power bi')) addTitle('Power BI Developer');
    if (hasSkill('tableau')) addTitle('Tableau Developer');
    addTitle('Reporting Analyst');
    if (hasSkill('sql') && (hasSkill('python') || hasSkill('etl') || hasSkill('dbt') || hasSkill('snowflake') || hasSkill('bigquery'))) {
      addTitle('Analytics Engineer');
    }
    if (hasDomain('bank') || hasDomain('banking') || hasDomain('financial') || hasDomain('finance') || hasDomain('credit') || hasDomain('risk')) {
      addTitle('Financial Data Analyst');
    }
    if (hasDomain('health') || hasDomain('healthcare') || hasDomain('clinical') || hasDomain('hospital')) {
      addTitle('Healthcare Data Analyst');
    }
    if (hasDomain('energy') || hasDomain('trading') || hasDomain('power') || hasDomain('utilities')) {
      addTitle('Commercial Data Analyst');
    }
    addTitle('BI Analyst');
    addTitle('Data Analytics Specialist');
    if (isSenior) addTitle('Senior Business Intelligence Analyst');
    if (hasSkill('python') && (hasSkill('pandas') || hasSkill('machine learning') || hasSkill('statistical'))) {
      addTitle('Quantitative Data Analyst');
    }
  }

  // ── Archetype 2: Data Engineering ─────────────────────────────────────────────
  const isDataEngineer = /\b(data engineer|etl developer|big data|data pipeline)\b/i.test(primaryRole) ||
    ((hasSkill('spark') || hasSkill('airflow') || hasSkill('kafka') || hasSkill('dbt') || hasSkill('databricks')) && hasSkill('data'));

  if (isDataEngineer) {
    addTitle('Data Engineer');
    addTitle('Cloud Data Engineer');
    if (isSenior) addTitle('Senior Data Engineer');
    addTitle('ETL Developer');
    addTitle('Data Pipeline Engineer');
    if (hasSkill('aws')) addTitle('AWS Data Engineer');
    if (hasSkill('azure')) addTitle('Azure Data Engineer');
    if (hasSkill('gcp')) addTitle('GCP Data Engineer');
    addTitle('Big Data Engineer');
    addTitle('Data Platform Engineer');
  }

  // ── Archetype 3: Software Engineering / Full Stack ─────────────────────────────
  const isSoftwareEngineer = /\b(software engineer|developer|programmer|full stack|frontend|backend|web developer)\b/i.test(primaryRole) ||
    (hasSkill('javascript') || hasSkill('typescript') || hasSkill('react') || hasSkill('node') || hasSkill('python') || hasSkill('java') || hasSkill('c#') || hasSkill('golang'));

  if (isSoftwareEngineer && !isDataAnalyst) {
    addTitle('Software Engineer');
    addTitle('Full Stack Developer');
    addTitle('Software Developer');
    if (isSenior) addTitle('Senior Software Engineer');
    if (hasSkill('react') || hasSkill('angular') || hasSkill('vue') || hasSkill('frontend') || hasSkill('html')) {
      addTitle('Frontend Developer');
      addTitle('React Developer');
    }
    if (hasSkill('node') || hasSkill('express') || hasSkill('backend') || hasSkill('java') || hasSkill('spring') || hasSkill('python') || hasSkill('django') || hasSkill('.net')) {
      addTitle('Backend Developer');
      addTitle('Backend Software Engineer');
    }
    addTitle('Web Application Developer');
    if (isSenior) addTitle('Senior Full Stack Engineer');
  }

  // ── Archetype 4: DevOps / Cloud / Platform ─────────────────────────────────────
  const isDevOps = /\b(devops|cloud|sre|site reliability|platform engineer|infrastructure)\b/i.test(primaryRole) ||
    ((hasSkill('docker') || hasSkill('kubernetes') || hasSkill('terraform') || hasSkill('aws') || hasSkill('azure') || hasSkill('ci/cd')) && (hasDomain('infrastructure') || hasDomain('cloud') || hasDomain('devops')));

  if (isDevOps && !isSoftwareEngineer) {
    addTitle('DevOps Engineer');
    addTitle('Cloud Engineer');
    addTitle('Site Reliability Engineer (SRE)');
    addTitle('Platform Engineer');
    addTitle('Infrastructure Engineer');
    if (isSenior) addTitle('Senior DevOps Engineer');
    if (hasSkill('aws')) addTitle('AWS Cloud Engineer');
    if (hasSkill('azure')) addTitle('Azure Cloud Engineer');
    if (hasSkill('security')) addTitle('DevSecOps Engineer');
    if (isSenior) addTitle('Senior Cloud Engineer');
  }

  // ── Archetype 5: QA & Test Automation ──────────────────────────────────────────
  const isQA = /\b(qa|quality assurance|sdet|test engineer|automation tester)\b/i.test(primaryRole) ||
    (hasSkill('selenium') || hasSkill('playwright') || hasSkill('cypress') || hasSkill('cucumber') || hasSkill('sdet'));

  if (isQA) {
    addTitle('QA Automation Engineer');
    addTitle('Software Development Engineer in Test (SDET)');
    addTitle('Quality Assurance Analyst');
    addTitle('Test Automation Specialist');
    if (isSenior) addTitle('Senior QA Automation Engineer');
    addTitle('Software Test Engineer');
  }

  // ── Archetype 6: Cybersecurity ─────────────────────────────────────────────────
  const isCyber = /\b(cybersecurity|information security|infosec|soc analyst|security operations)\b/i.test(primaryRole) ||
    (hasSkill('siem') || hasSkill('splunk') || hasSkill('soc') || hasSkill('incident response') || hasSkill('cissp'));

  if (isCyber) {
    addTitle('Cybersecurity Analyst');
    addTitle('Information Security Analyst');
    addTitle('SOC Analyst');
    addTitle('Security Operations Specialist');
    if (isSenior) addTitle('Senior Cybersecurity Analyst');
    addTitle('Threat Intelligence Analyst');
  }

  // ── Archetype 7: Product Management ────────────────────────────────────────────
  const isPM = /\b(product manager|product owner|technical pm)\b/i.test(primaryRole) ||
    (hasSkill('product roadmap') || hasSkill('product management') || hasSkill('user stories') || hasSkill('backlog grooming'));

  if (isPM) {
    addTitle('Product Manager');
    addTitle('Technical Product Manager');
    addTitle('Product Owner');
    addTitle('Digital Product Manager');
    if (isSenior) addTitle('Senior Product Manager');
    addTitle('Associate Product Manager');
  }

  // ── Archetype 8: Finance & Accounting ──────────────────────────────────────────
  const isFinance = /\b(financial analyst|accountant|accounting|fp&a|auditor)\b/i.test(primaryRole);

  if (isFinance) {
    addTitle('Financial Analyst');
    addTitle('FP&A Analyst');
    addTitle('Corporate Financial Analyst');
    if (isSenior) addTitle('Senior Financial Analyst');
    addTitle('Financial Planning & Analysis Specialist');
  }

  // Fallback if still under 2
  if (results.length < 2 && results.length > 0) {
    const base = results[0];
    addTitle(base.replace(/\s+II$|\s+I$|\s+III$|\s+Junior$|\s+Senior$/i, '').trim());
    if (isSenior && !results.some(r => r.startsWith('Senior '))) {
      addTitle(`Senior ${results[0]}`);
    }
    addTitle(`${results[0]} Specialist`);
  }

  if (results.length === 0) {
    results.push('Data Analyst', 'Business Intelligence Analyst', 'Power BI Developer', 'Reporting Analyst');
  }

  return results.slice(0, 10);
}

module.exports = {
  discoverMarketRoles,
  cleanTitle
};
