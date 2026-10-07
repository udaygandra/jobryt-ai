/**
 * resume-validator.js — Strict CV / Resume Document Validator
 *
 * PURPOSE:
 *   Validates uploaded candidate documents before updating the Master Profile.
 *   Ensures that only authentic CVs and Resumes with structured work experience,
 *   skills, and career history are permitted.
 *
 * REJECTS:
 *   - Cover letters (Dear Hiring Manager, Sincerely, letter prose)
 *   - Job descriptions / job postings
 *   - Invoices, receipts, legal documents
 *   - Arbitrary text, essays, non-resume PDFs
 *   - Documents missing structured work experience or candidate qualifications
 */

function validateResumeDocument(parsedProfile, rawText = '', filename = '') {
  const text = (typeof rawText === 'string' ? rawText : '').trim();
  const lowerText = text.toLowerCase();
  const lowerName = (filename || '').toLowerCase();

  // 1. Check for empty or unreadable text
  if (text.length < 50) {
    return {
      isValid: false,
      reason: 'empty_document',
      message: 'The uploaded file is empty or cannot be read. Please upload a clear PDF, DOCX, or TXT file.'
    };
  }

  // 2. Explicit Non-Resume filenames (e.g. cover_letter.pdf, invoice.pdf, job_description.pdf)
  if (/\b(?:cover_?letter|cl_|invoice|receipt|statement|offer_?letter|resignation)\b/i.test(lowerName) &&
      !/\b(?:resume|cv)\b/i.test(lowerName)) {
    if (/\bcover_?letter\b/i.test(lowerName)) {
      return {
        isValid: false,
        reason: 'cover_letter',
        message: 'The uploaded file appears to be a Cover Letter. Please upload a proper CV or Resume containing your work experience.'
      };
    }
    return {
      isValid: false,
      reason: 'non_resume',
      message: 'The uploaded file appears to be a non-resume document. Please upload a proper CV or Resume.'
    };
  }

  // 3. Strict Cover Letter Detection
  const hasCoverSalutation = /\b(?:dear\s+(?:hiring\s+manager|recruiter|search\s+committee|selection\s+committee|sir\/madam|team|talent\s+acquisition|future\s+employer)|to\s+(?:whom\s+it\s+may\s+concern|the\s+hiring\s+(?:manager|team)))\b/i.test(text);
  const hasCoverSignOff = /\b(?:sincerely|yours\s+(?:faithfully|truly|sincerely)|warm\s+regards|respectfully|thank\s+you\s+for\s+your\s+time\s+and\s+consideration|i\s+look\s+forward\s+to\s+hearing\s+from\s+you)\b/i.test(text);
  const hasCoverApplicationPhrases = /\b(?:i\s+am\s+writing\s+to\s+(?:apply|express\s+my\s+(?:enthusiastic\s+)?interest|submit\s+my\s+application)|please\s+accept\s+this\s+letter\s+as\s+my\s+application|my\s+application\s+for\s+the\s+position\s+of)\b/i.test(text);

  // If document clearly has cover letter structure and lacks multiple structured experience positions
  const expCount = (parsedProfile && Array.isArray(parsedProfile.experience)) ? parsedProfile.experience.length : 0;
  if ((hasCoverSalutation || hasCoverApplicationPhrases) && (hasCoverSignOff || expCount <= 1)) {
    // Check if it lacks structured chronological resume sections
    const hasResumeStructure = /\b(?:professional\s+experience|work\s+experience|employment\s+history)\b/i.test(text) &&
                               /\b(?:education|academic\s+background)\b/i.test(text) &&
                               /\b(?:skills|technical\s+skills)\b/i.test(text);
    if (!hasResumeStructure || expCount === 0) {
      return {
        isValid: false,
        reason: 'cover_letter',
        message: 'The uploaded file appears to be a Cover Letter rather than a CV or Resume. Please upload a proper CV/Resume containing your work experience and skills.'
      };
    }
  }

  // 4. Job Description / Job Ad Detection
  const hasJobAdMarkers = (
    /\b(?:about\s+the\s+role|job\s+summary\s*:|what\s+you'?ll\s+do\s*:|what\s+we\s+offer\s*:|key\s+responsibilities\s*:|qualifications\s*:\s*\n|equal\s+opportunity\s+employer)\b/i.test(text) &&
    /\b(?:apply\s+(?:now|here|today)|submit\s+your\s+application\s+to|job\s+id\s*:|job\s+requisition)\b/i.test(text)
  );
  if (hasJobAdMarkers && (!parsedProfile || !parsedProfile.contact || !parsedProfile.contact.email)) {
    return {
      isValid: false,
      reason: 'job_description',
      message: 'The uploaded file appears to be a Job Description or Job Posting rather than a candidate CV/Resume.'
    };
  }

  // 5. Invoices / Receipts / Administrative documents
  const hasInvoiceMarkers = /\b(?:invoice\s+(?:number|no|#)|tax\s+invoice|billing\s+address|amount\s+due|subtotal|payment\s+due|purchase\s+order)\b/i.test(text);
  if (hasInvoiceMarkers) {
    return {
      isValid: false,
      reason: 'non_resume',
      message: 'The uploaded file appears to be an invoice or financial document rather than a CV/Resume.'
    };
  }

  // 6. Validate Core Resume Structure & Work Experience
  // Must have recognized career sections: Experience / Employment / Work History / Projects
  const hasExperienceSection = /\b(?:experience|employment|work\s+history|career\s+history|positions\s+held|professional\s+background|clinical\s+experience|research\s+experience|projects)\b/i.test(text);
  const hasEducationOrSkillsSection = /\b(?:education|academic|skills|technical\s+skills|technologies|certifications|competencies|expertise)\b/i.test(text);

  if (!hasExperienceSection && !hasEducationOrSkillsSection) {
    return {
      isValid: false,
      reason: 'missing_sections',
      message: 'The uploaded file lacks standard CV/Resume sections (no work experience, education, or skills sections found).'
    };
  }

  // Must have extracted at least 1 verifiable work experience role OR extensive project/academic experience
  const experiences = (parsedProfile && Array.isArray(parsedProfile.experience)) ? parsedProfile.experience : [];
  const validExperiences = experiences.filter(exp => {
    const hasRole = exp.role && exp.role !== 'Professional Role' && exp.role !== 'Direct Employer';
    const hasCompany = exp.company && exp.company !== 'Direct Employer';
    const hasDates = exp.dates || exp.start_date || exp.end_date;
    const hasBullets = Array.isArray(exp.bullets) && exp.bullets.length > 0;
    return (hasRole || hasCompany) && (hasDates || hasBullets);
  });

  if (validExperiences.length === 0) {
    return {
      isValid: false,
      reason: 'missing_work_experience',
      message: 'The uploaded file does not contain verifiable work experience. A valid CV/Resume must include your job titles, employers, dates, and responsibilities.'
    };
  }

  // Must have skills or education or candidate contact info
  const hasSkills = parsedProfile && Array.isArray(parsedProfile.skills) && parsedProfile.skills.length > 0;
  const hasEducation = parsedProfile && Array.isArray(parsedProfile.education) && parsedProfile.education.length > 0;
  const hasContact = parsedProfile && parsedProfile.contact && (parsedProfile.contact.email || parsedProfile.contact.phone || parsedProfile.contact.location || parsedProfile.name);

  if (!hasSkills && !hasEducation && !hasContact) {
    return {
      isValid: false,
      reason: 'insufficient_resume_data',
      message: 'The uploaded file does not contain sufficient candidate qualification details (missing skills, education, and contact information).'
    };
  }

  return {
    isValid: true,
    experienceCount: validExperiences.length,
    skillsCount: hasSkills ? parsedProfile.skills.length : 0,
    educationCount: hasEducation ? parsedProfile.education.length : 0
  };
}

module.exports = {
  validateResumeDocument
};
