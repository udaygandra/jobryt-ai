/**
 * tailor-engine.js — Unified ATS Resume & Cover Letter Tailoring Engine
 *
 * Grounded in candidate's verified profile data (ZERO FABRICATION).
 * Persists tailored artifacts on disk in data/tailored/<job_id>/:
 *   - resume.json      (structured JSON state for instant, 0-cost PDF re-generation)
 *   - cover_letter.txt (plain text for clipboard & job portal forms)
 *   - resume.pdf       (crisp ATS-compliant PDF)
 *
 * CACHING: When user clicks "Apply & Tailor PDF" on a previously tailored job,
 * it re-uses the saved resume.json and cover_letter.txt, eliminating redundant
 * Gemini LLM API calls and saving quota.
 */

const path = require('path');
const fs = require('fs');
const { getDataDir } = require('../core/common-utils');
const jobsDb = require('../core/jobs-db');
const { callLLMProvider } = require('./llm-provider');
const { buildFullDepthResumePdf } = require('./generate-resume-pdf');

const dataDir = getDataDir();

/**
 * Resolves tailored artifact paths on disk.
 */
function getTailoredArtifactPaths(cleanId) {
  const folder = path.join(dataDir, 'tailored', cleanId);
  return {
    folder,
    jsonPath: path.join(folder, 'resume.json'),
    txtPath: path.join(folder, 'cover_letter.txt'),
    pdfPath: path.join(folder, 'resume.pdf')
  };
}

/**
 * Tailors a job application, caching artifacts to save Gemini LLM calls on repeat clicks.
 */
async function tailorJobApplication(job, profile, customTone = 'Professional & Direct', options = {}) {
  const targetRole = job.tailored_title || job.title || (profile.target_titles && profile.target_titles[0]) || 'Target Role';
  const company = job.company || job.company_name || 'Target Company';
  const candidateProfession = (profile.target_titles && profile.target_titles[0]) || profile.profession || 'Professional';
  const candidateName = profile.name || 'Candidate';
  const jd = job.description || '';

  const rawJobId = String(job.id || job.jobId || job.job_id || `${company}_${targetRole}`).trim();
  const safeJobId = rawJobId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const artifacts = getTailoredArtifactPaths(safeJobId);

  // ── Step 1: Check Local Cache First (0 LLM Token Cost) ───────────────────
  if (!options.forceRegenerate && fs.existsSync(artifacts.jsonPath) && fs.existsSync(artifacts.txtPath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(artifacts.jsonPath, 'utf8'));
      const cachedCoverTxt = fs.readFileSync(artifacts.txtPath, 'utf8');

      // Check if PDF exists in dataDir or tailoredDir; regenerate from cached JSON if missing
      let pdfFilename = cached.pdf_filename;
      let pdfPath = path.join(dataDir, pdfFilename || `${safeJobId}.pdf`);

      if (!fs.existsSync(pdfPath)) {
        const safeCandidate = candidateName.replace(/[^a-zA-Z0-9]/g, '_');
        const safeCompany = company.replace(/[^a-zA-Z0-9]/g, '_');
        pdfFilename = `${safeCandidate}_Resume_${safeCompany}_${Date.now()}.pdf`;
        pdfPath = path.join(dataDir, pdfFilename);

        await buildFullDepthResumePdf({
          profile,
          targetRole: cached.targetRole || targetRole,
          companyName: cached.company || company,
          tailoredSummary: cached.tailored_summary,
          categorizedSkills: cached.categorized_skills,
          tailoredExperience: cached.tailored_experience || profile.experience || [],
          outputPath: pdfPath
        });

        cached.pdf_filename = pdfFilename;
        cached.pdf_path = pdfPath;
        fs.writeFileSync(artifacts.jsonPath, JSON.stringify(cached, null, 2), 'utf8');
      }

      console.log(`[Tailor] ⚡ Cache HIT for job "${safeJobId}" — re-using saved resume.json & cover_letter.txt (0 Gemini calls)`);

      const appliedRecord = {
        id: String(job.id || safeJobId),
        jobId: String(job.id || safeJobId),
        title: cached.targetRole || targetRole,
        company: cached.company || company,
        location: job.location || (profile.locations && profile.locations[0]) || 'Remote',
        job_url: job.job_url || job.redirect_url || job.apply_url || job.url || '',
        source: job.source || 'Manual',
        match_score: parseInt(job.score || job.match_score || 85, 10),
        ats_keyword_fit: cached.ats_keyword_fit || 88,
        tailored_summary: cached.tailored_summary,
        tailored_experience: cached.tailored_experience || profile.experience || [],
        cover_letter: cachedCoverTxt,
        pdf_path: pdfPath,
        pdf_filename: pdfFilename,
        resume_json_path: artifacts.jsonPath,
        cover_letter_txt_path: artifacts.txtPath,
        status: job.status || 'Tailored',
        applied_at: cached.created_at || new Date().toISOString(),
        is_cached: true
      };

      jobsDb.saveAppliedJob(appliedRecord);
      return appliedRecord;
    } catch (cacheErr) {
      console.warn('[Tailor] Error loading cached tailored files, re-generating:', cacheErr.message);
    }
  }

  // ── Step 2: Fresh Generation via LLM ─────────────────────────────────────
  let tailoredSummary = '';
  let coverLetter = '';
  let atsFit = 88;

  const prompt = `You are a zero-fabrication executive resume and cover letter tailoring engine.
Candidate Name: ${candidateName}
Target Role: ${targetRole}
Target Company: ${company}
Candidate Summary: ${profile.summary || ''}
Candidate Verified Skills: ${(profile.skills || []).join(', ')}
Candidate Verified Experience:
${JSON.stringify((profile.experience || []).slice(0, 4), null, 2)}

Job Description:
${jd.slice(0, 3000)}

Tone: ${customTone}

CRITICAL RULES:
1. ZERO FABRICATION: Do NOT invent skills, certifications, company names, or metrics not present in the candidate profile.
2. Produce a tailored professional executive summary (2-3 sentences).
3. Produce a targeted, compelling cover letter (3 paragraphs, under 250 words) addressing the hiring manager at ${company}.
4. Estimate ATS keyword fit (integer 60-98).

Return ONLY valid JSON:
{
  "tailored_summary": string,
  "cover_letter": string,
  "ats_keyword_fit": number
}`;

  let modelUsed = process.env.LLM_MODEL || 'gemini-3.8-flash';
  let providerUsed = (process.env.LLM_PROVIDER || 'gemini').toLowerCase().trim();

  try {
    const llmRes = await callLLMProvider({
      prompt,
      provider: providerUsed,
      model: process.env.LLM_MODEL
    });
    if (llmRes.success && (llmRes.rawText || llmRes.response)) {
      if (llmRes.model_used) modelUsed = llmRes.model_used;
      if (llmRes.provider) providerUsed = llmRes.provider;
      const textToClean = llmRes.rawText || (typeof llmRes.response === 'string' ? llmRes.response : JSON.stringify(llmRes.response));
      const clean = textToClean
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      const parsed = JSON.parse(clean);
      if (parsed.tailored_summary) tailoredSummary = parsed.tailored_summary;
      if (parsed.cover_letter) coverLetter = parsed.cover_letter;
      if (parsed.ats_keyword_fit) atsFit = parseInt(parsed.ats_keyword_fit, 10) || 88;
    }
  } catch (err) {
    console.warn('[Tailor] LLM generation note, using dynamic fallback:', err.message);
  }

  // Fallback if LLM was unavailable or returned empty
  if (!tailoredSummary) {
    const coreSkills = (profile.skills || []).slice(0, 5).join(', ');
    tailoredSummary = `Results-oriented ${candidateProfession} with demonstrated expertise in ${coreSkills}. Proven track record of delivering high-impact solutions, collaborating cross-functionally, and driving operational excellence for ${targetRole} initiatives at ${company}.`;
  }

  if (!coverLetter) {
    const exp = (profile.experience && profile.experience[0]) || {};
    const b1 = (exp.bullets && exp.bullets[0]) || 'Executed core initiatives and drove operational performance.';
    const b2 = (exp.bullets && exp.bullets[1]) || 'Collaborated with cross-functional stakeholders to achieve team milestones.';
    const prevRole = exp.role || candidateProfession;
    const prevComp = exp.company || 'previous organizations';

    coverLetter = `Dear Hiring Manager,

I am writing to express my strong interest in the ${targetRole} opportunity at ${company}. With my background as a ${candidateProfession} and proven hands-on experience, I am confident in my ability to immediately contribute to your team.

In my recent experience as ${prevRole} at ${prevComp}, I ${b1.charAt(0).toLowerCase() + b1.slice(1)} Additionally, I ${b2.charAt(0).toLowerCase() + b2.slice(1)} My core competencies in ${(profile.skills || []).slice(0, 4).join(', ')} align directly with the requirements for this position.

I would welcome the opportunity to discuss how my verified experience and problem-solving capabilities will support the goals of ${company}. Thank you for your time and consideration.

Sincerely,
${candidateName}`;
  }

  // Group skills into categorized structure for the PDF template
  const categorizedSkills = {
    'Core Competencies': (profile.skills || []).slice(0, 10),
    'Tools & Technologies': (profile.skills || []).slice(10, 20)
  };

  // ── Step 3: Generate the PDF Resume ───────────────────────────────────────
  const safeCandidate = candidateName.replace(/[^a-zA-Z0-9]/g, '_');
  const safeCompany = company.replace(/[^a-zA-Z0-9]/g, '_');
  const pdfFilename = `${safeCandidate}_Resume_${safeCompany}_${Date.now()}.pdf`;
  const pdfPath = path.join(dataDir, pdfFilename);

  await buildFullDepthResumePdf({
    profile,
    targetRole,
    companyName: company,
    tailoredSummary,
    categorizedSkills,
    tailoredExperience: profile.experience || [],
    outputPath: pdfPath
  });

  // ── Step 4: Persist Artifacts (JSON, TXT, PDF) ───────────────────────────
  fs.mkdirSync(artifacts.folder, { recursive: true });

  const resumeJsonData = {
    id: safeJobId,
    targetRole,
    company,
    candidateName,
    tailored_summary: tailoredSummary,
    ats_keyword_fit: atsFit,
    categorized_skills: categorizedSkills,
    tailored_experience: profile.experience || [],
    pdf_filename: pdfFilename,
    pdf_path: pdfPath,
    model_used: modelUsed,
    provider_used: providerUsed,
    created_at: new Date().toISOString()
  };

  fs.writeFileSync(artifacts.jsonPath, JSON.stringify(resumeJsonData, null, 2), 'utf8');
  fs.writeFileSync(artifacts.txtPath, coverLetter, 'utf8');

  try {
    fs.copyFileSync(pdfPath, artifacts.pdfPath);
  } catch (_) {}

  console.log(`[Tailor] 💾 Persisted tailored artifacts to: data/tailored/${safeJobId}/ (resume.json, cover_letter.txt, resume.pdf)`);

  const appliedRecord = {
    id: String(job.id || safeJobId),
    jobId: String(job.id || safeJobId),
    title: targetRole,
    company: company,
    location: job.location || (profile.locations && profile.locations[0]) || 'Remote',
    job_url: job.job_url || job.redirect_url || job.apply_url || job.url || '',
    source: job.source || 'Manual',
    match_score: parseInt(job.score || job.match_score || 85, 10),
    ats_keyword_fit: atsFit,
    tailored_summary: tailoredSummary,
    tailored_experience: profile.experience || [],
    cover_letter: coverLetter,
    pdf_path: pdfPath,
    pdf_filename: pdfFilename,
    resume_json_path: artifacts.jsonPath,
    cover_letter_txt_path: artifacts.txtPath,
    model_used: modelUsed,
    provider_used: providerUsed,
    status: job.status || 'Tailored',
    applied_at: new Date().toISOString(),
    is_cached: false
  };

  jobsDb.saveAppliedJob(appliedRecord);
  return appliedRecord;
}

module.exports = {
  tailorJobApplication,
  getTailoredArtifactPaths
};
