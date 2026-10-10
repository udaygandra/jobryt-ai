/**
 * title-synonyms.js — Contextual role synonyms for high-yield recall
 *
 * Provides up to 2 high-precision industry synonyms for known candidate roles.
 * Unknown or custom roles yield an empty list (safe fallback).
 */

const ROLE_SYNONYMS = Object.freeze({
  'data analyst': ['Business Intelligence Analyst', 'Reporting Analyst'],
  'senior data analyst': ['Senior BI Analyst', 'Senior Business Intelligence Analyst'],
  'business analyst': ['Functional Analyst', 'Systems Analyst'],
  'software engineer': ['Software Developer', 'Full Stack Developer'],
  'frontend developer': ['Frontend Engineer', 'UI Developer'],
  'backend developer': ['Backend Engineer', 'API Developer'],
  'devops engineer': ['Site Reliability Engineer', 'Cloud Engineer'],
  'data engineer': ['ETL Developer', 'Big Data Engineer'],
  'data scientist': ['Machine Learning Engineer', 'AI Specialist'],
  'qa engineer': ['Software Development Engineer in Test', 'Test Automation Engineer'],
  'scrum master': ['Agile Coach', 'Technical Project Manager'],
  'project manager': ['Technical Project Manager', 'Program Manager'],
  'product manager': ['Technical Product Manager', 'Associate Product Manager'],
  'accountant': ['Financial Accountant', 'Staff Accountant'],
  'financial analyst': ['FP&A Analyst', 'Corporate Finance Analyst'],
  'recruiter': ['Talent Acquisition Specialist', 'Technical Recruiter'],
  'hr manager': ['People Operations Manager', 'HR Business Partner'],
  'ux designer': ['Product Designer', 'UI/UX Designer']
});

/**
 * Returns up to 2 normalized synonyms for a given role title.
 * @param {string} role
 * @returns {string[]}
 */
function getTitleSynonyms(role) {
  if (!role || typeof role !== 'string') return [];
  const clean = role.toLowerCase().replace(/^(senior|sr\.?|junior|jr\.?|lead|principal)\s+/i, '').trim();
  const directMatch = ROLE_SYNONYMS[role.toLowerCase().trim()];
  if (directMatch) return directMatch.slice(0, 2);
  const cleanMatch = ROLE_SYNONYMS[clean];
  if (cleanMatch) return cleanMatch.slice(0, 2);
  return [];
}

module.exports = {
  getTitleSynonyms,
  ROLE_SYNONYMS
};
