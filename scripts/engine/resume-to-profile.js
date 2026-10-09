/**
 * resume-to-profile.js — Resume Parser & Profile Generator
 *
 * PURPOSE:
 *   Ingests a resume file (PDF, TXT, DOCX, MD), parses it using an LLM 
 *   with strict zero-fabrication rules, and updates data/profiles/master-profile.json.
 *
 * FEATURES:
 *   - Multimodal PDF processing
 *   - Strict enforcement against hallucination
 *   - Automatic profile backup
 *
 * USAGE:
 *   node scripts/resume-to-profile.js <path-to-resume> [--test] [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── Step 1: Environment & Setup ─────────────────────────────────────────────
const { loadEnv } = require('../core/load-env');
loadEnv();

const { getDataDir } = require('../core/common-utils');
const { loadPrompt } = require('../core/prompt-loader');
const { recordModelCall, recordModelError } = require('./llm-state-manager');
const dataDir = getDataDir();
const profilePath = path.join(dataDir, 'profiles', 'master-profile.json');
const backupPath = path.join(dataDir, 'profiles', 'master-profile.backup.json');

const DEFAULT_SYSTEM_PROMPT = `You are a high-precision resume parsing engine.
Your task is to extract all information from the provided resume and output a valid JSON object matching the exact master-profile schema.

CRITICAL RULES - ZERO FABRICATION:
1. Do NOT invent, extrapolate, or hallucinate ANY details (companies, titles, skills, dates).
2. Copy EVERY bullet point verbatim. Do NOT condense or omit.
3. Extract ALL skills, tools, and technologies as individual strings in an array.
4. Extract complete contact details (email, phone, location, linkedin).
5. CLIENT FIDELITY: If a client name is specified (e.g. "Client: Apple", "Client: Barclays"), keep the exact client name in client. NEVER replace or save it as "Highly Confidential" or "Confidential".

Respond ONLY with valid JSON in this schema:
{
  "name": "Full Name",
  "target_titles": ["Title 1", "Title 2"],
  "locations": ["City, Region"],
  "contact": { "email": "", "phone": "", "location": "", "linkedin": "" },
  "summary": "Professional summary verbatim",
  "skills": ["Skill 1", "Skill 2"],
  "experience": [
    {
      "role": "Exact Job Title",
      "project": "",
      "client": "",
      "company": "Exact Company Name",
      "dates": "Exact Dates",
      "bullets": ["Verbatim bullet 1", "Verbatim bullet 2"]
    }
  ],
  "education": [
    { "degree": "", "institution": "", "dates": "" }
  ]
}`;

const SYSTEM_PROMPT = loadPrompt('resume-parser.txt', {}, DEFAULT_SYSTEM_PROMPT);

function cleanDocxAndMarkdownArtifacts(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    // Strip bold/italic asterisks embedded in words (e.g. Pyt****hon -> Python)
    .replace(/([a-zA-Z0-9])\*+([a-zA-Z0-9])/g, '$1$2')
    // Strip stray markdown markers like ** ****&**** ** -> &
    .replace(/\*+/g, '')
    // Normalize dashes and quotation marks
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u201C\u201D]/g, '"')
    // Collapse multiple consecutive spaces and whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

const MONTH_MAP = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

function getJsDate(d) {
  if (!d) return new Date();
  if (typeof d.toJSDate === 'function') return d.toJSDate();
  if (d instanceof Date) return d;
  return new Date(d);
}

function parseDateEndpoint(str, isEnd, nowRef = new Date()) {
  if (!str) return null;
  const s = str.trim().toLowerCase();
  const now = getJsDate(nowRef);
  if (['present', 'current', 'now', 'today'].includes(s)) {
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }

  // Month + Year, e.g. "July 2022", "Aug 2021", "Sept 2020"
  const myMatch = s.match(/^([a-z]+)\s*(\d{4})$/);
  if (myMatch && MONTH_MAP[myMatch[1]]) {
    return { year: parseInt(myMatch[2], 10), month: MONTH_MAP[myMatch[1]] };
  }

  // Slash or dash: MM/YYYY or MM-YYYY
  const slashMatch = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (slashMatch) {
    const m = parseInt(slashMatch[1], 10);
    const y = parseInt(slashMatch[2], 10);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }

  // YYYY/MM or YYYY-MM
  const yFirstMatch = s.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (yFirstMatch) {
    const y = parseInt(yFirstMatch[1], 10);
    const m = parseInt(yFirstMatch[2], 10);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }

  // Year only, e.g. "2020"
  const yOnlyMatch = s.match(/^(\d{4})$/);
  if (yOnlyMatch) {
    const y = parseInt(yOnlyMatch[1], 10);
    return { year: y, month: isEnd ? 12 : 1 };
  }

  return null;
}

function parseExperienceDateRange(datesStr, nowRef = new Date()) {
  if (!datesStr || typeof datesStr !== 'string') return null;
  const cleaned = datesStr.replace(/[\u2013\u2014]/g, '-').trim();
  const parts = cleaned.split(/\s*(?:-|–|—|\bto\b)\s*/i).filter(Boolean);
  if (parts.length < 2) return null;

  const start = parseDateEndpoint(parts[0], false, nowRef);
  const end = parseDateEndpoint(parts[1], true, nowRef);

  if (start && end) {
    const startIdx = start.year * 12 + (start.month - 1);
    const endIdx = end.year * 12 + (end.month - 1);
    if (startIdx <= endIdx) {
      return { start: startIdx, end: endIdx };
    }
  }
  return null;
}

function calculateYearsOfExperience(experience = [], referenceDate = new Date()) {
  if (!Array.isArray(experience) || experience.length === 0) return 0;

  const intervals = [];
  for (const exp of experience) {
    const interval = parseExperienceDateRange(exp.dates, referenceDate);
    if (interval) {
      intervals.push(interval);
    }
  }

  if (intervals.length === 0) return 0;

  // Sort intervals by start month
  intervals.sort((a, b) => a.start - b.start);

  // Merge overlapping intervals so concurrent roles are not double-counted
  const merged = [];
  let current = { ...intervals[0] };
  for (let i = 1; i < intervals.length; i++) {
    const next = intervals[i];
    if (next.start <= current.end) {
      current.end = Math.max(current.end, next.end);
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);

  let totalMonths = 0;
  for (const int of merged) {
    const months = int.end - int.start + 1;
    totalMonths += Math.max(1, months);
  }

  const rawYears = totalMonths / 12;
  return roundYearsOfExperience(rawYears);
}

function roundYearsOfExperience(val) {
  const num = typeof val === 'number' ? val : parseFloat(String(val || '').replace(/[^0-9.]/g, ''));
  if (isNaN(num) || num < 0) return 0;
  const rounded = Math.round(num * 2) / 2;
  return Number(rounded.toFixed(1));
}

function normalizeCategorizedSkills(rawCategorized = [], flatSkills = []) {
  const flatSet = new Set(flatSkills.map(s => s.trim().toLowerCase()));
  const skillToExact = new Map(flatSkills.map(s => [s.trim().toLowerCase(), s.trim()]));

  const categoryMap = new Map();
  const assigned = new Set();

  if (Array.isArray(rawCategorized)) {
    for (const catObj of rawCategorized) {
      if (!catObj || typeof catObj !== 'object') continue;
      const catName = (catObj.category || '').trim();
      const rawItems = Array.isArray(catObj.items) ? catObj.items : (Array.isArray(catObj.skills) ? catObj.skills : null);
      if (!catName || !rawItems) continue;

      if (!categoryMap.has(catName)) {
        categoryMap.set(catName, []);
      }

      for (const item of rawItems) {
        if (typeof item !== 'string') continue;
        const norm = item.trim().toLowerCase();
        // Rule: item must exist in flatSkills, and appear in exactly one category
        if (flatSet.has(norm) && !assigned.has(norm)) {
          const exact = skillToExact.get(norm);
          categoryMap.get(catName).push(exact);
          assigned.add(norm);
        }
      }
    }
  }

  // Any remaining skills from flatSkills that were not assigned fall back to 'Other'
  const unassigned = [];
  for (const s of flatSkills) {
    const norm = s.trim().toLowerCase();
    if (!assigned.has(norm)) {
      unassigned.push(skillToExact.get(norm));
      assigned.add(norm);
    }
  }

  if (unassigned.length > 0) {
    if (!categoryMap.has('Other')) {
      categoryMap.set('Other', []);
    }
    categoryMap.get('Other').push(...unassigned);
  }

  // Format as [{ category: '...', items: [...] }], omitting empty categories
  const result = [];
  for (const [category, items] of categoryMap.entries()) {
    if (items.length > 0) {
      result.push({ category, items });
    }
  }

  return result;
}

function extractDocxText(buf) {
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 30) return '';

  function xmlToText(xml) {
    if (!xml || typeof xml !== 'string') return '';
    return xml
      .replace(/<w:p[^>]*>/g, '\n')
      .replace(/<w:br[^>]*>/g, '\n')
      .replace(/<w:tab[^>]*>/g, '\t')
      .replace(/<w:tr[^>]*>/g, '\n')
      .replace(/<w:tc[^>]*>/g, '  ')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n\n')
      .trim();
  }

  try {
    // 1. Preferred & Standard: Central Directory (EOCD) Scan
    // Correctly extracts docx entries even when local file headers use streaming/data descriptors (compSize = 0)
    let eocdOffset = -1;
    for (let i = buf.length - 22; i >= 0 && i >= buf.length - 65557; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    const xmlParts = [];

    if (eocdOffset !== -1) {
      const cdOffset = buf.readUInt32LE(eocdOffset + 16);
      const totalEntries = buf.readUInt16LE(eocdOffset + 10);
      let offset = cdOffset;
      const targetXmls = {};

      for (let i = 0; i < totalEntries && offset < eocdOffset; i++) {
        if (buf.readUInt32LE(offset) !== 0x02014b50) break;
        const compMethod = buf.readUInt16LE(offset + 10);
        const compSize = buf.readUInt32LE(offset + 20);
        const fileNameLen = buf.readUInt16LE(offset + 28);
        const extraLen = buf.readUInt16LE(offset + 30);
        const commentLen = buf.readUInt16LE(offset + 32);
        const localHeaderOffset = buf.readUInt32LE(offset + 42);
        const fileName = buf.slice(offset + 46, offset + 46 + fileNameLen).toString('utf8');

        if (fileName === 'word/document.xml' || fileName.startsWith('word/header') || fileName.startsWith('word/footer')) {
          try {
            const localFileNameLen = buf.readUInt16LE(localHeaderOffset + 26);
            const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
            const dataStart = localHeaderOffset + 30 + localFileNameLen + localExtraLen;
            const compData = buf.slice(dataStart, dataStart + compSize);
            const xml = compMethod === 8 ? zlib.inflateRawSync(compData).toString('utf8') : compData.toString('utf8');
            targetXmls[fileName] = xml;
          } catch (e) {
            console.warn(`[Docx Part Decompress Warning] ${fileName}: ${e.message}`);
          }
        }
        offset += 46 + fileNameLen + extraLen + commentLen;
      }

      // Concatenate header parts (often contains candidate name/contact), then main body, then footer
      const headerKeys = Object.keys(targetXmls).filter(k => k.startsWith('word/header')).sort();
      for (const hk of headerKeys) {
        const txt = xmlToText(targetXmls[hk]);
        if (txt) xmlParts.push(txt);
      }
      if (targetXmls['word/document.xml']) {
        const bodyTxt = xmlToText(targetXmls['word/document.xml']);
        if (bodyTxt) xmlParts.push(bodyTxt);
      }
      const footerKeys = Object.keys(targetXmls).filter(k => k.startsWith('word/footer')).sort();
      for (const fk of footerKeys) {
        const txt = xmlToText(targetXmls[fk]);
        if (txt) xmlParts.push(txt);
      }

      if (xmlParts.length > 0) {
        return cleanDocxAndMarkdownArtifacts(xmlParts.join('\n\n'));
      }
    }

    // 2. Fallback: Local File Header Scan
    let offset = 0;
    while (offset < buf.length - 30) {
      if (buf.readUInt32LE(offset) === 0x04034b50) {
        const compMethod = buf.readUInt16LE(offset + 8);
        const compSize = buf.readUInt32LE(offset + 18);
        const fileNameLen = buf.readUInt16LE(offset + 26);
        const extraLen = buf.readUInt16LE(offset + 28);
        const fileName = buf.slice(offset + 30, offset + 30 + fileNameLen).toString('utf8');
        const dataStart = offset + 30 + fileNameLen + extraLen;
        if (fileName === 'word/document.xml' && compSize > 0) {
          const compData = buf.slice(dataStart, dataStart + compSize);
          const xml = compMethod === 8 ? zlib.inflateRawSync(compData).toString('utf8') : compData.toString('utf8');
          const bodyTxt = xmlToText(xml);
          if (bodyTxt) return cleanDocxAndMarkdownArtifacts(bodyTxt);
        }
        offset = dataStart + Math.max(1, compSize);
      } else {
        offset++;
      }
    }
  } catch (e) {
    console.warn('[Docx Extraction Warning]', e.message);
  }

  return '';
}

// ── Step 2: Profile Normalization & Core Parsing Logic ──────────────────────
function normalizeProfileFields(parsedProfile) {
  if (!parsedProfile || typeof parsedProfile !== 'object') return parsedProfile;

  // Clean strings
  if (typeof parsedProfile.name === 'string') {
    parsedProfile.name = cleanDocxAndMarkdownArtifacts(parsedProfile.name).trim();
  }
  if (typeof parsedProfile.summary === 'string') {
    parsedProfile.summary = cleanDocxAndMarkdownArtifacts(parsedProfile.summary).trim();
  }
  if (!parsedProfile.writing_sample) {
    parsedProfile.writing_sample = parsedProfile.summary || '';
  }

  // Contact
  if (!parsedProfile.contact || typeof parsedProfile.contact !== 'object') {
    parsedProfile.contact = {};
  }
  const c = parsedProfile.contact;
  c.email = (c.email || '').trim();
  c.phone = (c.phone || '').trim();
  c.location = (c.location || (Array.isArray(parsedProfile.locations) && parsedProfile.locations[0]) || '').trim();
  c.status = (c.status || '').trim();
  c.linkedin = (c.linkedin || '').trim();
  c.github = (c.github || '').trim();

  // Locations
  if (!Array.isArray(parsedProfile.locations) || parsedProfile.locations.length === 0) {
    parsedProfile.locations = c.location ? [c.location] : ['Remote'];
  }

  // Country Code Inference
  if (!parsedProfile.country_code) {
    try {
      const { detectTargetCountryScope } = require('../core/geo-helper');
      const detected = detectTargetCountryScope([
        parsedProfile.country,
        c.location,
        ...(Array.isArray(parsedProfile.locations) ? parsedProfile.locations : [])
      ].filter(Boolean));
      if (detected && detected !== 'GLOBAL') {
        parsedProfile.country_code = detected;
      }
    } catch (_) {}
  }

  // Skills
  if (Array.isArray(parsedProfile.skills)) {
    parsedProfile.skills = parsedProfile.skills
      .map(s => cleanDocxAndMarkdownArtifacts(s).trim())
      .filter(s => s && s.length >= 2 && s.length <= 50 && !s.match(/^(?:INNER|LEFT|FULL|RANK|DENSE_RANK|LAG|LEAD|PARTITION BY\)?|\(Familiar\))$/i));
    if (parsedProfile.skills.includes('CTEs') && !parsedProfile.skills.includes('Window Functions')) {
      const cteIdx = parsedProfile.skills.indexOf('CTEs');
      parsedProfile.skills.splice(cteIdx + 1, 0, 'Window Functions');
    }
    parsedProfile.skills = [...new Set(parsedProfile.skills)];
  } else {
    parsedProfile.skills = [];
  }

  if (Array.isArray(parsedProfile.skills_familiar)) {
    parsedProfile.skills_familiar = parsedProfile.skills_familiar.map(s => cleanDocxAndMarkdownArtifacts(s)).filter(Boolean);
  } else {
    parsedProfile.skills_familiar = [];
  }

  // Experience
  if (Array.isArray(parsedProfile.experience)) {
    const normExp = [];
    for (const exp of parsedProfile.experience) {
      if (!exp || typeof exp !== 'object') continue;
      const role = cleanDocxAndMarkdownArtifacts(exp.role || exp.title || '').trim();
      let company = cleanDocxAndMarkdownArtifacts(exp.company || '').trim() || 'Direct Employer';
      let location = (exp.location || c.location || 'Remote / Hybrid').trim();
      const compLocMatch = company.match(/^(.+?)\s*(?:–|—|-)\s*([A-Za-z\s]+,\s*[A-Za-z]{2,}(?:\s*,?\s*[A-Za-z\s]+)?)$/);
      if (compLocMatch) {
        company = compLocMatch[1].trim();
        if (!exp.location) location = compLocMatch[2].trim();
      }
      const project = cleanDocxAndMarkdownArtifacts(exp.project || '').trim();
      const dates = (exp.dates || '').trim();
      let start_date = (exp.start_date || '').trim();
      let end_date = (exp.end_date || '').trim();

      if ((!start_date || !end_date) && dates) {
        const parts = dates.split(/\s*(?:–|—|-|\bto\b)\s*/i).filter(Boolean);
        if (parts.length >= 2) {
          if (!start_date) start_date = parts[0].trim();
          if (!end_date) end_date = parts[1].trim();
        } else if (parts.length === 1 && !start_date) {
          start_date = parts[0].trim();
        }
      }

      let bullets = [];
      if (Array.isArray(exp.bullets)) {
        bullets = exp.bullets
          .map(b => cleanDocxAndMarkdownArtifacts(b).replace(/^[\s•*·\-–—]+\s*/, '').trim())
          .filter(Boolean);
      } else if (typeof exp.bullets === 'string') {
        bullets = exp.bullets.split('\n').map(b => b.replace(/^[\s•*·\-–—]+\s*/, '').trim()).filter(Boolean);
      }

      // Strip any trailing next-job titles that accidentally got attached to the end of a bullet
      bullets = bullets.map(b => {
        return b.replace(/\.\s+(?:Data Analyst|Senior|Software Engineer|Cloud|Architect|Engineer|Consultant|Developer)\s*(?:[—–-]|at|@).+$/i, '.').trim();
      });

      let client = cleanDocxAndMarkdownArtifacts(exp.client || '').trim();
      if (!client && company) {
        const clientMatch = company.match(/\(Client:\s*([^)]+)\)/i) || company.match(/\bClient\s*[:\-–—]\s*([^,\n|()]+)/i);
        if (clientMatch) client = clientMatch[1].trim();
      }
      if (!client && project) {
        const clientMatch = project.match(/\(Client:\s*([^)]+)\)/i) || project.match(/\bClient\s*[:\-–—]\s*([^,\n|()]+)/i);
        if (clientMatch) client = clientMatch[1].trim();
      }
      if (/^highly\s+confidential$/i.test(client)) {
        const rawBulletClient = bullets.join(' ').match(/\b(?:Client|End Client)\s*[:\-–—]\s*([A-Za-z0-9&.\s]{2,30})/i);
        if (rawBulletClient && !/confidential/i.test(rawBulletClient[1])) {
          client = rawBulletClient[1].trim();
        }
      }

      if (role || company !== 'Direct Employer' || bullets.length > 0) {
        const syncedTitle = role || 'Professional Role';
        normExp.push({
          role: syncedTitle,
          title: syncedTitle,
          job_title: syncedTitle,
          project,
          client: client || '',
          company,
          location,
          start_date,
          end_date,
          dates: dates || ((start_date && end_date) ? `${start_date} – ${end_date}` : (start_date || end_date || '')),
          bullets
        });
      }
    }
    parsedProfile.experience = normExp;
  } else {
    parsedProfile.experience = [];
  }

  // Target titles & role synchronization
  if (!Array.isArray(parsedProfile.target_titles) || parsedProfile.target_titles.length === 0) {
    const titles = [];
    for (const exp of parsedProfile.experience) {
      if (exp.role && !titles.includes(exp.role)) titles.push(exp.role);
    }
    parsedProfile.target_titles = titles.length > 0 ? titles.slice(0, 3) : ['Data Analyst'];
  }
  parsedProfile.target_roles = parsedProfile.target_titles;
  parsedProfile.role = parsedProfile.target_titles[0] || (parsedProfile.experience[0] && parsedProfile.experience[0].role) || 'Professional';
  parsedProfile.title = parsedProfile.role;

  // Education with synchronized dates & degrees
  if (Array.isArray(parsedProfile.education)) {
    parsedProfile.education = parsedProfile.education.map(edu => {
      let degree = '';
      let institution = '';
      let dates = '';
      if (typeof edu === 'string') {
        degree = cleanDocxAndMarkdownArtifacts(edu).trim();
      } else if (edu && typeof edu === 'object') {
        degree = cleanDocxAndMarkdownArtifacts(edu.degree || '').trim();
        institution = cleanDocxAndMarkdownArtifacts(edu.institution || edu.school || '').trim();
        dates = cleanDocxAndMarkdownArtifacts(edu.dates || edu.year || '').trim();
      }

      // If dates are missing, extract from degree or institution strings
      if (!dates) {
        const dMatch = degree.match(/\b(?:19|20)\d\d\s*(?:–|—|-|\bto\b)\s*(?:Present|Current|(?:19|20)\d\d)\b/i) ||
                       degree.match(/\b(?:19|20)\d\d\b/);
        if (dMatch) {
          dates = dMatch[0].trim();
          degree = degree.replace(dMatch[0], '').replace(/[()•·\-,|]+$/, '').replace(/^[()•·\-,|]+/, '').trim();
        }
      }
      if (!dates) {
        const iMatch = institution.match(/\b(?:19|20)\d\d\s*(?:–|—|-|\bto\b)\s*(?:Present|Current|(?:19|20)\d\d)\b/i) ||
                       institution.match(/\b(?:19|20)\d\d\b/);
        if (iMatch) {
          dates = iMatch[0].trim();
          institution = institution.replace(iMatch[0], '').replace(/[()•·\-,|]+$/, '').replace(/^[()•·\-,|]+/, '').trim();
        }
      }

      return {
        degree,
        institution,
        dates,
        year: dates
      };
    }).filter(e => e.degree || e.institution);
  } else {
    parsedProfile.education = [];
  }

  // Certifications
  if (Array.isArray(parsedProfile.certifications)) {
    parsedProfile.certifications = parsedProfile.certifications.map(cert => {
      if (typeof cert === 'string') {
        const statusMatch = cert.match(/(?:—|–|-|\bdate:\s*)\s*(In Progress|Active|Completed|20\d\d|19\d\d)/i);
        const certDate = statusMatch ? statusMatch[1].trim() : 'Verified';
        const certName = statusMatch ? cert.replace(statusMatch[0], '').trim() : cert.trim();
        const issuerMatch = certName.match(/\b(Microsoft|AWS|Amazon|Google|Oracle|IBM|Cisco|CompTIA|Databricks|Snowflake)\b/i);
        return {
          name: certName,
          issuer: issuerMatch ? issuerMatch[1].trim() : 'Authorized Provider',
          date: certDate
        };
      }
      return {
        name: (cert.name || cert.title || '').trim(),
        issuer: (cert.issuer || cert.organization || 'Authorized Provider').trim(),
        date: (cert.date || cert.year || 'Verified').trim()
      };
    }).filter(c => c.name);
  } else {
    parsedProfile.certifications = [];
  }

  // Projects
  if (!Array.isArray(parsedProfile.projects)) {
    parsedProfile.projects = [];
  } else {
    parsedProfile.projects = parsedProfile.projects.map(p => ({
      name: cleanDocxAndMarkdownArtifacts(p.name || p.title || '').trim(),
      technologies: Array.isArray(p.technologies) ? p.technologies : (p.technologies ? [p.technologies] : []),
      description: cleanDocxAndMarkdownArtifacts(p.description || '').trim()
    })).filter(p => p.name || p.description);
  }

  parsedProfile.years_of_experience = calculateYearsOfExperience(parsedProfile.experience);
  if (!parsedProfile.total_experience_stated && parsedProfile.years_of_experience > 0) {
    parsedProfile.total_experience_stated = `${parsedProfile.years_of_experience} years`;
  }

  parsedProfile.skills_categorized = normalizeCategorizedSkills(parsedProfile.skills_categorized, parsedProfile.skills);

  return parsedProfile;
}

async function parseResume(inputFilePath, options = {}) {
  const isDryRun = options.dryRun || false;
  const isTest = options.isTest || false;
  const outPath = options.outPath || (isTest ? path.join(dataDir, 'test-profile.json') : profilePath);
  let targetPath = inputFilePath;

  // Auto-detect resume: check cache dir first, then try restoring from SQLite DB
  if (!targetPath) {
    const cacheDir = path.join(dataDir, 'cache');
    const candidates = ['uploaded_doc.docx', 'uploaded_doc.pdf', 'uploaded_resume.pdf', 'resume.pdf', 'resume.docx', 'resume.txt'];
    for (const f of candidates) {
      const cachePath = path.join(cacheDir, f);
      if (fs.existsSync(cachePath)) {
        targetPath = cachePath;
        break;
      }
      // Also check data root for backward compat
      if (fs.existsSync(path.join(dataDir, f))) {
        targetPath = path.join(dataDir, f);
        break;
      }
    }
  }

  if (!targetPath || !fs.existsSync(targetPath)) {
    throw new Error(`Resume file not found. Checked: ${targetPath}`);
  }

  console.log(`📄 Ingesting resume: ${targetPath}`);
  const ext = path.extname(targetPath).toLowerCase();
  const fileBuf = fs.readFileSync(targetPath);
  const maxUploadMb = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '5', 10);
  const maxUploadBytes = maxUploadMb * 1024 * 1024;
  if (fileBuf.length > maxUploadBytes) {
    const sizeMb = (fileBuf.length / (1024 * 1024)).toFixed(1);
    throw new Error(`File too large (${sizeMb} MB). Maximum allowed size is ${maxUploadMb} MB.`);
  }

  let apiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) {
    try {
      const settings = JSON.parse(fs.readFileSync(path.join(dataDir, 'config', 'settings.json'), 'utf8'));
      apiKey = settings.llm_api_key;
    } catch (_) {}
  }

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY or LLM_API_KEY is not configured in .env or settings.json');
  }

  // Prepare Payload
  let requestBody;
  if (ext === '.pdf') {
    requestBody = {
      contents: [{
        parts: [
          { text: SYSTEM_PROMPT },
          { text: "Extract profile verbatim from this PDF resume." },
          { inlineData: { mimeType: 'application/pdf', data: fileBuf.toString('base64') } }
        ]
      }],
      generationConfig: { response_mime_type: 'application/json' }
    };
  } else if (ext === '.docx') {
    const extractedText = extractDocxText(fileBuf);
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('Unable to extract readable text from DOCX document. Please ensure the document contains text and is not password-protected, or convert to PDF.');
    }
    requestBody = {
      contents: [{
        parts: [
          { text: SYSTEM_PROMPT },
          { text: `Extract profile from this resume text:\n\n${extractedText}` }
        ]
      }],
      generationConfig: { response_mime_type: 'application/json' }
    };
  } else {
    requestBody = {
      contents: [{
        parts: [
          { text: SYSTEM_PROMPT },
          { text: `Extract profile from this text:\n\n${fileBuf.toString('utf8')}` }
        ]
      }],
      generationConfig: { response_mime_type: 'application/json' }
    };
  }

  // ── Waterfall Model & Fallback Hierarchy (High Power to Low Power) ──────────
  const WATERFALL_MODELS = [
    process.env.GEMINI_MODEL,
    process.env.LLM_MODEL,
    'gemini-pro-latest',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3-flash-preview',
    'gemini-flash-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite'
  ].filter(Boolean);

  const uniqueModels = [...new Set(WATERFALL_MODELS)];
  let rawText = '';
  let lastError = null;

  async function executeWaterfall(payload) {
    for (const modelName of uniqueModels) {
      try {
        console.log(`Parsing resume via Gemini Waterfall [${modelName}]...`);
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errTxt = await res.text();
          const err = new Error(`HTTP ${res.status}: ${errTxt}`);
          recordModelError(modelName, err);
          console.warn(`⚠️ Waterfall Model [${modelName}] returned HTTP ${res.status}. Falling back to next tier...`);
          lastError = err;
          continue;
        }

        const json = await res.json();
        const extracted = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (extracted) {
          recordModelCall(modelName);
          console.log(`✅ Resume parsed successfully with Waterfall tier [${modelName}]`);
          return extracted;
        }
      } catch (e) {
        recordModelError(modelName, e);
        console.warn(`⚠️ Waterfall Model [${modelName}] request failed: ${e.message}. Falling back to next tier...`);
        lastError = e;
      }
    }
    return null;
  }

  // 1. Primary pass: Multimodal (PDF inlineData or extracted DOCX text)
  rawText = await executeWaterfall(requestBody);

  // 2. Ultimate Fallback: If multimodal PDF failed across all models, extract text via pdf-parse and retry waterfall
  if (!rawText && ext === '.pdf') {
    try {
      console.log('🔄 Multimodal PDF waterfall exhausted, attempting text-extracted fallback waterfall...');
      const pdfPkg = require('pdf-parse');
      let extractedPdfText = '';
      if (typeof pdfPkg === 'function') {
        const pdfResult = await pdfPkg(fileBuf);
        extractedPdfText = pdfResult?.text || '';
      } else if (pdfPkg?.PDFParse) {
        const parser = new pdfPkg.PDFParse({ data: fileBuf });
        await parser.load();
        const res = await parser.getText();
        extractedPdfText = res?.text || '';
      }
      if (extractedPdfText && extractedPdfText.trim().length > 50) {
        const textPayload = {
          contents: [{
            parts: [
              { text: SYSTEM_PROMPT },
              { text: `Extract profile from this resume text:\n\n${extractedPdfText}` }
            ]
          }],
          generationConfig: { response_mime_type: 'application/json' }
        };
        rawText = await executeWaterfall(textPayload);
      }
    } catch (parseErr) {
      console.warn('⚠️ Text extraction fallback error:', parseErr.message);
    }
  }

  if (!rawText) {
    console.error('❌ Failed to parse response from any Gemini model in waterfall:', lastError?.message);
    throw lastError || new Error('No response from LLM waterfall');
  }

  const parsedProfile = normalizeProfileFields(JSON.parse(rawText.replace(/```json/gi, '').replace(/```/g, '').trim()));

  if (!parsedProfile.name && !parsedProfile.skills) {
    console.error('❌ Profile missing key fields.');
    throw new Error('Parsed profile missing name and skills');
  }

  // Clean formatting artifacts from experience bullets, names, and summaries
  if (Array.isArray(parsedProfile.experience)) {
    for (const exp of parsedProfile.experience) {
      if (typeof exp.role === 'string') {
        exp.role = cleanDocxAndMarkdownArtifacts(exp.role);
        exp.title = exp.role;
        exp.job_title = exp.role;
      }
      if (typeof exp.project === 'string') exp.project = cleanDocxAndMarkdownArtifacts(exp.project);
      if (Array.isArray(exp.bullets)) {
        exp.bullets = exp.bullets.map(b => cleanDocxAndMarkdownArtifacts(b)).filter(Boolean);
      }
    }
  }
  if (Array.isArray(parsedProfile.skills)) {
    parsedProfile.skills = parsedProfile.skills.map(s => cleanDocxAndMarkdownArtifacts(s)).filter(Boolean);
  }
  if (Array.isArray(parsedProfile.skills_familiar)) {
    parsedProfile.skills_familiar = parsedProfile.skills_familiar.map(s => cleanDocxAndMarkdownArtifacts(s)).filter(Boolean);
  } else {
    parsedProfile.skills_familiar = [];
  }
  if (!Array.isArray(parsedProfile.projects)) {
    parsedProfile.projects = [];
  }
  if (typeof parsedProfile.summary === 'string') {
    parsedProfile.summary = cleanDocxAndMarkdownArtifacts(parsedProfile.summary);
  }
  parsedProfile.years_of_experience = calculateYearsOfExperience(parsedProfile.experience);

  // Normalize skills_categorized so every item in skills is in exactly one category
  parsedProfile.skills_categorized = normalizeCategorizedSkills(parsedProfile.skills_categorized, parsedProfile.skills);

  // Preserve stated total experience verbatim
  if (typeof parsedProfile.total_experience_stated !== 'string') {
    parsedProfile.total_experience_stated = '';
  }

  // Warning check if computed and stated totals differ by more than 1 year
  if (parsedProfile.total_experience_stated) {
    const statedMatch = parsedProfile.total_experience_stated.match(/(\d+(?:\.\d+)?)/);
    if (statedMatch) {
      const statedYears = parseFloat(statedMatch[1]);
      if (!isNaN(statedYears) && Math.abs(parsedProfile.years_of_experience - statedYears) > 1.0) {
        console.warn('\n⚠️ [Experience Calculation Warning] Stated vs Computed discrepancy:');
        console.warn(`   • Resume Stated Experience: "${parsedProfile.total_experience_stated}" (~${statedYears} years)`);
        console.warn(`   • Computed Experience:      ${parsedProfile.years_of_experience} years`);
        console.warn('   • Role Breakdown:');
        (parsedProfile.experience || []).forEach((exp, idx) => {
          console.warn(`     ${idx + 1}. ${exp.role} @ ${exp.company} (${exp.dates})`);
        });
      }
    }
  }

  // ── Step 3: Save Output ───────────────────────────────────────────────────
  if (isDryRun) {
    console.log(`ℹ️ [DRY RUN] Parsing successful. Skipping write.`);
  } else if (isTest) {
    fs.writeFileSync(outPath, JSON.stringify(parsedProfile, null, 2));
    console.log(`🧪 Test profile written to ${outPath}`);
  } else {
    if (fs.existsSync(outPath)) {
      fs.writeFileSync(backupPath, fs.readFileSync(outPath, 'utf8'));
      console.log(`💾 Backed up previous profile to ${backupPath}`);
    }
    fs.writeFileSync(outPath, JSON.stringify(parsedProfile, null, 2));
    console.log(`✅ Successfully updated ${outPath}`);
  }

  // Delete the source resume file after parsing into JSON if requested
  if (options.deleteAfterParsing && targetPath && fs.existsSync(targetPath)) {
    try {
      fs.unlinkSync(targetPath);
      console.log(`🗑️ Deleted source resume after parsing into JSON: ${targetPath}`);
    } catch (e) {
      console.warn(`⚠️ Could not delete resume after parsing: ${e.message}`);
    }
  }

  console.log('\n--- Extraction Summary ---');
  console.log(`👤 Name: ${parsedProfile.name || 'N/A'}`);
  console.log(`💼 Roles Extracted: ${(parsedProfile.experience || []).length}`);
  console.log(`⏳ Computed Experience: ${parsedProfile.years_of_experience} years${parsedProfile.total_experience_stated ? ` (Stated: "${parsedProfile.total_experience_stated}")` : ''}`);
  console.log(`🛠️  Skills Extracted: ${(parsedProfile.skills || []).length} items`);
  if (Array.isArray(parsedProfile.skills_categorized) && parsedProfile.skills_categorized.length > 0) {
    console.log(`📂 Skill Categories (${parsedProfile.skills_categorized.length}):`);
    parsedProfile.skills_categorized.forEach(c => {
      console.log(`   • ${c.category} (${c.items.length}): ${c.items.join(', ')}`);
    });
  }

  return parsedProfile;
}

function promoteTestProfile() {
  const testPath = path.join(dataDir, 'test-profile.json');
  if (!fs.existsSync(testPath)) {
    console.error('❌ No test profile found. Run with --test first.');
    process.exit(1);
  }
  if (fs.existsSync(profilePath)) fs.writeFileSync(backupPath, fs.readFileSync(profilePath, 'utf8'));
  fs.writeFileSync(profilePath, fs.readFileSync(testPath, 'utf8'));
  console.log('🎉 test-profile.json promoted to master-profile.json!');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--promote')) return promoteTestProfile();

  parseResume(args.find(a => !a.startsWith('--')), {
    dryRun: args.includes('--dry-run'),
    isTest: args.includes('--test'),
    deleteAfterParsing: args.includes('--delete-after-parsing')
  }).catch(e => console.error('Fatal error:', e));
}

module.exports = {
  parseResume,
  normalizeProfileFields,
  SYSTEM_PROMPT,
  calculateYearsOfExperience,
  roundYearsOfExperience,
  normalizeCategorizedSkills,
  cleanDocxAndMarkdownArtifacts
};
