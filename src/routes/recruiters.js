/**
 * src/routes/recruiters.js — Recruiter & Hiring Team Finder / X-Ray Search Generator
 */

const express = require('express');
const router = express.Router();
const { getMasterProfile } = require('./profile');

// GET /api/recruiters/search
router.get('/search', (req, res) => {
  try {
    const company = (req.query.company || '').trim();
    const city = (req.query.city || '').trim();
    if (!company) {
      return res.status(400).json({ error: 'Company parameter is required' });
    }

    const profile = getMasterProfile();
    const candidateRole = (profile.target_titles && profile.target_titles[0]) || 'Specialist';

    // Generate Google X-Ray Search queries for LinkedIn
    const locQuery = city ? `("${city}" OR Canada OR USA)` : '(Canada OR USA)';
    const xRayQuery1 = `site:linkedin.com/in/ ("recruiter" OR "talent acquisition" OR "technical recruiter" OR "hiring manager") "${company}" ${locQuery}`;
    const xRayQuery2 = `site:linkedin.com/in/ ("engineering manager" OR "director" OR "head of") "${company}" ${locQuery}`;

    const googleSearchUrl1 = `https://www.google.com/search?q=${encodeURIComponent(xRayQuery1)}`;
    const googleSearchUrl2 = `https://www.google.com/search?q=${encodeURIComponent(xRayQuery2)}`;
    const linkedInCompanyUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${company} recruiter`)}`;

    // Draft connection request note (≤300 chars for LinkedIn limit)
    const draftNote = `Hi there! I noticed your talent leadership at ${company} and recently applied for the ${candidateRole} role. My background aligns strongly with your team's mission. Would love to connect and share how I can add immediate value!`;

    res.json({
      success: true,
      company,
      city,
      xRaySearchUrl: googleSearchUrl1,
      leadershipSearchUrl: googleSearchUrl2,
      linkedInSearchUrl: linkedInCompanyUrl,
      draftLinkedInNote: draftNote
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router };
