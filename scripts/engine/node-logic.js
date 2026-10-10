/**
 * node-logic.js — Core Evaluation and Filtering Logic
 *
 * PURPOSE:
 *   Provides the deterministic filtering (freshness, deduplication, geo) and
 *   scoring heuristics used by the n8n pipelines before and after LLM calls.
 *
 * EXPORTS:
 *   - normalizeJob: Standardizes job payload formats across different APIs.
 *   - runFreshnessFilter: Drops jobs older than the user's setting.
 *   - runDedupFilter: Drops jobs already present in seen_jobs.
 *   - computeHeuristicScore: Fallback CPU-based scoring if the LLM fails.
 *   - evaluateDynamicTitleFit: String-matching algorithm for job titles.
 */

const assert = require('assert');
const { classifyWorkMode } = require('./board-requests');
const { locationGate, combine, WEIGHTS } = require('./scoring-v2');

// ── 1. Job Normalization ────────────────────────────────────────────────────
function normalizeJob(rawJob, defaultSource = 'unknown') {
  if (!rawJob) return null;

  let source = defaultSource;
  if (rawJob.source) source = String(rawJob.source).toLowerCase().replace(/\s+/g, '_');
  else if (rawJob.jobUrl?.includes('linkedin.com')) source = 'linkedin';
  else if (rawJob.adref || String(rawJob.__CLASS__ || '').includes('Adzuna')) source = 'adzuna';

  const rawId = String(rawJob.id || rawJob.jobUrl || rawJob.redirect_url || Math.random().toString(36).substring(7));
  const cleanId = rawId.startsWith(`${source}_`) ? rawId : `${source}_${rawId}`;

  const title = rawJob.title || rawJob.job_title || 'Untitled Role';
  const company = typeof rawJob.company === 'string' ? rawJob.company : rawJob.company?.display_name || rawJob.companyName || 'Unknown Company';
  const location = typeof rawJob.location === 'string' ? rawJob.location : rawJob.location?.display_name || 'Remote / Unspecified';
  const created = rawJob.created || rawJob.publishedAt || rawJob.postedTime || new Date().toISOString();
  let targetUrl = (rawJob.redirect_url || rawJob.job_url || rawJob.apply_url || rawJob.jobUrl || rawJob.applyUrl || rawJob.url || rawJob.link || '').trim();
  if (!targetUrl) {
    if (source === 'linkedin' || source === 'linkedin_jobs') {
      targetUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(title + ' ' + company)}`;
    } else {
      targetUrl = `https://www.google.com/search?q=${encodeURIComponent(title + ' ' + company + ' job')}`;
    }
  }

  return {
    id: cleanId,
    source,
    title,
    company,
    location,
    created,
    contract_type: rawJob.contractType || rawJob.contract_time || 'Full-time',
    experience_level: rawJob.experienceLevel || rawJob.experience_level || 'Mid-Senior level',
    apply_url: targetUrl,
    job_url: targetUrl,
    redirect_url: targetUrl,
    url: targetUrl,
    link: targetUrl,
    description: rawJob.description || rawJob.descriptionHtml || '',
  };
}

// ── 2. Deterministic Filtering ──────────────────────────────────────────────
function runFreshnessFilter(items, maxHours = null) {
  let limitHours = maxHours;

  if (limitHours == null) {
    try {
      const fs = require('fs');
      const path = require('path');
      const settingsPath = fs.existsSync('/data/config/settings.json')
        ? '/data/config/settings.json'
        : path.join(__dirname, '..', '..', 'data', 'config', 'settings.json');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (settings.freshness_hours !== undefined) limitHours = parseFloat(settings.freshness_hours);
    } catch (_) {}
  }
  
  if (limitHours == null || isNaN(limitHours)) limitHours = 24;

  // If freshness filter is disabled (0 or negative), pass all items through without date filtering
  if (limitHours <= 0) {
    return items;
  }

  const maxAgeMs = limitHours * 60 * 60 * 1000;
  const nowMs = Date.now();

  return items.filter(item => {
    const job = item.json || item;
    if (!job.created) return true;
    try {
      const createdMs = new Date(job.created).getTime();
      return isNaN(createdMs) || (nowMs - createdMs) <= maxAgeMs;
    } catch (_) {
      return true;
    }
  });
}

function runDedupFilter(items, seenIds) {
  const seenSet = new Set(seenIds.map(s => String(s).toLowerCase()));
  
  return items.filter(item => {
    const job = item.json || item;
    
    const isSeenId = job.id && seenSet.has(String(job.id).toLowerCase());
    const isSeenUrl = job.job_url && seenSet.has(String(job.job_url).toLowerCase());
    
    // Create a composite key for fuzzy deduping (Company + Title + Desc Snippet)
    const company = (job.company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const title = (job.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Hash the description to catch real differences. We hash the entire description to ensure we don't falsely dedup different jobs with the same boilerplate prefix.
    const cleanDesc = String(job.description || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let descHash = '';
    if (cleanDesc) {
      descHash = require('crypto').createHash('md5').update(cleanDesc).digest('hex').substring(0, 8);
    }
    
    const compositeKey = company && title ? `comp_${company}_tit_${title}_desc_${descHash}` : null;
    
    const isSeenComposite = compositeKey && seenSet.has(compositeKey);

    if (isSeenId || isSeenUrl || isSeenComposite) {
      return false; // Skip duplicate
    }

    // Mark as seen for subsequent items and future runs
    if (job.id) {
      seenIds.push(String(job.id).toLowerCase());
      seenSet.add(String(job.id).toLowerCase());
    }
    if (compositeKey) {
      seenIds.push(compositeKey);
      seenSet.add(compositeKey);
    }
    
    return true; // Keep unique job
  });
}

function runGeoFilter(items, profileObj = null) {
  let isJobLocationEligible, detectTargetCountryScope, isJobWorkplaceEligible;
  try {
    const gh = require('../core/geo-helper');
    isJobLocationEligible = gh.isJobLocationEligible;
    detectTargetCountryScope = gh.detectTargetCountryScope;
    isJobWorkplaceEligible = gh.isJobWorkplaceEligible;
  } catch (_) {
    return items; // Fallback if geo-helper is missing
  }

  const profile = profileObj || getMasterProfile();
  const locations = profile.locations || [];
  const countryScope = (profileObj && profileObj.country_scope && profileObj.country_scope !== 'AUTO')
    ? profileObj.country_scope
    : (detectTargetCountryScope ? detectTargetCountryScope(locations) : 'GLOBAL');
  const workType = profile.work_type || 'Open to All';

  return items.filter(item => {
    const job = item.json || item;
    const loc = job.location || '';
    const title = job.title || '';
    const desc = job.description || job.snippet || '';

    // Unified work-mode classification (hybrid in external city is strictly rejected)
    const mode = classifyWorkMode(title, loc, desc, { sourceRemote: job.remote === true });
    const isRemote = mode === 'remote';

    if (!isJobLocationEligible(loc, locations, countryScope, isRemote, desc)) {
      return false;
    }
    if (typeof isJobWorkplaceEligible === 'function' && !isJobWorkplaceEligible(loc, desc, title, workType, isRemote)) {
      return false;
    }
    return true;
  });
}

// ── 3. Heuristic Scoring (CPU Fallback) ─────────────────────────────────────
function evaluateDynamicTitleFit(jobTitle, targetTitles = []) {
  // Title fit is deprecated to prevent losing qualified roles across varied company titles
  return 90;
}

function getMasterProfile() {
  const fs = require('fs');
  const path = require('path');
  const paths = [
    process.env.DATA_DIR ? path.join(__dirname, '..', '..', 'data', 'profiles', 'master-profile.json') : null,
    path.join(__dirname, '../../../data/profiles/master-profile.json'),
    '/data/profiles/master-profile.json',
  ].filter(Boolean);

  for (const p of paths) {
    try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) {}
  }
  return {};
}

function computeHeuristicScore(job, profileObj = null, settingsObj = null) {
  if (!job) job = {};
  const desc = (job.description || '').toLowerCase();
  const title = (job.title || '').toLowerCase();
  const fullText = `${title} ${desc}`;

  const profile = profileObj || getMasterProfile();
  const settings = settingsObj || {};

  // Extract skills from profile / resume object or job.profile_skills
  let rawSkills = profile.skills || job.profile_skills || [];
  let flatSkillsList = [];
  if (Array.isArray(rawSkills)) {
    flatSkillsList = rawSkills.flatMap(s => typeof s === 'string' ? s : (s && s.name ? s.name : (s && s.skills ? s.skills : [])));
  } else if (rawSkills && typeof rawSkills === 'object') {
    flatSkillsList = Object.values(rawSkills).flatMap(v => Array.isArray(v) ? v : (typeof v === 'string' ? [v] : []));
  }
  const candidateSkills = flatSkillsList.map(s => String(s).toLowerCase()).filter(Boolean);

  const targetTitles = profile.target_titles || settings.target_roles || (profile.basics?.title ? [profile.basics.title] : []);
  const locations = profile.locations || settings.target_locations || (profile.basics?.location ? [profile.basics.location] : []);
  const countryScope = profile.country_scope || settings.target_country || 'GLOBAL';
  const workType = profile.work_type || settings.work_type || 'Open to All';

  let skillsScore = 70;
  let matchedSkills = [];
  let skillsUnstated = false;

  // Check if job description mentions no specific skills (edge case: discussion on phone screen)
  const hasSkillKeywords = /\b(requirements|qualifications|skills|experience with|proficient in|technologies|tools|knowledge of)\b/i.test(desc) ||
    candidateSkills.some(s => s.length > 2 && fullText.includes(s));

  if (!hasSkillKeywords || desc.trim().length < 150) {
    skillsScore = 90;
    skillsUnstated = true;
  } else if (candidateSkills.length > 0) {
    matchedSkills = candidateSkills.filter(s => s.length > 2 && fullText.includes(s));
    skillsScore = matchedSkills.length > 0
      ? Math.min(100, Math.round(60 + (matchedSkills.length / Math.min(candidateSkills.length, 5)) * 40))
      : 65;
  }

  // Seniority & Title Hierarchy Alignment
  const wantsExec = targetTitles.some(t => /\b(director|vp|vice president|head of|chief|svp|avp)\b/i.test(t));
  const wantsManager = wantsExec || targetTitles.some(t => /\b(manager|management)\b/i.test(t));
  const wantsLead = targetTitles.some(t => /\b(lead|principal|staff|architect)\b/i.test(t));

  const isExecTitle = /\b(director|vp|vice president|head of|chief|svp|avp)\b/i.test(title);
  const isManagerTitle = /\b(manager|general manager)\b/i.test(title) || isExecTitle;
  const isLeadTitle = /\b(team lead|tech lead|technical lead|lead analyst|lead developer|lead engineer|reporting lead|solutions lead)\b/i.test(title) || /^(lead|principal|staff|architect)\b/i.test(title);
  const isJuniorTitle = /\b(junior|jr\.?|intern|internship|co-op|entry level|graduate)\b/i.test(title);

  let seniorityScore = 80;
  const disqs = [];

  if (isExecTitle && !wantsExec) {
    seniorityScore = 20;
    disqs.push('Role is an Executive/Director position; candidate targets individual contributor roles.');
  } else if (isManagerTitle && !wantsManager) {
    seniorityScore = 25;
    disqs.push('Role is a Manager/Executive level position; candidate targets individual contributor roles.');
  } else if (isLeadTitle && !wantsLead) {
    seniorityScore = 35;
    disqs.push('Role is a Lead/Principal position requiring higher seniority than candidate target.');
  } else if ((wantsExec || wantsManager) && isJuniorTitle) {
    seniorityScore = 20;
    disqs.push('Role is an entry-level/junior position; candidate is seeking management or executive roles.');
  }

  // Deterministic Location Gate & Radial Score
  const gateRes = locationGate(job, profile, settings);
  const locationScore = gateRes.score;
  if (!gateRes.pass && gateRes.reason) {
    disqs.push(gateRes.reason);
  }

  const fnScore = seniorityScore; // For CPU heuristic fallback, function mirrors seniority/role tier

  // 4-Pillar Scoring v2: 45% Skills + 30% Seniority + 10% Function + 15% Location (Gate)
  const overall = combine({
    skills: skillsScore,
    seniority: seniorityScore,
    fn: fnScore,
    location: locationScore,
    gateFailed: !gateRes.pass,
    disqs
  });

  const minThreshold = (settings.score_threshold !== undefined)
    ? Number(settings.score_threshold)
    : ((typeof process !== 'undefined' && process.env?.MIN_SCORE_THRESHOLD) ? Number(process.env.MIN_SCORE_THRESHOLD) : 60);
  const isQualified = overall >= minThreshold && disqs.length === 0 && gateRes.pass;

  return {
    ...job,
    score: overall,
    overall_score: overall,
    should_apply: isQualified,
    skills_edge_case: skillsUnstated,
    scoring_pillars: {
      formula: '45% skills + 30% seniority + 10% function + 15% location (gate)',
      skills_fit_score: skillsScore,
      seniority_fit_score: seniorityScore,
      function_fit_score: fnScore,
      location_fit_score: locationScore,
      location_gate_passed: gateRes.pass,
      matched_skills: matchedSkills,
      unstated_skills_default: skillsUnstated
    },
    breakdown: {
      skills_fit_score: skillsScore,
      seniority_fit_score: seniorityScore,
      function_fit_score: fnScore,
      location_fit_score: locationScore,
      title_fit_score: fnScore
    },
    disqualification_reasons: disqs,
    priority_level: overall >= 85 ? 'High' : overall >= minThreshold ? 'Medium' : 'Low',
    key_matched_skills: matchedSkills.slice(0, 10).map(s => s.toUpperCase()),
    missing_skills: [],
    notes_concerns: skillsUnstated ? 'Skills not specified in posting — 90% default applied for recruiter call screening.' : '',
    reasoning: disqs.length > 0 ? disqs[0] : (skillsUnstated ? 'Skills not specified in posting (90% applied). Location and seniority match verified.' : `Evaluated core skills (${skillsScore}%), seniority (${seniorityScore}%), and location (${locationScore}%).`),
    why_this_fits: disqs.length > 0 ? 'Seniority / level mismatch' : `Alignment across skills (${skillsScore}%) and location (${locationScore}%)`,
    parse_error: false
  };
}

// ── 4. Quality Assurance (Workflow 2) ───────────────────────────────────────
function runClicheScanner(item) {
  const text = item.json.draft || '';
  const clicheRegex = /\b(delve|moreover|furthermore|leverage|seamless|testament to|unlock|robust|tapestry|elevate|boast)\b/gi;
  const hits = (text.match(clicheRegex) || []).length;
  item.json.cliche_hits = hits;
  item.json.needs_rewrite = hits > 2;
  return item;
}

function numericTokens(value) {
  const s = typeof value === 'string' ? value : JSON.stringify(value || '');
  return s.match(/\d[\d,.]*(?:%|[a-zA-Z]+)?/g) || [];
}

function multiset(arr) {
  const m = new Map();
  for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
  return m;
}

function runMetricVerification(originalDraft, humanizedDraft) {
  const beforeTokens = numericTokens(originalDraft);
  const afterTokens = numericTokens(humanizedDraft);

  const a = multiset(beforeTokens);
  const b = multiset(afterTokens);

  const changed =
    [...a.entries()].some(([k, n]) => (b.get(k) || 0) !== n) ||
    [...b.entries()].some(([k, n]) => (a.get(k) || 0) !== n);

  return {
    passed: !changed,
    changed,
    beforeTokens,
    afterTokens
  };
}

function runAtsCoverage(item) {
  const desc = item.json.description || '';
  const bullets = item.json.resume_bullets || [];
  
  const words = desc.split(/\W+/).filter(w => w.length > 4);
  const uniqueKeywords = [...new Set(words.map(w => w.toLowerCase()))];
  
  const resumeText = bullets.join(' ').toLowerCase();
  
  if (uniqueKeywords.length === 0) {
    item.json.ats_coverage_pct = 100;
    return item;
  }
  
  const covered = uniqueKeywords.filter(k => resumeText.includes(k));
  item.json.ats_coverage_pct = Math.round((covered.length / uniqueKeywords.length) * 100);
  return item;
}

// ── LLM Parse Score ─────────────────────────────────────────────────────────
const { extractLLMResponseText, parseLLMJsonResponse } = require('./llm-provider');

function runParseScore(item, profileObj = null, settingsObj = null) {
  let prof = profileObj;
  let sett = settingsObj;

  // Support invocation both as runParseScore(n8nItem, profile) and runParseScore(rawLlmText, job, profile, settings)
  if (typeof item === 'string') {
    const rawText = item;
    const jobData = (typeof profileObj === 'object' && profileObj && (profileObj.title || profileObj.description || profileObj.id)) ? profileObj : {};
    prof = (typeof settingsObj === 'object' && settingsObj && (settingsObj.skills || settingsObj.target_titles || settingsObj.basics)) ? settingsObj : (arguments[2] || null);
    sett = arguments[3] || null;
    item = { json: { ...jobData, rawText } };
  } else if (!item || !item.json) {
    item = { json: (item && typeof item === 'object') ? item : {} };
  }

  if (item.json?.disqualified_deterministic) {
    const res = {
      score: 0,
      overall_score: 0,
      breakdown: { title_fit_score: 0, skills_fit_score: 0, seniority_fit_score: 0, location_fit_score: 0 },
      scoring_pillars: { formula: '40% skills + 30% seniority + 30% location', skills_fit_score: 0, seniority_fit_score: 0, location_fit_score: 0 },
      should_apply: false,
      priority_level: 'Low',
      reasoning: item.json.deterministic_reasoning,
      parse_error: false
    };
    Object.assign(item.json, res);
    Object.assign(item, res);
    return item;
  }

  // 1. If LLM provided rawText, parse it safely
  let parsed = null;
  if (item.json?.rawText) {
    parsed = parseLLMJsonResponse(item.json.rawText);
  } else if (item.json?.breakdown) {
    parsed = item.json;
  }

  // 2. Fallback: If LLM failed or response unparseable
  if (item.json?.llm_failed === true || !parsed) {
    const heuristic = computeHeuristicScore(item.json, prof, sett);
    item.json = { ...item.json, ...heuristic, scored_by: 'Heuristic' };
    item.json.reasoning = item.json.reasoning || "Heuristic Scorer evaluated this job because LLM was offline.";
    Object.assign(item, item.json);
    return item;
  }

  // 3. Deterministic Code Node Computation:
  const profile = prof || getMasterProfile();
  const settings = sett || {};
  const b = parsed.breakdown || {};
  const descText = String(item.json.description || item.json.snippet || item.json.details || '').trim();

  // Pillar 1: Skills Match (40% Weight) with 90% Edge Case
  let skillsFit = typeof b.skills_fit_score === 'number'
    ? b.skills_fit_score
    : (typeof parsed.skills_fit_score === 'number' ? parsed.skills_fit_score : 70);
  
  const hasNoSkillsListed = parsed.skills_edge_case === true ||
    (b.skills_fit_score === 90 && /skills not specified/i.test(parsed.notes_concerns || '')) ||
    (descText.length < 300 && !/\b(requirements|qualifications|skills|experience with|proficient in|technologies|tools)\b/i.test(descText)) ||
    (Array.isArray(parsed.missing_skills) && parsed.missing_skills.length === 0 && Array.isArray(parsed.key_matched_skills) && parsed.key_matched_skills.length === 0 && !/\b(sql|python|excel|power bi|aws|azure|gcp|react|java|javascript|c\+\+|c#|docker|kubernetes|tableau)\b/i.test(descText));

  if (hasNoSkillsListed && skillsFit < 90) {
    skillsFit = 90;
    parsed.skills_edge_case = true;
    parsed.skills_unstated_default = true;
    parsed.notes_concerns = parsed.notes_concerns ? `${parsed.notes_concerns} (Skills not specified in posting — 90% default applied for recruiter call screening.)` : 'Skills not specified in posting — 90% default applied for recruiter call screening.';
  }

  // Pillar 2: Seniority Match (30% Weight)
  let seniorityFit = typeof b.seniority_fit_score === 'number'
    ? b.seniority_fit_score
    : (typeof parsed.seniority_fit_score === 'number' ? parsed.seniority_fit_score : 75);
  const targetTitles = profile.target_titles || settings.target_roles || (profile.basics?.title ? [profile.basics.title] : []);
  const wantsExec = targetTitles.some(t => /\b(director|vp|vice president|head of|chief|svp|avp)\b/i.test(t));
  const wantsManager = wantsExec || targetTitles.some(t => /\b(manager|management)\b/i.test(t));
  const wantsLead = targetTitles.some(t => /\b(lead|principal|staff|architect)\b/i.test(t));
  const jobTitle = String(item.json.title || '').toLowerCase();

  const isExecTitle = /\b(director|vp|vice president|head of|chief|svp|avp)\b/i.test(jobTitle);
  const isManagerTitle = /\b(manager|general manager)\b/i.test(jobTitle) || isExecTitle;
  const isLeadTitle = /\b(team lead|tech lead|technical lead|lead analyst|lead developer|lead engineer|reporting lead|solutions lead)\b/i.test(jobTitle) || /^(lead|principal|staff|architect)\b/i.test(jobTitle);
  const isJuniorTitle = /\b(junior|jr\.?|intern|internship|co-op|entry level|graduate)\b/i.test(jobTitle);

  const disqs = Array.isArray(parsed.disqualification_reasons) ? [...parsed.disqualification_reasons] : [];

  if (isExecTitle && !wantsExec) {
    seniorityFit = Math.min(seniorityFit, 20);
    disqs.push('Role is an Executive/Director position; candidate targets individual contributor roles.');
  } else if (isManagerTitle && !wantsManager) {
    seniorityFit = Math.min(seniorityFit, 25);
    disqs.push('Role is a Manager/Executive level position; candidate targets individual contributor roles.');
  } else if (isLeadTitle && !wantsLead) {
    seniorityFit = Math.min(seniorityFit, 35);
    disqs.push('Role is a Lead/Principal position requiring higher seniority than candidate target.');
  } else if ((wantsExec || wantsManager) && isJuniorTitle) {
    seniorityFit = Math.min(seniorityFit, 20);
    disqs.push('Role is an entry-level/junior position; candidate is seeking management or executive roles.');
  }

  // Deterministic Location Gate & Radial Score
  const gateRes = locationGate(item.json, profile, settings);
  const locationFit = gateRes.score;
  if (!gateRes.pass && gateRes.reason) {
    disqs.push(gateRes.reason);
  }

  const fnFit = typeof b.function_fit_score === 'number'
    ? b.function_fit_score
    : (typeof b.title_fit_score === 'number' ? b.title_fit_score : 85);

  // 4-Pillar Scoring v2: 45% Skills + 30% Seniority + 10% Function + 15% Location (Gate)
  const overall = combine({
    skills: skillsFit,
    seniority: seniorityFit,
    fn: fnFit,
    location: locationFit,
    gateFailed: !gateRes.pass,
    disqs
  });

  const minThreshold = (settings.score_threshold !== undefined)
    ? Number(settings.score_threshold)
    : ((typeof process !== 'undefined' && process.env?.MIN_SCORE_THRESHOLD) ? Number(process.env.MIN_SCORE_THRESHOLD) : 60);
  const shouldApply = overall >= minThreshold && disqs.length === 0 && gateRes.pass;
  const priorityLevel = overall >= 80 ? 'High' : overall >= 65 ? 'Medium' : 'Low';
  const safetyTier = overall >= 80 ? 'Strongest Application' : overall >= 65 ? 'Safe Opportunity' : 'Stretch Opportunity';

  const merged = {
    ...parsed,
    score: overall,
    overall_score: overall,
    should_apply: shouldApply,
    priority_level: priorityLevel,
    safety_tier: safetyTier,
    disqualification_reasons: disqs,
    skills_edge_case: parsed.skills_edge_case || parsed.skills_unstated_default || false,
    scoring_pillars: {
      formula: '45% skills + 30% seniority + 10% function + 15% location (gate)',
      skills_fit_score: skillsFit,
      seniority_fit_score: seniorityFit,
      function_fit_score: fnFit,
      location_fit_score: locationFit,
      location_gate_passed: gateRes.pass,
      unstated_skills_default: Boolean(parsed.skills_edge_case || parsed.skills_unstated_default)
    },
    breakdown: {
      skills_fit_score: skillsFit,
      seniority_fit_score: seniorityFit,
      function_fit_score: fnFit,
      location_fit_score: locationFit,
      title_fit_score: fnFit
    },
    parse_error: false
  };

  Object.assign(item.json, merged);
  Object.assign(item, merged);

  return item;
}

module.exports = {
  normalizeJob,
  runFreshnessFilter,
  runDedupFilter,
  runGeoFilter,
  runParseScore,
  evaluateDynamicTitleFit,
  computeHeuristicScore,
  runClicheScanner,
  runAtsCoverage,
  runMetricVerification
};
