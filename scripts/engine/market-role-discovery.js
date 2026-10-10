/**
 * market-role-discovery.js — Intelligent Market Target Roles Discovery Engine
 *
 * PURPOSE:
 *   Analyzes candidate profile (headline, experience, tools, domain, seniority)
 *   and discovers 4 to 10 real, searchable, market-validated job titles.
 *   Prevents single-role bottlenecks when resumes only state a single job title
 *   or when LLM/local extractors return sparse outputs.
 *   Works universally for ANY skillset, industry, or discipline globally.
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
 * @returns {Array<string>} Up to 10 deduplicated, market-calibrated job titles (minimum 4)
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

  // If candidate already has multiple distinct valid titles (>= 4), respect them without adding filler
  if (results.length >= 4) {
    return results.slice(0, 10);
  }

  // 2. Otherwise: expand using experience history
  if (Array.isArray(profile.experience)) {
    for (const exp of profile.experience) {
      if (exp && exp.role) addTitle(exp.role);
    }
  }

  if (results.length >= 4) {
    return results.slice(0, 10);
  }

  // 3. Candidate has fewer than 4 titles: discover market equivalents based on stack & domain
  const allSkills = Array.isArray(profile.skills)
    ? profile.skills.map(s => String(s).toLowerCase().trim()).filter(Boolean)
    : [];
  const skillsText = allSkills.join(' ');
  const summaryText = (profile.summary || '').toLowerCase();
  const expBulletsText = Array.isArray(profile.experience)
    ? profile.experience.map(e => (e.role || '') + ' ' + (e.company || '') + ' ' + (Array.isArray(e.bullets) ? e.bullets.join(' ') : '')).join(' ').toLowerCase()
    : '';
  const fullCorpus = `${summaryText} ${skillsText} ${expBulletsText}`;

  const yearsExp = parseFloat(profile.total_experience_stated || profile.years_of_experience || 0) || 0;
  const isSenior = yearsExp >= 4 || /\bsenior\b/i.test(results[0] || profile.headline || '');

  const hasSkill = (term) => {
    const r = new RegExp(`\\b${term}\\b`, 'i');
    return r.test(skillsText) || r.test(fullCorpus);
  };

  const hasDomain = (term) => {
    const r = new RegExp(`\\b${term}\\b`, 'i');
    return r.test(summaryText) || r.test(expBulletsText);
  };

  const primaryRole = (results[0] || profile.role || profile.headline || '').toLowerCase();

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
  const isSoftwareEngineer = /\b(software engineer|developer|programmer|full\s*stack|frontend|front-end|backend|back-end|web\s*developer|react|node|javascript|typescript)\b/i.test(primaryRole) ||
    (hasSkill('javascript') || hasSkill('typescript') || hasSkill('react') || hasSkill('node') || hasSkill('full stack') || hasSkill('python') || hasSkill('java') || hasSkill('c#') || hasSkill('golang'));

  if (isSoftwareEngineer && !isDataAnalyst) {
    addTitle('Software Engineer');
    addTitle('Full Stack Developer');
    if (hasSkill('react') || hasSkill('angular') || hasSkill('vue') || hasSkill('frontend') || hasSkill('html') || hasSkill('javascript')) {
      addTitle('Frontend Developer');
      if (hasSkill('react')) addTitle('React Developer');
    }
    if (hasSkill('node') || hasSkill('express') || hasSkill('backend') || hasSkill('java') || hasSkill('spring') || hasSkill('python') || hasSkill('django') || hasSkill('.net') || hasSkill('postgres') || hasSkill('postgresql')) {
      addTitle('Backend Developer');
      if (hasSkill('node')) addTitle('Node.js Developer');
    }
    addTitle('Software Developer');
    addTitle('Full Stack Engineer');
    if (isSenior) {
      addTitle('Senior Software Engineer');
      addTitle('Senior Full Stack Engineer');
    }
    if (hasSkill('react') || hasSkill('angular') || hasSkill('vue') || hasSkill('frontend')) {
      addTitle('Frontend Engineer');
    }
    if (hasSkill('node') || hasSkill('backend') || hasSkill('express') || hasSkill('java') || hasSkill('python')) {
      addTitle('Backend Software Engineer');
    }
    if (hasSkill('typescript')) addTitle('TypeScript Developer');
    addTitle('Web Application Developer');
  }

  // ── Archetype 4: Mobile Engineering ───────────────────────────────────────────
  const isMobile = /\b(mobile|ios|android|swift|flutter|react native|kotlin)\b/i.test(primaryRole) ||
    (hasSkill('ios') || hasSkill('android') || hasSkill('swift') || hasSkill('kotlin') || hasSkill('flutter') || hasSkill('react native'));

  if (isMobile) {
    addTitle('Mobile Application Developer');
    addTitle('Mobile Software Engineer');
    if (hasSkill('ios') || hasSkill('swift')) addTitle('iOS Developer');
    if (hasSkill('android') || hasSkill('kotlin')) addTitle('Android Developer');
    if (hasSkill('react native')) addTitle('React Native Developer');
    if (hasSkill('flutter')) addTitle('Flutter Developer');
    if (isSenior) addTitle('Senior Mobile Developer');
    addTitle('Mobile App Engineer');
  }

  // ── Archetype 5: DevOps / Cloud / Platform ─────────────────────────────────────
  const isDevOps = /\b(devops|cloud|sre|site reliability|platform engineer|infrastructure)\b/i.test(primaryRole) ||
    ((hasSkill('docker') || hasSkill('kubernetes') || hasSkill('terraform') || hasSkill('aws') || hasSkill('azure') || hasSkill('ci/cd')) && (hasDomain('infrastructure') || hasDomain('cloud') || hasDomain('devops') || hasSkill('devops')));

  if (isDevOps) {
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

  // ── Archetype 6: QA & Test Automation ──────────────────────────────────────────
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

  // ── Archetype 7: Cybersecurity ─────────────────────────────────────────────────
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

  // ── Archetype 8: Product Management & Agile ────────────────────────────────────
  const isPM = /\b(product manager|product owner|technical pm|scrum master)\b/i.test(primaryRole) ||
    (hasSkill('product roadmap') || hasSkill('product management') || hasSkill('user stories') || hasSkill('backlog grooming') || hasSkill('agile'));

  if (isPM) {
    addTitle('Product Manager');
    addTitle('Technical Product Manager');
    addTitle('Product Owner');
    addTitle('Digital Product Manager');
    if (isSenior) addTitle('Senior Product Manager');
    addTitle('Associate Product Manager');
    if (hasSkill('scrum') || hasSkill('agile')) addTitle('Scrum Master');
  }

  // ── Archetype 9: Finance & Accounting ──────────────────────────────────────────
  const isFinance = /\b(financial analyst|accountant|accounting|fp&a|auditor)\b/i.test(primaryRole);

  if (isFinance) {
    addTitle('Financial Analyst');
    addTitle('FP&A Analyst');
    addTitle('Corporate Financial Analyst');
    if (isSenior) addTitle('Senior Financial Analyst');
    addTitle('Financial Planning & Analysis Specialist');
  }

  // ── Archetype 10: Healthcare & Nursing ─────────────────────────────────────────
  const isHealthcare = /\b(nurse|nursing|registered nurse|clinical|patient care|icu|hospital|rn)\b/i.test(primaryRole) ||
    hasDomain('nursing') || hasDomain('clinical') || hasSkill('registered nurse') || hasSkill('patient care');

  if (isHealthcare) {
    addTitle('Registered Nurse');
    addTitle('Clinical Nurse Specialist');
    addTitle('Staff Nurse');
    if (hasDomain('icu') || hasSkill('icu')) addTitle('ICU Registered Nurse');
    if (hasDomain('er') || hasSkill('emergency')) addTitle('Emergency Room Nurse');
    if (isSenior) addTitle('Charge Nurse');
    addTitle('Patient Care Coordinator');
    addTitle('Clinical Healthcare Specialist');
  }

  // ── Universal Dynamic Fallback for ANY uncatalogued role globally ──────────────
  if (results.length < 4 && results.length > 0) {
    const base = results[0];
    const core = base
      .replace(/^(?:Senior|Junior|Lead|Principal|Staff|Associate)\s+/i, '')
      .replace(/\s+(?:II|III|IV|I|Specialist|Consultant|Lead)$/i, '')
      .trim();

    if (core) {
      addTitle(core);
      if (isSenior) {
        addTitle(`Senior ${core}`);
        addTitle(`Lead ${core}`);
      } else {
        addTitle(`Junior ${core}`);
      }
      addTitle(`${core} Specialist`);
      addTitle(`${core} Consultant`);
      addTitle(`${core} Coordinator`);
    }

    // Expand using top candidate skills
    if (results.length < 4 && allSkills.length > 0) {
      for (const skill of allSkills.slice(0, 3)) {
        const capSkill = skill.charAt(0).toUpperCase() + skill.slice(1);
        addTitle(`${capSkill} Specialist`);
        if (results.length >= 4) break;
      }
    }
  }

  // If candidate had zero titles to begin with (derive from headline, skills, never hardcode)
  if (results.length === 0) {
    const headline = profile.headline || profile.role || (allSkills[0] ? `${allSkills[0]} Specialist` : 'Technical Specialist');
    const cleanedHeadline = cleanTitle(headline);
    addTitle(cleanedHeadline);
    addTitle(`Senior ${cleanedHeadline}`);
    addTitle(`${cleanedHeadline} Specialist`);
    addTitle(`${cleanedHeadline} Consultant`);
  }

  return results.slice(0, 10);
}

module.exports = {
  discoverMarketRoles,
  cleanTitle
};
