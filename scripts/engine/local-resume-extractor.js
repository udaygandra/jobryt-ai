/**
 * local-resume-extractor.js
 *
 * Fast, offline-resilient local parser that extracts structured master profile data
 * (Experience, Education, Projects, Certifications, Skills, Contact) from raw resume text or PDF.
 */

const fs = require('fs');
const { calculateYearsOfExperience, normalizeCategorizedSkills, cleanDocxAndMarkdownArtifacts } = require('./resume-to-profile');

async function extractTextFromFile(filePath) {
  if (!fs.existsSync(filePath)) return '';
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();

  if (ext === '.pdf') {
    try {
      const pdfPkg = require('pdf-parse');
      const fileBuf = fs.readFileSync(filePath);
      if (typeof pdfPkg === 'function') {
        const res = await pdfPkg(fileBuf);
        return res?.text || '';
      } else if (pdfPkg?.PDFParse) {
        const parser = new pdfPkg.PDFParse({ data: fileBuf });
        await parser.load();
        const res = await parser.getText();
        return res?.text || '';
      }
    } catch (e) {
      console.warn('PDFParse local extraction warning:', e.message);
    }
  }

  // Fallback to reading file buffer directly as UTF-8
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return '';
  }
}

function extractResumeLocallyFromText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return null;
  }

  const cleanText = cleanDocxAndMarkdownArtifacts(rawText);
  const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);

  const profile = {
    name: '',
    target_titles: [],
    locations: [],
    contact: {
      email: '',
      phone: '',
      location: '',
      linkedin: '',
      github: ''
    },
    summary: '',
    skills: [],
    skills_categorized: [],
    experience: [],
    education: [],
    certifications: [],
    projects: []
  };

  // 1. Contact Extraction
  const emailMatch = cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) profile.contact.email = emailMatch[0];

  const phoneMatch = cleanText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) profile.contact.phone = phoneMatch[0];

  const linkedinMatch = cleanText.match(/linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i);
  if (linkedinMatch) profile.contact.linkedin = linkedinMatch[0];

  const githubMatch = cleanText.match(/github\.com\/([a-zA-Z0-9_-]+)/i);
  if (githubMatch) profile.contact.github = githubMatch[0];

  // Name heuristic: First non-blank line that doesn't contain email/phone/url
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    if (line.length > 2 && line.length < 50 && !line.includes('@') && !line.includes('http') && !line.includes('/') && !line.match(/\d{3}/)) {
      profile.name = line;
      break;
    }
  }

  // 2. Identify Section Headers & Direct Inline Sections
  const sectionKeywords = [
    { key: 'summary', regex: /^(?:professional\s+summary|summary|profile|about\s+me|objective)/i },
    { key: 'experience', regex: /^(?:work\s+experience|professional\s+experience|experience|employment\s+history|career\s+history)/i },
    { key: 'skills', regex: /^(?:core\s+competencies\s*&?\s*skills|technical\s+skills|skills|technologies|core\s+competencies|tools\s+&\s+technologies)/i },
    { key: 'projects', regex: /^(?:key\s+projects|projects|personal\s+projects|technical\s+projects)/i },
    { key: 'education', regex: /^(?:education|academic\s+background|degrees)/i },
    { key: 'certifications', regex: /^(?:certifications|certificates|licenses\s+&\s+certifications)/i }
  ];

  const sections = {};
  let currentSection = 'header';
  sections[currentSection] = [];

  for (const line of lines) {
    // Inline check for Certifications line:
    if (line.match(/^Certifications:\s*/i)) {
      const certContent = line.replace(/^Certifications:\s*/i, '');
      const certs = certContent.split(/\s*•\s*|\s*\|\s*|;\s*/).map(s => s.trim()).filter(Boolean);
      profile.certifications.push(...certs);
      continue;
    }

    // Inline check for Skills lines:
    if (line.match(/^(?:Core Competencies|Tools & Technologies|Technical Skills|Skills):\s*/i)) {
      const skillsContent = line.replace(/^(?:Core Competencies|Tools & Technologies|Technical Skills|Skills):\s*/i, '');
      const parsedSkills = skillsContent.split(/[,•·|;]+/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 50);
      profile.skills.push(...parsedSkills);
      continue;
    }

    let matchedSec = null;
    for (const sec of sectionKeywords) {
      if (sec.regex.test(line)) {
        matchedSec = sec.key;
        break;
      }
    }

    if (matchedSec) {
      currentSection = matchedSec;
      if (!sections[currentSection]) sections[currentSection] = [];
    } else {
      sections[currentSection].push(line);
    }
  }

  // 3. Parse Summary
  if (sections.summary && sections.summary.length > 0) {
    profile.summary = sections.summary.join(' ').replace(/\s+/g, ' ').trim();
  }

  // 4. Parse Skills
  if (sections.skills && sections.skills.length > 0) {
    const rawSkillLines = sections.skills.join('\n');
    const skillTokens = rawSkillLines
      .split(/[,•·|\n;]+/)
      .map(s => s.replace(/^[•\-\*]\s*/, '').trim())
      .filter(s => s.length > 1 && s.length < 40 && !s.toLowerCase().includes('skills:'));
    
    profile.skills = [...new Set(skillTokens)];
  }

  // 5. Parse Work Experience
  if (sections.experience && sections.experience.length > 0) {
    const expLines = sections.experience;
    let currentExp = null;

    const dateRegex = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December|\d{4})\b.*?(?:–|-|to)\s*(?:Present|Current|\d{4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i;

    for (let i = 0; i < expLines.length; i++) {
      const line = expLines[i];
      const hasDate = dateRegex.test(line);

      // New role trigger
      if (hasDate || (i > 0 && expLines[i - 1] && (expLines[i - 1].length < 60 && line.length < 60 && !line.startsWith('•') && !line.startsWith('-')))) {
        if (hasDate) {
          if (currentExp) {
            profile.experience.push(currentExp);
          }
          currentExp = {
            role: '',
            company: '',
            dates: '',
            bullets: []
          };

          const dateMatch = line.match(dateRegex);
          if (dateMatch) {
            currentExp.dates = dateMatch[0].trim();
            const remainder = line.replace(dateMatch[0], '').replace(/[|•·\-,]/g, ' ').trim();
            if (remainder) {
              currentExp.role = remainder;
            }
          }

          // If role was not on the same line, check prior line
          if (!currentExp.role && i > 0) {
            currentExp.role = expLines[i - 1];
          }

          continue;
        }
      }

      if (currentExp) {
        if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
          currentExp.bullets.push(line.replace(/^[•\-\*]\s*/, '').trim());
        } else if (!currentExp.company && line.length < 50) {
          currentExp.company = line;
        } else {
          currentExp.bullets.push(line);
        }
      }
    }

    if (currentExp && (currentExp.role || currentExp.company)) {
      profile.experience.push(currentExp);
    }
  }

  // 6. Parse Education
  if (sections.education && sections.education.length > 0) {
    let currentEdu = null;
    for (const line of sections.education) {
      if (line.match(/(?:Bachelor|Master|B\.S\.|M\.S\.|B\.A\.|Ph\.D\.|Diploma|Associate|Degree|University|College|Institute)/i)) {
        if (currentEdu) profile.education.push(currentEdu);
        currentEdu = {
          degree: line,
          institution: '',
          dates: ''
        };
      } else if (currentEdu && !currentEdu.institution && !line.match(/\d{4}/)) {
        currentEdu.institution = line;
      } else if (currentEdu && line.match(/\d{4}/)) {
        currentEdu.dates = line;
      }
    }
    if (currentEdu) profile.education.push(currentEdu);
  }

  // 7. Parse Certifications
  if (sections.certifications && sections.certifications.length > 0) {
    profile.certifications = sections.certifications
      .map(l => l.replace(/^[•\-\*]\s*/, '').trim())
      .filter(l => l.length > 3 && l.length < 100);
  }

  // 8. Parse Projects
  if (sections.projects && sections.projects.length > 0) {
    let currentProj = null;
    for (const line of sections.projects) {
      if (line.length < 60 && !line.startsWith('•') && !line.startsWith('-')) {
        if (currentProj) profile.projects.push(currentProj);
        currentProj = {
          name: line,
          technologies: [],
          description: ''
        };
      } else if (currentProj) {
        currentProj.description = (currentProj.description ? currentProj.description + ' ' : '') + line.replace(/^[•\-\*]\s*/, '');
      }
    }
    if (currentProj) profile.projects.push(currentProj);
  }

  // Calculate experience years
  if (profile.experience.length > 0) {
    profile.years_of_experience = calculateYearsOfExperience(profile.experience);
    profile.total_experience_stated = `${profile.years_of_experience} years`;
  }

  if (profile.skills.length > 0) {
    profile.skills_categorized = normalizeCategorizedSkills([], profile.skills);
  }

  return profile;
}

module.exports = {
  extractTextFromFile,
  extractResumeLocallyFromText
};
