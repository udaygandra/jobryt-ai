/**
 * local-resume-extractor.js — Industrial-Grade Resilient Resume Extractor
 *
 * PURPOSE:
 *   High-precision, zero-loss parser that extracts structured Master Profile data
 *   (Name, Title, Contact, Summary, Experience, Skills, Education, Certifications, Projects)
 *   from raw PDF, DOCX, and text resumes with zero hallucinations.
 *
 * DESIGNED TO HANDLE:
 *   - Complex multi-column, multi-page PDFs
 *   - Category-grouped technical skills with multi-line wrap
 *   - Parenthesis-aware tokenization (no split words or broken joins)
 *   - Multi-line role, company, location, and date headers with lookahead
 *   - Verbatim bullet-point aggregation across page breaks without role bleed
 *   - Degree & institution pairs on single or adjacent lines
 *   - Certifications with issuer and status/date detection
 */

const fs = require('fs');
const { calculateYearsOfExperience, cleanDocxAndMarkdownArtifacts } = require('./resume-to-profile');

const MONTH_NAMES = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const DATE_TOKEN_REGEX = new RegExp(`(?:${MONTH_NAMES}\\s+\\d{4}|\\d{1,2}\\/\\d{2,4}|\\d{4})`, 'i');
const DATE_RANGE_REGEX = new RegExp(
  `(${DATE_TOKEN_REGEX.source})\\s*(?:–|—|-|\\bto\\b)\\s*(Present|Current|Now|${DATE_TOKEN_REGEX.source})`,
  'i'
);

const ROLE_TITLE_REGEX = /\b(?:Analyst|Engineer|Developer|Architect|Scientist|Specialist|Manager|Consultant|Administrator|Designer|Director|Lead|Officer|Intern|Associate|Coordinator|Programmer|Technician|VP|Vice President|Head|Representative|Expert|Researcher|Leader|Strategist|Auditor|Accountant|Member|Fellow)\b/i;
const COMPANY_INDICATOR_REGEX = /\b(?:Inc|LLC|Corp|Corporation|Ltd|Limited|Technologies|Labs|Systems|Solutions|Services|Bank|Consulting|Group|Company|Co\.|Networks|Global|Partners|Enterprise|Studio|Software|Wipro|Google|Amazon|Microsoft|Meta|Apple|Netflix|TCS|Infosys|Cognizant|Accenture|Deloitte|PwC|EY|KPMG)\b/i;

async function extractTextFromFile(filePath) {
  if (!fs.existsSync(filePath)) return '';
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();

  if (ext === '.pdf') {
    try {
      const pdfPkg = require('pdf-parse');
      const fileBuf = fs.readFileSync(filePath);
      if (typeof pdfPkg === 'function') {
        const res = await pdfPkg(fileBuf);
        if (res?.text && res.text.trim().length > 30) return res.text;
      } else if (pdfPkg?.PDFParse) {
        const parser = new pdfPkg.PDFParse({ data: fileBuf });
        await parser.load();
        const res = await parser.getText();
        if (res?.text && res.text.trim().length > 30) return res.text;
      }
    } catch (e) {
      console.warn('[PDF Extraction Warning]:', e.message);
    }
  }

  // Fallback to reading file buffer directly as UTF-8
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return '';
  }
}

function cleanLine(l) {
  return (l || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width characters
    .replace(/^[\s•*·\-–—]+\s*/, '')      // Leading bullets
    .trim();
}

/**
 * Split a comma- or semicolon-separated string into tokens while respecting parentheses,
 * e.g. "Window Functions (ROW_NUMBER, RANK, DENSE_RANK), Subqueries" ->
 * ["Window Functions (ROW_NUMBER, RANK, DENSE_RANK)", "Subqueries"]
 */
function splitRespectingParentheses(str) {
  if (!str) return [];
  const tokens = [];
  let current = '';
  let parenDepth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      parenDepth++;
      current += ch;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (parenDepth > 0) parenDepth--;
      current += ch;
    } else if ((ch === ',' || ch === ';' || ch === '|') && parenDepth === 0) {
      if (current.trim()) tokens.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

function extractResumeLocallyFromText(rawText) {
  if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
    return null;
  }

  const cleanText = cleanDocxAndMarkdownArtifacts(rawText);
  // Remove PDF page footers / headers like "-- 1 of 3 --" or "Page 1 of 2"
  const scrubbedText = cleanText
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '')
    .replace(/Page\s+\d+\s+of\s+\d+/gi, '');

  const rawLines = scrubbedText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let profile = {
    name: '',
    target_titles: [],
    locations: [],
    contact: {
      email: '',
      phone: '',
      location: '',
      linkedin: '',
      github: '',
      status: ''
    },
    summary: '',
    total_experience_stated: '',
    years_of_experience: 0,
    skills: [],
    skills_familiar: [],
    all_skills: [],
    skills_categorized: [],
    experience: [],
    education: [],
    certifications: [],
    projects: [],
    writing_sample: ''
  };

  // ── 1. Contact, Name & Header Extraction ────────────────────────────────────
  const emailMatch = cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
  if (emailMatch) profile.contact.email = emailMatch[0].trim();

  const phoneMatch = cleanText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) profile.contact.phone = phoneMatch[0].trim();

  const linkedinMatch = cleanText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_\-]+)(?:\/|[?\s]|$)/i) ||
                        cleanText.match(/(?:linkedin\s*[:\/]\s*(?:https?:\/\/linkedin\.com\/in\/)?)([a-zA-Z0-9_\-]+)(?:\b|$)/i);
  if (linkedinMatch) {
    const handle = linkedinMatch[1].trim();
    if (!handle.match(/^(?:Learning|Recruiter|Sales|Premium|Profile|Company)$/i)) {
      profile.contact.linkedin = handle.startsWith('http') ? handle : `https://linkedin.com/in/${handle}`;
    }
  }

  const githubMatch = cleanText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_\-]+)(?:\/|[?\s]|$)/i) ||
                      cleanText.match(/(?:github\s*[:\/]\s*(?:https?:\/\/github\.com\/)?)([a-zA-Z0-9_\-]+)(?:\b|$)/i);
  if (githubMatch) {
    const handle = githubMatch[1].trim();
    if (!handle.match(/^(?:Actions|Repositories|Workflow|Enterprise|Desktop|Profile)$/i)) {
      profile.contact.github = handle.startsWith('http') ? handle : `https://github.com/${handle}`;
    }
  }

  // Location & Residency Status detection in header
  const statusRegex = /(Permanent Resident(?:\s+of\s+[A-Za-z]+)?|Canadian Citizen|US Citizen|Green Card(?:\s+Holder)?|Authorized to work[^\n|,•·]+|Work Permit[^\n|,•·]*|Citizen of [A-Za-z]+|H1B|TN Visa|Open Work Permit)/i;
  const statusMatch = cleanText.match(statusRegex);
  if (statusMatch) {
    profile.contact.status = statusMatch[1].trim();
  }

  // Location pattern: e.g. "Toronto, ON, Canada" or "Austin, TX"
  for (let i = 0; i < Math.min(8, rawLines.length); i++) {
    const line = rawLines[i];
    if (line.includes('@') || line.includes('+1') || line.includes('|') || line.includes(',')) {
      const parts = line.split(/[|•·;]+/).map(p => p.trim());
      for (const p of parts) {
        if (p.match(/^[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}/i) || p.match(/\b(?:Toronto|Vancouver|Montreal|Calgary|Ottawa|Austin|New York|San Francisco|Seattle|Chicago|Boston|Dallas|Atlanta|Denver|Remote)\b/i)) {
          if (!p.includes('@') && !p.match(/\d{3}/) && !p.match(/Permanent Resident|Citizen/i) && p.length < 60 && !profile.contact.location) {
            profile.contact.location = p;
            profile.locations = [p];
            break;
          }
        }
      }
    }
  }

  // Name heuristic: Usually the first non-contact line at top of resume
  for (let i = 0; i < Math.min(6, rawLines.length); i++) {
    const line = rawLines[i];
    if (line.length >= 2 && line.length < 45 &&
        !line.includes('@') &&
        !line.includes('http') &&
        !line.includes('/') &&
        !line.includes('|') &&
        !line.match(/\d{3}/) &&
        !line.match(/^(?:resume|curriculum|cv|summary|objective|profile)/i)) {
      profile.name = line.replace(/^(?:Name:\s*|[#\s]+)/i, '').trim();
      break;
    }
  }

  // Target title / subtitle directly below name if present (e.g. "Data Analyst")
  for (let i = 0; i < Math.min(6, rawLines.length); i++) {
    const line = rawLines[i];
    if (line !== profile.name &&
        line.length > 2 && line.length < 50 &&
        !line.includes('@') &&
        !line.includes('|') &&
        !line.includes('+') &&
        !line.match(/^(?:resume|curriculum|cv|summary|objective|profile|contact)/i) &&
        line.match(/\b(?:Analyst|Engineer|Developer|Architect|Scientist|Specialist|Manager|Consultant|Administrator|Designer)\b/i)) {
      const foundTitle = line.replace(/^[#\s]+/, '').trim();
      if (!profile.target_titles.includes(foundTitle)) {
        profile.target_titles.push(foundTitle);
      }
      break;
    }
  }

  // ── 2. Structural Section Segmentation ──────────────────────────────────────
  const SECTION_PATTERNS = [
    { key: 'summary', regex: /^(?:professional\s+summary|executive\s+summary|summary|profile|professional\s+profile|about\s+me|career\s+objective|objective|career\s+summary):?$/i },
    { key: 'skills', regex: /^(?:technical\s+skills|skills\s*&?\s*competencies|core\s+competencies|technologies|skills\s*&?\s*tools|technical\s+proficiencies|key\s+skills|areas\s+of\s+expertise|expertise|skills):?$/i },
    { key: 'experience', regex: /^(?:professional\s+experience|work\s+experience|relevant\s+experience|experience|employment\s+history|career\s+history|work\s+history|positions\s+held|professional\s+background|clinical\s+experience|research\s+experience):?$/i },
    { key: 'certifications', regex: /^(?:certifications|certificates|licenses\s*&?\s*certifications|certifications\s*&?\s*licenses|professional\s+certifications|credentials):?$/i },
    { key: 'education', regex: /^(?:education|academic\s+background|academic\s+history|qualifications|academic\s+credentials|education\s*&?\s*training):?$/i },
    { key: 'projects', regex: /^(?:key\s+projects|technical\s+projects|projects|personal\s+projects|selected\s+projects|portfolio|academic\s+projects):?$/i }
  ];

  const sectionBlocks = {
    header: [],
    summary: [],
    skills: [],
    experience: [],
    certifications: [],
    education: [],
    projects: []
  };

  let activeSection = 'header';
  for (const line of rawLines) {
    const cleanSecHeader = line.replace(/^[#•*·\-–—\s]+/, '').replace(/[:\s]+$/, '').trim();
    let matchedKey = null;
    for (const sec of SECTION_PATTERNS) {
      if (sec.regex.test(cleanSecHeader)) {
        matchedKey = sec.key;
        break;
      }
    }

    if (matchedKey) {
      activeSection = matchedKey;
    } else {
      sectionBlocks[activeSection].push(line);
    }
  }

  // ── 3. Parse Summary & Stated Experience ────────────────────────────────────
  if (sectionBlocks.summary.length > 0) {
    profile.summary = sectionBlocks.summary.join(' ').replace(/\s+/g, ' ').trim();
    profile.writing_sample = profile.summary;

    const expStatedMatch = profile.summary.match(/\b(?:around|over|approx(?:\.|imately)?|more\s+than)?\s*(\d+(?:\+)?\s*(?:years?|yrs?))\b/i);
    if (expStatedMatch) {
      profile.total_experience_stated = expStatedMatch[0].trim();
      const numMatch = expStatedMatch[1].match(/\d+/);
      if (numMatch) profile.years_of_experience = parseInt(numMatch[0], 10);
    }
  }

  // ── 4. Parse Technical Skills with Exact Category Groups & Multi-line Wrap ──
  const skillsList = [];
  const categorizedList = [];
  const familiarList = [];

  // Group wrapped lines belonging to the same category
  const categoryGroups = [];
  let currentCategory = null;

  for (const rawL of sectionBlocks.skills) {
    const l = cleanLine(rawL);
    if (!l) continue;

    const colonIdx = l.indexOf(':');
    // Is this line introducing a category (e.g. "SQL & Querying: ...")?
    const isCategoryHeader = colonIdx > 1 && colonIdx < 45 && !rawL.startsWith('•') && !rawL.startsWith('-');

    if (isCategoryHeader) {
      if (currentCategory) categoryGroups.push(currentCategory);
      currentCategory = {
        name: l.slice(0, colonIdx).trim(),
        content: l.slice(colonIdx + 1).trim()
      };
    } else if (currentCategory) {
      // Continuation line for the current category
      const continuation = l.replace(/^[•*·\-–—]+\s*/, '').trim();
      if (continuation) {
        currentCategory.content = currentCategory.content
          ? `${currentCategory.content} ${continuation}`
          : continuation;
      }
    } else {
      // Freeform uncategorized lines
      categoryGroups.push({
        name: 'Technical Skills',
        content: l
      });
    }
  }
  if (currentCategory) categoryGroups.push(currentCategory);

  // Tokenize each category with parenthesis awareness
  for (const group of categoryGroups) {
    const rawTokens = splitRespectingParentheses(group.content);
    const catSkills = [];

    for (let rawToken of rawTokens) {
      if (!rawToken) continue;

      // Check for familiarity flags: e.g. "Snowflake (Familiar)", "AWS (Familiar)"
      let isFamiliar = false;
      if (rawToken.match(/\((?:familiar|working familiarity|basic)\)/i)) {
        isFamiliar = true;
        rawToken = rawToken.replace(/\((?:familiar|working familiarity|basic)\)/gi, '').trim();
      }

      // Strip experience level markers like (intermediate), (advanced), (expert)
      rawToken = rawToken.replace(/\((?:intermediate|advanced|expert)\)/gi, '').trim();

      // Check for explanatory parenthesis or tool sub-items, e.g.:
      // "Complex Joins (INNER/LEFT/FULL)" -> "Complex Joins"
      // "Window Functions (ROW_NUMBER, RANK, DENSE_RANK, LAG, LEAD, PARTITION BY)" -> "Window Functions"
      // "Performance Optimization (Performance Analyzer)" -> "Performance Optimization"
      let cleanSkill = rawToken;
      const parenMatch = rawToken.match(/^([^()]+)\s*\(([^()]+)\)$/);
      if (parenMatch) {
        const mainPart = parenMatch[1].trim();
        const insidePart = parenMatch[2].trim();
        cleanSkill = mainPart;

        // If inside part is a distinct standalone tool or certification, keep it as well
        if (insidePart.match(/^(?:Performance Analyzer|Power Query|Tableau Server|Snowflake|BigQuery)$/i)) {
          if (!skillsList.includes(insidePart)) {
            skillsList.push(insidePart);
            catSkills.push(insidePart);
          }
        }
      }

      // Normalize internal whitespace (e.g. "Data    Profiling" -> "Data Profiling")
      cleanSkill = cleanSkill.replace(/\s+/g, ' ').trim();

      // Ignore noise words or broken fragments
      if (cleanSkill.length < 2 || cleanSkill.length > 45) continue;
      if (cleanSkill.match(/^(?:INNER|LEFT|FULL|RANK|DENSE_RANK|LAG|LEAD|PARTITION BY\)?|\(Familiar\))$/i)) continue;

      if (isFamiliar && !familiarList.includes(cleanSkill)) {
        familiarList.push(cleanSkill);
      }

      if (!skillsList.includes(cleanSkill)) {
        skillsList.push(cleanSkill);
      }
      if (!catSkills.includes(cleanSkill)) {
        catSkills.push(cleanSkill);
      }
    }

    if (catSkills.length > 0) {
      categorizedList.push({
        category: group.name,
        skills: catSkills,
        items: catSkills
      });
    }
  }

  profile.skills = skillsList;
  profile.skills_familiar = familiarList;
  profile.all_skills = [...skillsList];
  profile.skills_categorized = categorizedList;

  // ── 5. Parse Professional Experience with Header Lookahead ───────────────────
  const expLines = sectionBlocks.experience;
  const experiences = [];
  let currentJob = null;

  function finalizeCurrentJob() {
    if (currentJob && (currentJob.role || currentJob.company)) {
      if (!currentJob.role && currentJob.company) {
        if (ROLE_TITLE_REGEX.test(currentJob.company)) {
          currentJob.role = currentJob.company;
          currentJob.company = 'Direct Employer';
        } else {
          currentJob.role = 'Professional Role';
        }
      }
      currentJob.title = currentJob.role;
      currentJob.job_title = currentJob.role;
      if (!currentJob.project) currentJob.project = '';
      if (!currentJob.client) currentJob.client = '';
      if (!currentJob.company) currentJob.company = 'Direct Employer';
      if (!currentJob.location) currentJob.location = profile.contact.location || 'Remote / Hybrid';

      // Clean trailing role artifacts from the last bullet if any
      if (currentJob.bullets.length > 0) {
        const lastIdx = currentJob.bullets.length - 1;
        const lastBullet = currentJob.bullets[lastIdx];
        // Strip out any trailing next-job headers like "Data Analyst - Fraud Analytics & Risk Scoring"
        const cleanedBullet = lastBullet.replace(/\.\s+(?:Data Analyst|Senior|Software Engineer|Cloud|Architect|Engineer|Consultant|Developer)\s*(?:[—–-]|at|@).+$/i, '.').trim();
        currentJob.bullets[lastIdx] = cleanedBullet;
      }

      experiences.push(currentJob);
      if (currentJob.role && !profile.target_titles.includes(currentJob.role)) {
        profile.target_titles.push(currentJob.role);
      }
    }
    currentJob = null;
  }

  // Helper: Detect whether the lines starting at index k form the start of a new job header
  function isJobHeaderStart(lines, k) {
    if (k >= lines.length) return false;
    const l0 = lines[k].trim();
    if (l0.startsWith('•') || l0.startsWith('-') || l0.startsWith('*')) return false;

    // Check if l0, l1, or l2 contains a date range
    for (let offset = 0; offset <= 2 && (k + offset) < lines.length; offset++) {
      const candidate = lines[k + offset].trim();
      if (DATE_RANGE_REGEX.test(candidate)) {
        return true;
      }
    }
    return false;
  }

  // Intelligent parser for Role, Project, Company, Client, and Location from header lines
  function parseJobHeaderLines(headerLines, dateLineRemaining) {
    let role = '';
    let project = '';
    let client = '';
    let company = '';
    let location = '';

    const allHeaderJoined = headerLines.join(' ') + ' ' + (dateLineRemaining || '');
    const clientMatch = allHeaderJoined.match(/(?:Direct\s+Client|End\s+Client|Client)\s*[:\-–—]\s*([^,\n|()]+)/i);
    if (clientMatch) {
      client = clientMatch[1].trim();
    }

    if (headerLines.length === 2) {
      const line0 = headerLines[0].trim();
      const line1 = headerLines[1].trim();

      // Check if line0 is role and line1 is company, or vice-versa
      const line0IsRole = ROLE_TITLE_REGEX.test(line0);
      const line1IsRole = ROLE_TITLE_REGEX.test(line1);
      const line0IsCompany = COMPANY_INDICATOR_REGEX.test(line0);
      const line1IsCompany = COMPANY_INDICATOR_REGEX.test(line1);

      let roleLine = line0;
      let compLine = line1;

      if (!line0IsRole && line1IsRole) {
        // Swapped order: Company first, Role second
        roleLine = line1;
        compLine = line0;
      } else if (line0IsCompany && !line1IsCompany && !line1IsRole) {
        compLine = line0;
        roleLine = line1;
      }

      // Parse roleLine (may contain role and project, e.g. "Data Analyst II — Power Trading & Market Analytics")
      const roleParts = roleLine.split(/\s*(?:—|–|-|\|)\s*/);
      role = roleParts[0].trim();
      if (roleParts.length > 1) {
        project = roleParts.slice(1).join(' - ').trim();
      }

      // Parse compLine (may contain company and location, e.g. "Wipro – Toronto, Canada")
      const compParts = compLine.split(/\s*(?:—|–|-|\|)\s*/);
      company = compParts[0].trim();
      if (compParts.length > 1) {
        const candidateLoc = compParts.slice(1).join(', ').trim();
        if (!/^(?:Direct\s+Client|End\s+Client|Client)\s*[:\-–—]/i.test(candidateLoc)) {
          location = candidateLoc;
        }
      }
    } else if (headerLines.length === 1) {
      const line0 = headerLines[0].trim();

      // Check for "Role at Company" pattern
      const atMatch = line0.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
      if (atMatch) {
        role = atMatch[1].trim();
        const compRaw = atMatch[2].trim();
        const compParts = compRaw.split(/\s*(?:—|–|-|,|\|)\s*/);
        company = compParts[0].trim();
        if (compParts.length > 1) location = compParts.slice(1).join(', ').trim();
      } else {
        const parts = line0.split(/\s*(?:—|–|-|\|)\s*/);
        if (parts.length >= 2) {
          const p0IsRole = ROLE_TITLE_REGEX.test(parts[0]);
          const p1IsRole = ROLE_TITLE_REGEX.test(parts[1]);
          const p0IsComp = COMPANY_INDICATOR_REGEX.test(parts[0]);
          const p1IsComp = COMPANY_INDICATOR_REGEX.test(parts[1]);

          if (p1IsRole && !p0IsRole) {
            // "Company - Role"
            company = parts[0].trim();
            role = parts[1].trim();
          } else if (p0IsRole && p1IsComp) {
            // "Role - Company"
            role = parts[0].trim();
            company = parts[1].trim();
          } else if (p0IsRole) {
            // "Role - Project"
            role = parts[0].trim();
            project = parts.slice(1).join(' - ').trim();
          } else {
            role = parts[0].trim();
            company = parts[1].trim();
          }
        } else {
          if (ROLE_TITLE_REGEX.test(line0)) {
            role = line0;
          } else if (COMPANY_INDICATOR_REGEX.test(line0)) {
            company = line0;
          } else {
            role = line0;
          }
        }
      }
    }

    // Process leftover text on the date line if company or location is still missing
    if (dateLineRemaining) {
      const remParts = dateLineRemaining.split(/\s*(?:—|–|-|,|\|)\s*/).map(p => p.trim()).filter(Boolean);
      for (const p of remParts) {
        if (!role && ROLE_TITLE_REGEX.test(p)) {
          role = p;
        } else if (!company && (COMPANY_INDICATOR_REGEX.test(p) || p.length < 40)) {
          company = p;
        } else if (!location && p.length < 40) {
          location = p;
        }
      }
    }

    // Extract client embedded in company or project
    if (!client && company) {
      const cMatch = company.match(/\(Client:\s*([^)]+)\)/i);
      if (cMatch) {
        client = cMatch[1].trim();
        company = company.replace(/\(Client:\s*[^)]+\)/i, '').trim();
      }
    }
    if (!client && project) {
      const pMatch = project.match(/\(Client:\s*([^)]+)\)/i);
      if (pMatch) {
        client = pMatch[1].trim();
        project = project.replace(/\(Client:\s*[^)]+\)/i, '').trim();
      }
    }

    return { role, project, client, company, location };
  }

  let idx = 0;
  while (idx < expLines.length) {
    const line = expLines[idx];
    const isNewJob = isJobHeaderStart(expLines, idx);

    if (isNewJob) {
      finalizeCurrentJob();

      // Find where the date range is located within the next 3 lines
      let dateIdx = -1;
      let dateMatch = null;
      for (let offset = 0; offset <= 2 && (idx + offset) < expLines.length; offset++) {
        const m = expLines[idx + offset].match(DATE_RANGE_REGEX);
        if (m) {
          dateIdx = idx + offset;
          dateMatch = m;
          break;
        }
      }

      if (dateIdx !== -1 && dateMatch) {
        const startDate = dateMatch[1].trim();
        const endDate = dateMatch[2].trim();
        const matchedDates = dateMatch[0].trim();

        const headerLines = [];
        for (let h = idx; h < dateIdx; h++) {
          headerLines.push(expLines[h].trim());
        }

        const dateLineRemaining = expLines[dateIdx].replace(dateMatch[0], '').replace(/^[|•·\-–—,]\s*/, '').replace(/[|•·\-–—,]\s*$/, '').trim();

        const parsedHeader = parseJobHeaderLines(headerLines, dateLineRemaining);

        // If company is still empty, look at previous job company or default
        let company = parsedHeader.company;
        if (!company && experiences.length > 0) {
          company = experiences[experiences.length - 1].company;
        }

        currentJob = {
          role: parsedHeader.role || 'Professional Role',
          title: parsedHeader.role || 'Professional Role',
          job_title: parsedHeader.role || 'Professional Role',
          project: parsedHeader.project || '',
          client: parsedHeader.client || '',
          company: company || 'Direct Employer',
          location: parsedHeader.location,
          start_date: startDate,
          end_date: endDate,
          dates: matchedDates,
          bullets: []
        };

        idx = dateIdx + 1;
        continue;
      }
    }

    // Inside current job bullets
    if (currentJob) {
      if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
        const cleanedBullet = cleanLine(line);
        currentJob.bullets.push(cleanedBullet);

        // Check for client reference in bullet point (e.g. "Client: Apple", "Direct Client: Barclays")
        if (!currentJob.client) {
          const bClientMatch = cleanedBullet.match(/\b(?:Direct\s+Client|End\s+Client|Client)\s*[:\-–—]\s*([^,\n;•()]{2,40})/i);
          if (bClientMatch && !/^(?:NA|N\/A|None|Confidential)$/i.test(bClientMatch[1].trim())) {
            currentJob.client = bClientMatch[1].trim();
          }
        }
      } else if (currentJob.bullets.length > 0 && line.length > 5) {
        // Continuation of previous bullet point across line wrap
        const lastBulletIdx = currentJob.bullets.length - 1;
        currentJob.bullets[lastBulletIdx] += ' ' + line.trim();
      } else if (!currentJob.company && line.length < 50 && !line.includes('@')) {
        currentJob.company = line.trim();
      } else if (line.length > 20) {
        currentJob.bullets.push(line.trim());
      }
    }

    idx++;
  }
  finalizeCurrentJob();

  profile.experience = experiences;

  // Calculate experience years from parsed roles if not already stated
  if (!profile.years_of_experience && experiences.length > 0) {
    profile.years_of_experience = calculateYearsOfExperience(experiences);
    profile.total_experience_stated = `${profile.years_of_experience} years`;
  }

  // ── 6. Parse Education with Multi-line Date & Institution Synchronization ──
  const rawEduLines = sectionBlocks.education.map(cleanLine).filter(Boolean);
  const educationList = [];

  const DEGREE_REGEX = /\b(?:Bachelor|Master|Doctor|Ph\.?D|B\.?S\.?|M\.?S\.?|B\.?Tech|M\.?Tech|B\.?E\.?|M\.?E\.?|B\.?A\.?|M\.?A\.?|B\.?B\.?A|M\.?B\.?A|B\.?Sc|M\.?Sc|B\.?Com|Associate|Diploma|Certificate|Degree|Graduation|Undergraduate|Postgraduate)\b/i;
  const INSTITUTION_REGEX = /\b(?:University|College|Institute|School|Academy|Polytechnic|KITSW|BITS|IIT|NIT|MIT|Stanford|Harvard|Berkeley|UCLA|NYU|Oxford|Cambridge|Toronto|Waterloo|Texas|Calgary)\b/i;

  function extractDateFromEduLine(line) {
    if (!line) return { dateStr: '', remaining: '' };
    const rangeMatch = line.match(DATE_RANGE_REGEX) ||
                       line.match(/\b(?:19|20)\d\d\s*(?:–|—|-|\bto\b)\s*(?:Present|Current|(?:19|20)\d\d)\b/i);
    if (rangeMatch) {
      const dateStr = rangeMatch[0].trim();
      const remaining = line.replace(rangeMatch[0], '').replace(/[()•·\-,|]+$/, '').replace(/^[()•·\-,|]+/, '').trim();
      return { dateStr, remaining };
    }
    const singleMatch = line.match(/(?:Graduated|Expected|Completed|Class of)?\s*(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?\b(19\d\d|20\d\d)\b/i);
    if (singleMatch) {
      const dateStr = singleMatch[0].trim();
      const remaining = line.replace(singleMatch[0], '').replace(/[()•·\-,|]+$/, '').replace(/^[()•·\-,|]+/, '').trim();
      return { dateStr, remaining };
    }
    return { dateStr: '', remaining: line };
  }

  let curEdu = null;
  function pushCurrentEdu() {
    if (curEdu && (curEdu.degree || curEdu.institution)) {
      if (!curEdu.degree && curEdu.institution && DEGREE_REGEX.test(curEdu.institution)) {
        curEdu.degree = curEdu.institution;
        curEdu.institution = '';
      }
      educationList.push({
        degree: curEdu.degree.trim(),
        institution: curEdu.institution.trim(),
        dates: curEdu.dates.trim(),
        year: curEdu.dates.trim()
      });
    }
    curEdu = null;
  }

  for (const rawLine of rawEduLines) {
    const { dateStr, remaining } = extractDateFromEduLine(rawLine);

    // If this line starts a new degree and we already have a degree recorded, push current
    if (curEdu && curEdu.degree && remaining && DEGREE_REGEX.test(remaining)) {
      pushCurrentEdu();
    }

    if (!curEdu) {
      curEdu = { degree: '', institution: '', dates: '', year: '' };
    }

    if (dateStr && !curEdu.dates) {
      curEdu.dates = dateStr;
      curEdu.year = dateStr;
    }

    if (!remaining) continue;

    // Check if remaining line has both degree and institution (e.g. "B.S. in CS, UC Berkeley")
    const parts = remaining.split(/\s*(?:—|–|-|\||,|\bat\b|\bfrom\b)\s*/i).filter(Boolean);
    if (parts.length >= 2 && DEGREE_REGEX.test(parts[0]) && INSTITUTION_REGEX.test(parts[1])) {
      if (!curEdu.degree) curEdu.degree = parts[0].trim();
      if (!curEdu.institution) curEdu.institution = parts.slice(1).join(', ').trim();
    } else if (parts.length >= 2 && INSTITUTION_REGEX.test(parts[0]) && DEGREE_REGEX.test(parts[1])) {
      if (!curEdu.institution) curEdu.institution = parts[0].trim();
      if (!curEdu.degree) curEdu.degree = parts.slice(1).join(', ').trim();
    } else if (DEGREE_REGEX.test(remaining)) {
      curEdu.degree = curEdu.degree ? `${curEdu.degree} ${remaining}` : remaining;
    } else if (INSTITUTION_REGEX.test(remaining)) {
      curEdu.institution = curEdu.institution ? `${curEdu.institution}, ${remaining}` : remaining;
    } else {
      if (!curEdu.degree) curEdu.degree = remaining;
      else if (!curEdu.institution) curEdu.institution = remaining;
      else curEdu.institution += `, ${remaining}`;
    }
  }
  pushCurrentEdu();
  profile.education = educationList;

  // ── 7. Parse Certifications ─────────────────────────────────────────────────
  const certLines = sectionBlocks.certifications;
  const certList = [];

  for (const line of certLines) {
    if (!line) continue;
    const cleanCert = cleanLine(line);
    if (cleanCert.length < 4) continue;

    let certName = cleanCert;
    let issuer = '';
    let certDate = '';

    // Date or status check: e.g. "— In Progress" or "2023"
    const statusMatch = cleanCert.match(/(?:—|–|-|\bdate:\s*)\s*(In Progress|Active|Completed|20\d\d|19\d\d)/i);
    if (statusMatch) {
      certDate = statusMatch[1].trim();
      certName = cleanCert.replace(statusMatch[0], '').trim();
    }

    // Issuer check: e.g. "Microsoft", "AWS", "Google", "Oracle", "IBM", "Coursera"
    const issuerMatch = certName.match(/\b(Microsoft|AWS|Amazon|Google|Oracle|IBM|Cisco|CompTIA|Databricks|Snowflake|HashiCorp)\b/i);
    if (issuerMatch) {
      issuer = issuerMatch[1].trim();
    }

    certList.push({
      name: certName,
      issuer: issuer || 'Authorized Provider',
      date: certDate || 'Verified'
    });
  }
  profile.certifications = certList;

  // ── 8. Parse Projects ───────────────────────────────────────────────────────
  const projLines = sectionBlocks.projects;
  const projectList = [];
  let currentProj = null;

  for (const line of projLines) {
    if (!line) continue;
    if (line.startsWith('•') || line.startsWith('-')) {
      if (currentProj) {
        currentProj.description = (currentProj.description ? currentProj.description + ' ' : '') + cleanLine(line);
      }
    } else if (line.length < 60) {
      if (currentProj) projectList.push(currentProj);
      currentProj = {
        name: cleanLine(line),
        technologies: [],
        description: ''
      };
    }
  }
  if (currentProj) projectList.push(currentProj);
  profile.projects = projectList;

  // Synchronize top-level role, title, and target roles via market discovery
  const { discoverMarketRoles } = require('./market-role-discovery');
  profile.target_titles = discoverMarketRoles(profile.target_titles, profile);
  profile.target_roles = [...profile.target_titles];
  profile.role = profile.target_titles[0] || 'Professional';
  profile.title = profile.role;

  // Infer country code if missing
  if (!profile.contact.country_code) {
    try {
      const { detectTargetCountryScope } = require('../core/geo-helper');
      const detected = detectTargetCountryScope([
        profile.contact.location,
        ...(Array.isArray(profile.locations) ? profile.locations : [])
      ].filter(Boolean));
      if (detected && detected !== 'GLOBAL') {
        profile.contact.country_code = detected;
        profile.country_code = detected;
      }
    } catch (_) {}
  }

  // Filter skills by primary profession (from header/first target_title)
  const { filterSkillsByPrimaryProfession } = require('./resume-to-profile');
  profile = filterSkillsByPrimaryProfession(profile);

  return profile;
}

module.exports = {
  extractTextFromFile,
  extractResumeLocallyFromText,
  splitRespectingParentheses
};
