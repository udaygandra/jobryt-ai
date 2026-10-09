/**
 * src/routes/profile.js — Master Profile & Resume Ingestion Routes
 * Handles profile retrieval, updating, resume uploading and ATS parsing.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getDataDir, readJsonFile } = require('../../scripts/core/common-utils');

const dataDir = getDataDir();
const profilesDir = path.join(dataDir, 'profiles');

function getMasterProfile() {
  const profilePath = path.join(profilesDir, 'master-profile.json');
  const examplePath = path.join(profilesDir, 'master-profile.example.json');
  if (fs.existsSync(profilePath)) {
    return readJsonFile(profilePath, {});
  }
  if (fs.existsSync(examplePath)) {
    const defaultData = readJsonFile(examplePath, {});
    fs.writeFileSync(profilePath, JSON.stringify(defaultData, null, 2), 'utf8');
    return defaultData;
  }
  return {
    name: 'Your Name',
    target_titles: ['Data Analyst', 'Software Engineer'],
    locations: ['Remote', 'Toronto, ON'],
    skills: ['JavaScript', 'Python', 'SQL', 'Docker', 'Git'],
    experience: [],
    writing_sample: ''
  };
}

// GET /api/profile
router.get('/', (req, res) => {
  try {
    const profile = getMasterProfile();
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/profile
router.post('/', (req, res) => {
  try {
    const profileData = req.body;
    if (!profileData || typeof profileData !== 'object') {
      return res.status(400).json({ error: 'Invalid profile data provided' });
    }

    const profilePath = path.join(profilesDir, 'master-profile.json');
    const backupPath = path.join(profilesDir, 'master-profile.backup.json');

    // Create backup of previous profile
    if (fs.existsSync(profilePath)) {
      try { fs.copyFileSync(profilePath, backupPath); } catch (_) {}
    }

    fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2), 'utf8');
    res.json({ success: true, message: 'Master profile updated successfully', profile: profileData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/profile/upload-resume
router.post('/upload-resume', async (req, res) => {
  const { filename, fileBase64, fileText } = req.body || {};
  if (!fileBase64 && !fileText) {
    return res.status(400).json({ error: 'No resume file content provided' });
  }

  const tempName = filename
    ? `upload-${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    : `upload-${Date.now()}.pdf`;
  const tempPath = path.join(profilesDir, tempName);

  try {
    if (fileBase64) {
      fs.writeFileSync(tempPath, Buffer.from(fileBase64, 'base64'));
    } else {
      fs.writeFileSync(tempPath, fileText, 'utf8');
    }

    let parsed = null;
    let rawText = fileText || '';
    if (!rawText && fs.existsSync(tempPath)) {
      try {
        const { extractTextFromFile } = require('../../scripts/engine/local-resume-extractor');
        rawText = await extractTextFromFile(tempPath);
      } catch (_) {}
    }

    // Early validation on raw text
    const { validateResumeDocument } = require('../../scripts/engine/resume-validator');
    const earlyValidation = validateResumeDocument(null, rawText, filename);
    if (!earlyValidation.isValid && earlyValidation.reason !== 'missing_work_experience' && earlyValidation.reason !== 'insufficient_resume_data') {
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (_) {}
      }
      return res.status(422).json({
        success: false,
        error: earlyValidation.message,
        reason: earlyValidation.reason,
        message: 'Format or resume is not correct please fill the below master profile from UI.'
      });
    }

    // 1. Waterfall LLM Parser if configured
    try {
      const { parseResume } = require('../../scripts/engine/resume-to-profile');
      parsed = await parseResume(tempPath, { dryRun: true, deleteAfterParsing: false });
    } catch (llmErr) {
      console.warn('⚠️ Waterfall LLM resume parser skipped or failed, using local resilient parser:', llmErr.message);
    }

    // 2. Fallback to Local Text & PDF parser
    if (!parsed) {
      const { extractResumeLocallyFromText } = require('../../scripts/engine/local-resume-extractor');
      parsed = extractResumeLocallyFromText(rawText || '');
    }

    if (parsed) {
      if (Array.isArray(parsed.skills) && /window\s+functions/i.test(rawText || '') && !parsed.skills.includes('Window Functions')) {
        const cteIdx = parsed.skills.indexOf('CTEs');
        if (cteIdx !== -1) parsed.skills.splice(cteIdx + 1, 0, 'Window Functions');
        else parsed.skills.push('Window Functions');
      }
      if (!Array.isArray(parsed.skills_familiar)) {
        parsed.skills_familiar = [];
      }
      const familiarMatches = (rawText || '').matchAll(/(?:,\s*|\b)([A-Za-z0-9\s/._-]+?)\s*\((?:familiar|working familiarity|basic)\)/gi);
      for (const fm of familiarMatches) {
        const fSkill = (fm[1] || '').trim();
        if (fSkill && fSkill.length > 1 && !parsed.skills_familiar.includes(fSkill)) {
          parsed.skills_familiar.push(fSkill);
        }
      }
      const { normalizeProfileFields } = require('../../scripts/engine/resume-to-profile');
      parsed = normalizeProfileFields(parsed);
    }

    // Clean up temporary file
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }

    // 3. Strict Validation: Ensure valid CV/Resume with verifiable work experience
    const validation = validateResumeDocument(parsed, rawText, filename);

    if (!validation.isValid) {
      return res.status(422).json({
        success: false,
        error: validation.message,
        reason: validation.reason,
        message: 'Format or resume is not correct please fill the below master profile from UI.'
      });
    }

    res.json({
      success: true,
      message: 'Resume parsed into detailed master profile successfully.',
      profile: parsed
    });
  } catch (err) {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
    console.error('Resume upload error:', err);
    res.status(500).json({ error: 'Failed to process resume: ' + err.message });
  }
});

module.exports = { router, getMasterProfile };
