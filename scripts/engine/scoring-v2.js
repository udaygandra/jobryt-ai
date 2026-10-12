/**
 * scoring-v2.js — Unified 4-Pillar Scoring Engine with Location as Deterministic Gate
 *
 * FORMULA:
 *   45% Skills + 30% Seniority + 10% Function/Role + 15% Location (Gate)
 *
 * PHILOSOPHY:
 *   Location is a HARD GATE: if a physical/hybrid job is outside the candidate's commute
 *   radius, it is disqualified immediately and capped at <= 45%. Inside the radius or
 *   for genuine remote roles, proximity contributes up to 15 points, allowing skills
 *   and seniority to dictate true candidate quality without geographic distortion.
 */

const { classifyWorkMode } = require('./board-requests');
const { calculateLocationFitScore, isJobLocationEligible } = require('../core/geo-helper');

const WEIGHTS = Object.freeze({
  skills: 0.45,
  seniority: 0.30,
  fn: 0.10,
  location: 0.15
});

/**
 * Evaluates geographic eligibility and computes the deterministic location score.
 * @param {Object} job - Normalized job object { title, location, description, remote }
 * @param {Object} profile - User profile { locations, country_scope, work_type, commute_radius_km }
 * @param {Object} settings - User settings { target_locations, target_country, work_type, commute_radius_km }
 * @returns {{ pass: boolean, score: number, reason: string|null, mode: string }}
 */
function locationGate(job = {}, profile = {}, settings = {}) {
  const jobLoc = job.location || '';
  const jobTitle = job.title || '';
  const jobDesc = job.description || job.snippet || '';

  const locations = profile.locations || settings.target_locations || (profile.basics?.location ? [profile.basics.location] : []);
  const countryScope = profile.country_scope || settings.target_country || settings.country_scope || 'GLOBAL';
  const workType = profile.work_type || settings.work_type || 'Open to All';
  const commuteRadius = (settings && settings.commute_radius_km !== undefined)
    ? Number(settings.commute_radius_km)
    : ((settings && settings.target_radius !== undefined)
      ? Number(settings.target_radius)
      : ((profile && profile.commute_radius_km !== undefined)
        ? Number(profile.commute_radius_km)
        : ((profile && profile.target_radius !== undefined) ? Number(profile.target_radius) : 25)));

  const mode = classifyWorkMode(jobTitle, jobLoc, jobDesc, { sourceRemote: job.remote === true });
  const isRemote = mode === 'remote';

  // 1. Check basic geographic eligibility
  const eligible = isJobLocationEligible(jobLoc, locations, countryScope, isRemote, jobDesc);
  if (!eligible) {
    return {
      pass: false,
      score: 15,
      reason: 'Job location is outside candidate commuting area and is not a 100% remote nationwide role.',
      mode
    };
  }

  // 2. Compute deterministic radial / remote score
  let geoScore = 85;
  try {
    geoScore = calculateLocationFitScore(jobLoc, locations, countryScope, isRemote, workType, commuteRadius, jobDesc);
  } catch (_) {
    geoScore = isRemote ? 100 : 85;
  }

  if (geoScore < 40) {
    return {
      pass: false,
      score: geoScore,
      reason: 'Job location is outside candidate commuting area and is not a 100% remote nationwide role.',
      mode
    };
  }

  return {
    pass: true,
    score: geoScore,
    reason: null,
    mode
  };
}

/**
 * Combines pillar scores into a single weighted overall score.
 * Caps at 45 if gate failed or any disqualifications exist.
 */
function combine({ skills = 70, seniority = 80, fn = 85, location = 85, gateFailed = false, disqs = [] } = {}) {
  const s = Number(skills) || 0;
  const sen = Number(seniority) || 0;
  const f = Number(fn) || 0;
  const loc = Number(location) || 0;

  let overall = Math.round(
    (s * WEIGHTS.skills) +
    (sen * WEIGHTS.seniority) +
    (f * WEIGHTS.fn) +
    (loc * WEIGHTS.location)
  );

  const hasDisqs = Array.isArray(disqs) && disqs.length > 0;
  if (gateFailed || hasDisqs || loc < 40 || sen < 40) {
    overall = Math.min(overall, 45);
  }

  return Math.max(0, Math.min(100, overall));
}

module.exports = {
  WEIGHTS,
  locationGate,
  combine
};
