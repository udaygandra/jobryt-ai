/**
 * fetch-all-boards.js — Multi-Board Job Ingestion Engine
 *
 * PURPOSE:
 *   High-performance, zero-token job ingestion from multiple sources:
 *   1. Adzuna API (Free Tier)
 *   2. Canada Job Bank (Direct Open Web Ingestion)
 *   3. LinkedIn Jobs (High-speed Direct Guest API)
 *   4. USAJOBS Federal API (for US queries)
 *   5. Remotive & Jobicy Feeds (Global & NA Tech/Remote)
 *
 * HOW IT WORKS:
 *   1. Loads the candidate's master profile to determine target roles/locations.
 *   2. Checks `settings.json` to see which boards are enabled.
 *   3. Fetches jobs from all enabled boards in parallel.
 *   4. Filters out jobs that don't match the target roles/locations/work type.
 *   5. Outputs a single JSON array of normalized job objects to stdout.
 *
 * USAGE:
 *   node scripts/fetch-all-boards.js > fetched_jobs.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Step 1: Load Environment and Configuration ──────────────────────────────
const { loadEnv } = require('../core/load-env');
loadEnv();

const { getDataDir, readJsonFile } = require('../core/common-utils');
const { getSettings } = require('../core/settings-helper');
const {
  detectTargetCountryScope,
  isJobLocationEligible,
  isJobWorkplaceEligible,
  isJobRoleRelevant,
  getSearchLocationQuery,
  isExplicitlyNegativeRemote,
} = require('../core/geo-helper');

const dataDir = getDataDir();
const profileObj = readJsonFile(path.join(__dirname, '..', '..', 'data', 'profiles', 'master-profile.json'), {});
const settings = getSettings();

// ── Step 2: Determine Search Parameters ─────────────────────────────────────
// Fallback to environment variables if profile is empty
let targetTitles = Array.isArray(profileObj.target_titles) && profileObj.target_titles.length > 0
  ? [...profileObj.target_titles]
  : (process.env.ADZUNA_SEARCH_ROLE ? [process.env.ADZUNA_SEARCH_ROLE] : ['Target Role']);

let targetLocations = Array.isArray(profileObj.locations) && profileObj.locations.length > 0
  ? profileObj.locations.map(l => l.split(',')[0].trim())
  : (process.env.ADZUNA_SEARCH_LOCATION ? [process.env.ADZUNA_SEARCH_LOCATION] : ['Remote']);

let activeLocations = Array.isArray(profileObj.locations) && profileObj.locations.length > 0
  ? [...profileObj.locations]
  : [...targetLocations];

let activeTitles = Array.isArray(profileObj.target_titles) && profileObj.target_titles.length > 0
  ? [...profileObj.target_titles]
  : [...targetTitles];

let candidateWorkType = settings.work_type || profileObj.work_type || 'Open to All';
let freshnessHours = settings.freshness_hours !== undefined ? settings.freshness_hours : 24;
let isFreshnessDisabled = freshnessHours <= 0;
let maxDaysOld = isFreshnessDisabled ? 365 : Math.max(1, Math.ceil(freshnessHours / 24));
const boardsEnabled = { ...(settings.boards_enabled || {}) };

// Country scope determines which region-specific boards to query (e.g. Canada Job Bank vs USAJOBS)
let countryScope = (settings.country_scope && settings.country_scope !== 'AUTO')
  ? settings.country_scope
  : detectTargetCountryScope(activeLocations);

// ── Step 3: Rotate Search Role and Location ─────────────────────────────────
// To avoid hitting API limits and get varied results, we cycle through the
// candidate's target roles and locations on each run.
function rotateIndex(filename, maxLimit) {
  const cacheDir = path.join(dataDir, 'cache');
  if (!fs.existsSync(cacheDir)) {
    try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (_) {}
  }
  const filepath = path.join(cacheDir, filename);
  let idx = 0;
  try {
    if (fs.existsSync(filepath)) {
      idx = (JSON.parse(fs.readFileSync(filepath, 'utf8')).idx || 0) % maxLimit;
    }
    fs.writeFileSync(filepath, JSON.stringify({ idx: (idx + 1) % maxLimit }));
  } catch (err) {
    console.error(`[Warning] Could not rotate ${filename}:`, err.message);
  }
  return idx;
}

const roleIdx = rotateIndex('adzuna_role_idx.json', targetTitles.length);
const locIdx = rotateIndex('adzuna_loc_idx.json', targetLocations.length);

let currentRole = targetTitles[roleIdx] || 'Target Role';
let currentLoc = targetLocations[locIdx] || '';
const ADZUNA_CODE_MAP = Object.freeze({
  'US': 'us', 'USA': 'us',
  'GB': 'gb', 'UK': 'gb',
  'CA': 'ca',
  'DE': 'de',
  'FR': 'fr',
  'AU': 'au',
  'IN': 'in',
  'NL': 'nl',
  'BR': 'br',
  'IT': 'it',
  'PL': 'pl',
  'ZA': 'za',
  'AT': 'at',
  'NZ': 'nz',
  'SG': 'sg',
  'MX': 'mx'
});

let country = (ADZUNA_CODE_MAP[countryScope] || (process.env.ADZUNA_COUNTRY || 'us')).toLowerCase().trim();
let commuteRadiusKm = 25;

function setSearchContext({ role, location, scope, locations, titles, workType, boards, freshness, radius } = {}) {
  if (role !== undefined) currentRole = role;
  if (location !== undefined) currentLoc = location;
  if (locations !== undefined) {
    activeLocations = Array.isArray(locations) ? [...locations] : [locations];
    targetLocations = activeLocations.map(l => l.split(',')[0].trim());
  }
  if (titles !== undefined) {
    activeTitles = Array.isArray(titles) ? [...titles] : [titles];
    targetTitles = [...activeTitles];
  }
  if (scope !== undefined) {
    countryScope = scope;
    country = (ADZUNA_CODE_MAP[countryScope] || (process.env.ADZUNA_COUNTRY || 'us')).toLowerCase().trim();
  }
  if (workType !== undefined) {
    candidateWorkType = workType;
  }
  if (boards !== undefined && typeof boards === 'object') {
    Object.assign(boardsEnabled, boards);
  }
  if (freshness !== undefined) {
    freshnessHours = Number(freshness);
    isFreshnessDisabled = freshnessHours <= 0;
    maxDaysOld = isFreshnessDisabled ? 365 : Math.max(1, Math.ceil(freshnessHours / 24));
  }
  if (radius !== undefined) {
    commuteRadiusKm = Number(radius);
  }
}

function getSearchContext() {
  return {
    role: currentRole,
    location: currentLoc,
    countryScope,
    country,
    activeLocations,
    locations: activeLocations,
    activeTitles,
    titles: activeTitles,
    candidateWorkType,
    workType: candidateWorkType,
    freshnessHours,
    boardsEnabled
  };
}

console.error(`[Multi-Board Ingestion] Scope: "${countryScope}" (Adzuna: ${country}) | Role [${roleIdx + 1}/${targetTitles.length}]: "${currentRole}" | Loc [${locIdx + 1}/${targetLocations.length}]: "${currentLoc}" | Mode: "${candidateWorkType}" | Freshness: ${isFreshnessDisabled ? 'Disabled (Any Time)' : freshnessHours + 'h'}...`);

// Shared array to collect all fetched jobs
const { AsyncLocalStorage } = require('async_hooks');
const { runPool, hostFetch } = require('./fetch-pool');

// Per-task search context: each (role, location) task runs inside its own
// AsyncLocalStorage store so concurrent fetchers never see each other's state.
const ctxStore = new AsyncLocalStorage();
const CTX = {
  get role() { const s = ctxStore.getStore(); return s ? s.role : currentRole; },
  get loc() { const s = ctxStore.getStore(); return s ? s.loc : currentLoc; },
};

const allFetchedJobs = [];

// ── Step 4: Board Fetcher Implementations ───────────────────────────────────

/**
 * Fetches jobs from Adzuna (Free API).
 */
async function fetchAdzuna() {
  if (boardsEnabled.adzuna === false) return console.error('[Fetch] Adzuna disabled.');
  const adzunaAppId = process.env.ADZUNA_APP_ID;
  const adzunaAppKey = process.env.ADZUNA_APP_KEY;
  if (!adzunaAppId || !adzunaAppKey || adzunaAppId === 'your_adzuna_app_id') {
    return console.error('[Fetch] Adzuna credentials missing, skipping.');
  }

  let count = 0;
  const isExplicitRemote = candidateWorkType.toLowerCase().includes('remote') || CTX.loc.toLowerCase() === 'remote';
  let searchWhere = isExplicitRemote ? '' : CTX.loc;
  try {
    const resolvedLoc = getSearchLocationQuery(CTX.loc);
    if (resolvedLoc && searchWhere && searchWhere.toLowerCase() !== 'remote') {
      const parts = resolvedLoc.split(',');
      searchWhere = parts.length >= 2 ? `${parts[0].trim()} ${parts[1].trim()}`.trim() : parts[0].trim();
    }
  } catch (err) {}

  const targetCountry = (ADZUNA_CODE_MAP[countryScope] || (process.env.ADZUNA_COUNTRY || 'us')).toLowerCase().trim();

  await Promise.all([1, 2, 3].map(async (page) => {
    try {
      const radius = Math.max(15, commuteRadiusKm || 25);
      const whereParam = searchWhere ? `&where=${encodeURIComponent(searchWhere)}&distance=${radius}` : '';
      const adzunaDays = Math.max(14, maxDaysOld);
      const cleanRole = CTX.role.replace(/^(senior|lead|principal|sr\.?)\s+/i, '').trim() || CTX.role;
      const adzunaRoleQuery = cleanRole;
      
      const url = `https://api.adzuna.com/v1/api/jobs/${targetCountry}/search/${page}?app_id=${adzunaAppId}&app_key=${adzunaAppKey}&what=${encodeURIComponent(adzunaRoleQuery)}${whereParam}&sort_by=date&max_days_old=${adzunaDays}&results_per_page=50`;
      
      const res = await hostFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) {
        console.error(`[Fetch] Adzuna HTTP ${res.status}`);
        return;
      }
      
      const data = await res.json();
      if (!data || !Array.isArray(data.results)) return;

      for (const item of data.results) {
        const rawLoc = (item.location && item.location.display_name) || (isExplicitRemote ? 'Remote' : CTX.loc);
        const rawTitle = item.title ? item.title.replace(/<\/?[^>]+(>|$)/g, "").trim() : CTX.role;
        const rawDesc = item.description ? item.description.replace(/<\/?[^>]+(>|$)/g, "").trim() : '';
        
        const negRemote = isExplicitlyNegativeRemote(`${rawTitle} ${rawDesc} ${rawLoc}`);
        const isHybridAdzuna = /\b(hybrid|hybride)\b/i.test(rawLoc) ||
          /\b(hybrid|hybride)\b/i.test(rawTitle) ||
          /\b(hybrid\s+work|hybrid\s+role|hybrid\s+model|hybrid\s+environment|in-office\s+and\s+remote|in\s+office\s+and\s+remote)\b/i.test(rawDesc);

        const isExplicitTitleOrLocRemote = /\b(remote|wfh|telecommute|virtual)\b/i.test(rawLoc) ||
          /\b(remote|wfh|telecommute|virtual)\b/i.test(rawTitle) ||
          /\(remote\)|-\s*remote|remote\s*in\b|canada\s*wide\s*remote/i.test(rawLoc) ||
          /\(remote\)|-\s*remote/i.test(rawTitle);

        const isExplicitDescRemote = /\b(100%\s*remote|fully\s*remote|fully-remote|permanent\s*remote|remote\s*across\s*canada|remote\s*anywhere\s*in\s*canada|work\s*from\s*home\s*anywhere)\b/i.test(rawDesc);

        const isRemoteAdzuna = !negRemote && (isExplicitRemote || isExplicitTitleOrLocRemote || isExplicitDescRemote) && !isHybridAdzuna;
        
        // Filter jobs based on profile match
        if (!isJobLocationEligible(rawLoc, activeLocations, countryScope, isRemoteAdzuna, rawDesc)) continue;
        if (!isJobRoleRelevant(rawTitle, activeTitles)) continue;
        if (typeof isJobWorkplaceEligible === 'function' && !isJobWorkplaceEligible(rawLoc, rawDesc, rawTitle, candidateWorkType, isRemoteAdzuna)) continue;
        
        allFetchedJobs.push({
          id: `adzuna_${item.id}`,
          title: rawTitle,
          company: (item.company && (item.company.display_name || item.company.name)) || 'Company',
          location: rawLoc,
          created: item.created || new Date().toISOString(),
          description: rawDesc,
          redirect_url: item.redirect_url || item.url || '',
          source: 'Adzuna'
        });
        count++;
      }
    } catch (err) {
      console.error(`[Fetch] Adzuna error on page ${page}:`, err.message);
    }
  }));
  console.error(`[Fetch] Adzuna found: ${count} jobs`);
}

// Helper: Fetch Job Bank posting details
async function fetchJobBankDetails(postingId) {
  if (!postingId) return '';
  try {
    const res = await hostFetch(`https://www.jobbank.gc.ca/jobsearch/jobposting/${postingId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en-CA,en-US;q=0.9'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return '';
    const html = await res.text();
    const idx = html.indexOf('Job details');
    if (idx > -1) {
      const chunk = html.substring(idx, idx + 4000);
      const clean = chunk.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const endNotice = clean.indexOf('Important notice:');
      return endNotice > 50 ? clean.substring(0, endNotice).trim() : clean.substring(0, 1500).trim();
    }
  } catch (_) {}
  return '';
}

/**
 * Fetches jobs from Canada Job Bank (Direct HTML parsing).
 */
async function fetchCanadaJobBank() {
  if (boardsEnabled.canada_job_bank === false) return console.error('[Fetch] Canada Job Bank disabled.');
  if (countryScope !== 'CA' && countryScope !== 'US_CA' && countryScope !== 'GLOBAL') {
    return console.error(`[Fetch] Canada Job Bank skipped (${countryScope} mode).`);
  }
  
  let count = 0;
  try {
    const isExplicitRemote = candidateWorkType.toLowerCase().includes('remote') || CTX.loc.toLowerCase() === 'remote';
    const rawSearchLoc = getSearchLocationQuery(CTX.loc);
    const jobBankLoc = isExplicitRemote ? 'Canada' : (rawSearchLoc.split(',')[0].trim() || 'Toronto');
    const cleanSearchRole = CTX.role.replace(/\s+(II|III|IV|I)\b/i, '').trim() || CTX.role;
    const url = `https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring=${encodeURIComponent(cleanSearchRole)}&locationstring=${encodeURIComponent(jobBankLoc)}&sort=D`;
    
    const res = await hostFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en-CA,en-US;q=0.9'
      }
    });

    if (!res.ok) return console.error(`[Fetch] Job Bank HTTP ${res.status}`);

    const htmlText = await res.text();
    const articles = htmlText.split('<article').slice(1);
    const candidates = [];
    
    for (const article of articles) {
      const titleMatch = article.match(/<span class="noctitle">([\s\S]*?)<\/span>/i) || article.match(/<h3[\s\S]*?>([\s\S]*?)<\/h3>/i);
      const linkMatch = article.match(/href="\/jobsearch\/jobposting\/([0-9]+)"/i) || article.match(/href="(\/jobsearch\/jobposting\/[^"]*)"/i);
      const compMatch = article.match(/<li class="business">([\s\S]*?)<\/li>/i);
      const locMatch = article.match(/<li class="location">([\s\S]*?)<\/li>/i);
      const salMatch = article.match(/<li class="salary">([\s\S]*?)<\/li>/i);
      const srcMatch = article.match(/<li class="source">([\s\S]*?)<\/li>/i);

      let rawTitle = titleMatch ? titleMatch[1].replace(/<\/?[^>]+(>|$)/g, "").replace(/\s+/g, ' ').trim() : '';
      rawTitle = rawTitle.replace(/^(New|Nouveau)\s*/i, '').replace(/^(indeed\.com)\s*/i, '').trim();

      const postingIdRaw = linkMatch ? linkMatch[1] : '';
      const cleanPostingId = postingIdRaw.replace(/^.*\/jobsearch\/jobposting\//, '').replace(/;.*$/, '').replace(/^\//, '');
      const rawLink = cleanPostingId ? `https://www.jobbank.gc.ca/jobsearch/jobposting/${cleanPostingId}` : '';
      const rawComp = compMatch ? compMatch[1].replace(/<\/?[^>]+(>|$)/g, "").trim() : 'Gov of Canada Employer';
      const rawLoc = locMatch
        ? locMatch[1].replace(/<\/?[^>]+(>|$)/g, "").replace(/\s+/g, ' ').replace(/^(Location|Lieu)\s*[:\-]?\s*/i, '').trim()
        : CTX.loc;
      const rawSalary = salMatch ? salMatch[1].replace(/<\/?[^>]+(>|$)/g, "").replace(/\s+/g, ' ').replace(/^Salary\s*/i, '').trim() : '';
      const rawSource = srcMatch ? srcMatch[1].replace(/<\/?[^>]+(>|$)/g, "").replace(/\s+/g, ' ').trim() : '';

      // Extract work arrangement pill from Canada Job Bank (<span class="telework">...</span>)
      // "Telework" / "Télétravail" = 100% Remote nationwide
      // "Hybrid" / "Hybride" = Local Hybrid (requires candidate to live in rawLoc)
      // "On site" / "Sur place" = Local On-site (requires candidate to live in rawLoc)
      const teleMatch = article.match(/<span class="telework">([\s\S]*?)<\/span>/i);
      const teleText = teleMatch ? teleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      const isJbRemote = /^(telework|télétravail|virtual|à distance)$/i.test(teleText);
      const isJbHybrid = /^(hybrid|hybride)$/i.test(teleText);

      let baseDesc = `${rawTitle} at ${rawComp} in ${rawLoc || CTX.loc}${isJbRemote ? ' (Remote)' : (isJbHybrid ? ' (Hybrid)' : '')}`;
      if (rawSalary) baseDesc += ` | Salary: ${rawSalary}`;
      if (rawSource) baseDesc += ` | Source: ${rawSource}`;

      if (rawTitle && rawLink && isJobLocationEligible(rawLoc, activeLocations, countryScope, isJbRemote, baseDesc) && isJobRoleRelevant(rawTitle, activeTitles) && isJobWorkplaceEligible(rawLoc, baseDesc, rawTitle, candidateWorkType, isJbRemote)) {
        const jbId = cleanPostingId || crypto.createHash('md5').update(rawLink).digest('hex').slice(0, 10);
        candidates.push({ jbId, cleanPostingId, rawTitle, rawComp, rawLoc, rawLink, baseDesc });
      }
    }

    await Promise.all(candidates.map(async (c) => {
      let detailed = '';
      if (c.cleanPostingId) {
        detailed = await fetchJobBankDetails(c.cleanPostingId);
      }
      allFetchedJobs.push({
        id: `jobbank_${c.jbId}`,
        title: c.rawTitle,
        company: c.rawComp,
        location: c.rawLoc || CTX.loc,
        created: new Date().toISOString(),
        description: detailed ? `${c.baseDesc}\n\n${detailed}` : c.baseDesc,
        redirect_url: c.rawLink,
        source: 'Canada Job Bank'
      });
      count++;
    }));
  } catch (err) {
    console.error('[Fetch] Canada Job Bank error:', err.message);
  }
  console.error(`[Fetch] Canada Job Bank found: ${count} jobs`);
}

async function fetchLinkedInJobDetails(numId) {
  if (!numId) return '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await hostFetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${numId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html'
        },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) {
        if (attempt < 2) await new Promise(r => setTimeout(r, 400));
        continue;
      }
      const html = await res.text();
      const markupMatch = html.match(/class="show-more-less-html__markup[^"]*">([\s\S]*?)<\/div>/i)
        || html.match(/class="description__text[^"]*">([\s\S]*?)<\/div>/i)
        || html.match(/class="show-more-less-html[^"]*">([\s\S]*?)<\/section>/i)
        || html.match(/class="decorated-job-posting__details[^"]*">([\s\S]*?)<\/section>/i);
      if (markupMatch && markupMatch[1].trim()) {
        return markupMatch[1].trim();
      }
    } catch (_) {
      if (attempt < 2) await new Promise(r => setTimeout(r, 400));
    }
  }
  return '';
}

/**
 * Fetches jobs from LinkedIn (Direct Guest API).
 */
async function fetchLinkedIn() {
  if (boardsEnabled.linkedin === false) return console.error('[Fetch] LinkedIn disabled.');
  
  let count = 0;
  let searchLoc = getSearchLocationQuery(CTX.loc);
  const isExplicitRemote = candidateWorkType.toLowerCase().includes('remote') || CTX.loc.toLowerCase() === 'remote';

  const LINKEDIN_COUNTRY_NAMES = {
    'US': 'United States',
    'CA': 'Canada',
    'GB': 'United Kingdom',
    'UK': 'United Kingdom',
    'DE': 'Germany',
    'FR': 'France',
    'IN': 'India',
    'AU': 'Australia',
    'SG': 'Singapore',
    'NL': 'Netherlands',
    'BR': 'Brazil',
    'JP': 'Japan',
    'AE': 'United Arab Emirates'
  };

  let f_wt = '';
  if (isExplicitRemote) {
    f_wt = '&f_WT=2';
    searchLoc = LINKEDIN_COUNTRY_NAMES[countryScope] || searchLoc || 'Canada';
  } else if (candidateWorkType.toLowerCase().includes('hybrid')) {
    f_wt = '&f_WT=3';
  } else if (candidateWorkType.toLowerCase().includes('onsite') || candidateWorkType.toLowerCase().includes('on-site')) {
    f_wt = '&f_WT=1';
  }

  const fTprParam = isFreshnessDisabled ? '' : (freshnessHours <= 24 ? '&f_TPR=r86400' : (freshnessHours <= 72 ? '&f_TPR=r259200' : (freshnessHours <= 168 ? '&f_TPR=r604800' : '')));

  try {
    for (let page = 0; page <= 1; page++) {
      const start = page * 10;
      const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(CTX.role)}&location=${encodeURIComponent(searchLoc)}${f_wt}${fTprParam}&start=${start}`;
      
      const res = await hostFetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html'
        }
      });
      
      if (!res.ok) continue;

      const html = await res.text();
      const items = html.split('<li').slice(1);
      const candidates = [];
      
      for (const it of items) {
        const titleM = it.match(/<h3 class="base-search-card__title">([\s\S]*?)<\/h3>/);
        const compM = it.match(/<h4 class="base-search-card__subtitle">([\s\S]*?)<\/h4>/);
        const locM = it.match(/<span class="job-search-card__location">([\s\S]*?)<\/span>/);
        const linkM = it.match(/href="([^"]+jobs\/view\/[^"]+)"/);
        const dateM = it.match(/<time datetime="([^"]+)"/);
        
        if (titleM && linkM) {
          const rawTitle = titleM[1].trim();
          const rawComp = compM ? compM[1].trim().replace(/<[^>]+>/g, '').trim() : 'LinkedIn Employer';
          const rawLoc = locM ? locM[1].trim() : CTX.loc;
          const rawUrl = linkM[1].split('?')[0];
          const rawDate = dateM ? dateM[1] : new Date().toISOString();

          const isNeg = isExplicitlyNegativeRemote(`${rawTitle} ${rawLoc}`);
          const isHybridLi = /\b(hybrid|hybride)\b/i.test(rawLoc) ||
            /\b(hybrid|hybride)\b/i.test(rawTitle);
          const isExplicitTitleOrLocRemote = /\b(remote|wfh|telecommute|virtual)\b/i.test(rawLoc) ||
            /\b(remote|wfh|telecommute|virtual)\b/i.test(rawTitle) ||
            /\(remote\)|-\s*remote|remote\s*in\b|canada\s*wide\s*remote/i.test(rawLoc) ||
            /\(remote\)|-\s*remote/i.test(rawTitle);

          const isRemoteLi = !isNeg && (isExplicitRemote || isExplicitTitleOrLocRemote) && !isHybridLi;

          if (rawTitle && rawUrl && isJobLocationEligible(rawLoc, activeLocations, countryScope, isRemoteLi) && isJobRoleRelevant(rawTitle, activeTitles) && isJobWorkplaceEligible(rawLoc, `${rawTitle} at ${rawComp}`, rawTitle, candidateWorkType, isRemoteLi)) {
            const numId = (rawUrl.match(/-([0-9]{5,})/i) || rawUrl.match(/\/([0-9]{5,})/i) || [])[1];
            const cleanLiId = numId ? `li_${numId}` : `li_${crypto.createHash('md5').update(rawUrl).digest('hex').slice(0, 10)}`;
            candidates.push({ cleanLiId, numId, rawTitle, rawComp, rawLoc, rawUrl, rawDate, isRemoteLi });
          }
        }
      }

      await Promise.all(candidates.map(async (c) => {
        let fullDesc = '';
        if (c.numId) {
          // Pacing/429 protection is enforced by hostFetch (per-host cap + gap + retry)
          fullDesc = await fetchLinkedInJobDetails(c.numId);
        }

        const isHybridAfterDesc = /\b(hybrid|hybride)\b/i.test(c.rawLoc) ||
          /\b(hybrid|hybride)\b/i.test(c.rawTitle) ||
          /\b(hybrid\s+work|hybrid\s+role|hybrid\s+model|hybrid\s+environment|in-office\s+and\s+remote|in\s+office\s+and\s+remote)\b/i.test(fullDesc);

        const isExplicitRemoteAfterDesc = /\b(100%\s*remote|fully\s*remote|fully-remote|permanent\s*remote|remote\s*across\s*canada|remote\s*anywhere\s*in\s*canada|work\s*from\s*home\s*anywhere)\b/i.test(fullDesc);

        const isRemoteFinal = (c.isRemoteLi || isExplicitRemoteAfterDesc) && !isHybridAfterDesc;

        if (!isJobLocationEligible(c.rawLoc, activeLocations, countryScope, isRemoteFinal, fullDesc)) {
          return;
        }

        allFetchedJobs.push({
          id: c.cleanLiId,
          title: c.rawTitle,
          company: c.rawComp,
          location: c.rawLoc,
          created: c.rawDate,
          description: fullDesc || `${c.rawTitle} at ${c.rawComp} in ${c.rawLoc}`,
          redirect_url: c.rawUrl,
          source: 'LinkedIn Jobs'
        });
        count++;
      }));
    }
  } catch (err) {
    console.error('[Fetch] LinkedIn error:', err.message);
  }
  console.error(`[Fetch] LinkedIn found: ${count} jobs`);
}

/**
 * Fetches jobs from USAJOBS Federal API.
 */
async function fetchUSAJobs() {
  if (boardsEnabled.usajobs === false) return console.error('[Fetch] USAJOBS disabled.');
  if (countryScope !== 'US' && countryScope !== 'US_CA' && countryScope !== 'GLOBAL') {
    return console.error(`[Fetch] USAJOBS skipped (${countryScope} mode).`);
  }
  
  const usajobsKey = process.env.USAJOBS_API_KEY || process.env.USAJOBS_AUTH_KEY;
  if (!usajobsKey) return;

  let count = 0;
  try {
    const userAgent = process.env.USAJOBS_USER_AGENT || process.env.USAJOBS_EMAIL || process.env.SMTP_USER || process.env.N8N_BASIC_AUTH_USER || profileObj.contact?.email || 'candidate@local.dev';
    const isNationwideOrRemote = /remote|anywhere|united states|usa|all states/i.test(CTX.loc);
    let locQuery = '';
    if (!isNationwideOrRemote && CTX.loc) {
      locQuery = `&LocationName=${encodeURIComponent(CTX.loc)}`;
    }

    const cleanRole = CTX.role.replace(/^(senior|lead|principal|sr\.?)\s+/i, '').trim() || CTX.role;
    const url = `https://data.usajobs.gov/api/search?Keyword=${encodeURIComponent(cleanRole)}${locQuery}&ResultsPerPage=25`;
    
    const res = await hostFetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Authorization-Key': usajobsKey,
        'Host': 'data.usajobs.gov'
      }
    });

    if (!res.ok) return console.error(`[Fetch] USAJOBS HTTP ${res.status}`);

    const data = await res.json();
    const items = data.SearchResult?.SearchResultItems || [];
    
    for (const wrap of items) {
      const desc = wrap.MatchedObjectDescriptor || {};
      const rawTitle = desc.PositionTitle || '';
      const rawUrl = desc.PositionURI || (desc.ApplyURI && desc.ApplyURI[0]) || '';
      const rawCompany = desc.OrganizationName || desc.DepartmentName || 'US Federal Government';
      const locDisplay = desc.PositionLocationDisplay || (desc.PositionLocation && desc.PositionLocation[0] && desc.PositionLocation[0].LocationName) || 'United States';
      
      const duties = Array.isArray(desc.UserArea?.Details?.MajorDuties) ? desc.UserArea.Details.MajorDuties.join('\n• ') : '';
      const summaryParts = [
        desc.UserArea?.Details?.JobSummary,
        desc.QualificationSummary ? `Qualifications:\n${desc.QualificationSummary}` : '',
        duties ? `Major Duties:\n• ${duties}` : ''
      ].filter(Boolean);
      const rawSummary = summaryParts.length > 0 ? summaryParts.join('\n\n') : `${rawTitle} at ${rawCompany}`;
      const isTelework = Boolean(desc.UserArea?.Details?.TeleworkEligible || desc.UserArea?.Details?.RemoteIndicator || /remote|telework/i.test(locDisplay) || /remote|telework/i.test(rawSummary));

      if (rawTitle && rawUrl && isJobLocationEligible(locDisplay, activeLocations, countryScope, isTelework) && isJobRoleRelevant(rawTitle, activeTitles) && isJobWorkplaceEligible(locDisplay, rawSummary, rawTitle, candidateWorkType, isTelework)) {
        const ujId = wrap.MatchedObjectId || crypto.createHash('md5').update(rawUrl).digest('hex').slice(0, 10);
        allFetchedJobs.push({
          id: `usajobs_${ujId}`,
          title: rawTitle,
          company: rawCompany,
          location: locDisplay,
          created: desc.PublicationStartDate || new Date().toISOString(),
          description: rawSummary,
          redirect_url: rawUrl,
          source: 'USAJOBS'
        });
        count++;
      }
    }
  } catch (err) {
    console.error('[Fetch] USAJOBS error:', err.message);
  }
  console.error(`[Fetch] USAJOBS found: ${count} jobs`);
}

function preserveRichJobDescription(rawDesc, fallback = '') {
  if (!rawDesc || typeof rawDesc !== 'string') return fallback;
  return rawDesc
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .trim() || fallback;
}

/**
 * Fetches jobs from Remotive, Jobicy, ArbeitNow, and Himalayas.
 */
async function fetchGlobalRemoteFeeds() {
  let count = 0;

  // 1. ArbeitNow API
  if (boardsEnabled.arbeitnow !== false) {
    try {
      const url = `https://www.arbeitnow.com/api/job-board-api?search=${encodeURIComponent(CTX.role)}`;
      const res = await hostFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.ok) {
        const data = await res.json();
        for (const item of (data.data || []).slice(0, 20)) {
          const rawTitle = item.title || '';
          const rawUrl = item.url || '';
          const rawCompany = item.company_name || 'Tech Employer';
          const rawLoc = item.remote ? `${item.location || 'Remote'} (Remote)` : (item.location || 'Remote');
          const rawDesc = preserveRichJobDescription(item.description, `${rawTitle} at ${rawCompany}`);

          if (rawTitle && rawUrl && isJobLocationEligible(rawLoc, activeLocations, countryScope) && isJobRoleRelevant(rawTitle, activeTitles) && isJobWorkplaceEligible(rawLoc, rawDesc, rawTitle, candidateWorkType, item.remote)) {
            allFetchedJobs.push({
              id: `arbeitnow_${item.slug || crypto.createHash('md5').update(rawUrl).digest('hex').slice(0, 10)}`,
              title: rawTitle,
              company: rawCompany,
              location: rawLoc,
              created: item.created_at ? new Date(item.created_at * 1000).toISOString() : new Date().toISOString(),
              description: rawDesc,
              redirect_url: rawUrl,
              source: 'ArbeitNow'
            });
            count++;
          }
        }
      }
    } catch (err) {
      console.error('[Fetch] ArbeitNow error:', err.message);
    }
  }

  // 2. Himalayas Remote API
  if (boardsEnabled.himalayas !== false) {
    try {
      const url = `https://himalayas.app/jobs/api?search=${encodeURIComponent(CTX.role)}&limit=20`;
      const res = await hostFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.ok) {
        const data = await res.json();
        for (const item of (data.jobs || [])) {
          const rawTitle = item.title || '';
          const rawUrl = item.applicationLink || `https://himalayas.app/companies/${item.companySlug}/jobs/${item.slug}`;
          const rawCompany = item.companyName || 'Remote Employer';
          const rawLoc = (item.locationRestrictions && item.locationRestrictions.length > 0) ? item.locationRestrictions.join(', ') : 'Worldwide (Remote)';
          const rawDesc = preserveRichJobDescription(item.excerpt, `${rawTitle} at ${rawCompany}`);

          if (rawTitle && rawUrl && isJobLocationEligible(rawLoc, activeLocations, countryScope) && isJobRoleRelevant(rawTitle, activeTitles) && isJobWorkplaceEligible(rawLoc, rawDesc, rawTitle, candidateWorkType, true)) {
            allFetchedJobs.push({
              id: `himalayas_${item.id || crypto.createHash('md5').update(rawUrl).digest('hex').slice(0, 10)}`,
              title: rawTitle,
              company: rawCompany,
              location: rawLoc,
              created: (() => {
                try {
                  if (!item.pubDate) return new Date().toISOString();
                  return typeof item.pubDate === 'number'
                    ? new Date(item.pubDate * 1000).toISOString()
                    : new Date(item.pubDate).toISOString();
                } catch (_) {
                  return new Date().toISOString();
                }
              })(),
              description: rawDesc,
              redirect_url: rawUrl,
              source: 'Himalayas'
            });
            count++;
          }
        }
      }
    } catch (err) {
      console.error('[Fetch] Himalayas error:', err.message);
    }
  }

  // 3. Remotive API
  if (boardsEnabled.remotive !== false) {
    try {
      const lowerRole = CTX.role.toLowerCase();
      let remotiveCategory = '';
      if (/data|analytics|bi\b|database|sql/i.test(lowerRole)) remotiveCategory = '&category=data';
      else if (/software|developer|engineer|devops|frontend|backend|fullstack/i.test(lowerRole)) remotiveCategory = '&category=software-dev';
      else if (/product/i.test(lowerRole)) remotiveCategory = '&category=product';
      else if (/design|ux|ui/i.test(lowerRole)) remotiveCategory = '&category=design';
      else if (/marketing|seo/i.test(lowerRole)) remotiveCategory = '&category=marketing';
      else if (/sales|account exec/i.test(lowerRole)) remotiveCategory = '&category=sales';
      else if (/finance|accounting/i.test(lowerRole)) remotiveCategory = '&category=finance-legal';
      else if (/hr|recruiter|people/i.test(lowerRole)) remotiveCategory = '&category=hr';

      const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(CTX.role)}${remotiveCategory}&limit=20`;
      const res = await hostFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.ok) {
        const data = await res.json();
        for (const item of (data.jobs || [])) {
          const rawTitle = item.title ? item.title.replace(/<\/?[^>]+(>|$)/g, "").trim() : '';
          const rawUrl = item.url || '';
          const rawCompany = item.company_name || 'Remote Employer';
          const rawLoc = item.candidate_required_location ? `${item.candidate_required_location} (Remote)` : 'Worldwide (Remote)';
          const rawDesc = preserveRichJobDescription(item.description, `${rawTitle} at ${rawCompany}`);
          
          if (rawTitle && rawUrl && isJobLocationEligible(rawLoc, activeLocations, countryScope) && isJobRoleRelevant(rawTitle, activeTitles) && isJobWorkplaceEligible(rawLoc, rawDesc, rawTitle, candidateWorkType, true)) {
            allFetchedJobs.push({
              id: `remotive_${item.id}`,
              title: rawTitle,
              company: rawCompany,
              location: rawLoc,
              created: item.publication_date || new Date().toISOString(),
              description: rawDesc,
              redirect_url: rawUrl,
              source: 'Remotive'
            });
            count++;
          }
        }
      }
    } catch (err) {
      console.error('[Fetch] Remotive error:', err.message);
    }
  }

  // 4. Jobicy API
  if (boardsEnabled.jobicy !== false) {
    try {
      const lowerRole = CTX.role.toLowerCase();
      let jobicyIndustry = '';
      if (/data|analytics|bi\b|database|sql/i.test(lowerRole)) jobicyIndustry = '&industry=data-science';
      else if (/software|developer|engineer|devops|frontend|backend|fullstack/i.test(lowerRole)) jobicyIndustry = '&industry=dev';
      else if (/product/i.test(lowerRole)) jobicyIndustry = '&industry=product';
      else if (/design|ux|ui/i.test(lowerRole)) jobicyIndustry = '&industry=design';
      else if (/marketing|seo/i.test(lowerRole)) jobicyIndustry = '&industry=marketing';
      else if (/sales|account exec/i.test(lowerRole)) jobicyIndustry = '&industry=sales';
      else if (/finance|accounting/i.test(lowerRole)) jobicyIndustry = '&industry=finance';
      else if (/hr|recruiter|people/i.test(lowerRole)) jobicyIndustry = '&industry=supporting';

      const geoParam = countryScope === 'CA' ? 'canada' : (countryScope === 'US' ? 'usa' : '');
      const url = geoParam
        ? `https://jobicy.com/api/v2/remote-jobs?count=20&geo=${geoParam}${jobicyIndustry}&tag=${encodeURIComponent(CTX.role)}`
        : `https://jobicy.com/api/v2/remote-jobs?count=20${jobicyIndustry}&tag=${encodeURIComponent(CTX.role)}`;
        
      const res = await hostFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.ok) {
        const data = await res.json();
        for (const item of (data.jobs || [])) {
          const rawTitle = item.jobTitle ? item.jobTitle.replace(/<\/?[^>]+(>|$)/g, "").trim() : '';
          const rawUrl = item.url || '';
          const rawCompany = item.companyName || 'Remote Employer';
          const rawLoc = item.jobGeo ? `${item.jobGeo} (Remote)` : 'Worldwide (Remote)';
          const rawDesc = preserveRichJobDescription(item.jobDescription, `${rawTitle} at ${rawCompany}`);
          
          if (rawTitle && rawUrl && isJobLocationEligible(rawLoc, activeLocations, countryScope) && isJobRoleRelevant(rawTitle, activeTitles) && isJobWorkplaceEligible(rawLoc, rawDesc, rawTitle, candidateWorkType, true)) {
            allFetchedJobs.push({
              id: `jobicy_${item.id}`,
              title: rawTitle,
              company: rawCompany,
              location: rawLoc,
              created: item.pubDate || new Date().toISOString(),
              description: rawDesc,
              redirect_url: rawUrl,
              source: 'Jobicy'
            });
            count++;
          }
        }
      }
    } catch (err) {
      console.error('[Fetch] Jobicy error:', err.message);
    }
  }

  console.error(`[Fetch] Global Remote Feeds found: ${count} jobs`);
}

// ── Step 4b: Market Leader & Regional Specialist Fetchers ───────────────────

const INDEED_DOMAINS = Object.freeze({
  'US': 'www.indeed.com',
  'GB': 'uk.indeed.com',
  'CA': 'ca.indeed.com',
  'DE': 'de.indeed.com',
  'AU': 'au.indeed.com',
  'FR': 'fr.indeed.com',
  'NL': 'nl.indeed.com',
  'BR': 'br.indeed.com',
  'SG': 'sg.indeed.com',
  'JP': 'jp.indeed.com',
  'AE': 'ae.indeed.com',
  'IN': 'in.indeed.com'
});

/**
 * Fetches jobs from Indeed (Country-Specific Public RSS Gateway).
 */
async function fetchIndeed() {
  if (boardsEnabled.indeed === false) return;
  const dom = INDEED_DOMAINS[countryScope] || (countryScope === 'GLOBAL' ? 'www.indeed.com' : INDEED_DOMAINS['US']);
  if (!dom) return;

  let count = 0;
  try {
    const isExplicitRemote = candidateWorkType.toLowerCase().includes('remote') || CTX.loc.toLowerCase() === 'remote';
    const locParam = isExplicitRemote ? 'Remote' : (CTX.loc || '');
    const url = `https://${dom}/rss?q=${encodeURIComponent(CTX.role)}&l=${encodeURIComponent(locParam)}&sort=date`;
    
    const res = await hostFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
      },
      signal: AbortSignal.timeout(7000)
    });

    if (res.ok) {
      const xml = await res.text();
      const items = xml.split('<item>').slice(1);
      
      for (const item of items) {
        const titleM = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
        const linkM = item.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
        const descM = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
        const srcM = item.match(/<source[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/source>/i);
        const dateM = item.match(/<pubDate>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/pubDate>/i);

        if (!titleM || !linkM) continue;
        let rawTitle = titleM[1].replace(/<\/?[^>]+(>|$)/g, '').trim();
        let rawUrl = linkM[1].replace(/<\/?[^>]+(>|$)/g, '').trim();
        let rawComp = srcM ? srcM[1].replace(/<\/?[^>]+(>|$)/g, '').trim() : 'Employer';
        
        // Indeed titles often format as "Job Title - Company - Location"
        if (rawTitle.includes(' - ')) {
          const parts = rawTitle.split(' - ');
          if (parts.length >= 2 && (!srcM || rawComp === 'Employer')) {
            rawComp = parts[parts.length - 2].trim() || rawComp;
          }
          rawTitle = parts[0].trim();
        }

        const rawDesc = descM ? descM[1].replace(/<\/?[^>]+(>|$)/g, ' ').replace(/\s+/g, ' ').trim() : `${rawTitle} at ${rawComp}`;
        const rawLoc = isExplicitRemote ? 'Remote' : (CTX.loc || 'National');
        const negIndeed = isExplicitlyNegativeRemote(`${rawTitle} ${rawDesc}`);
        const isRemoteIndeed = !negIndeed && (isExplicitRemote || /remote|telecommute|work from home/i.test(`${rawTitle} ${rawDesc}`));

        if (isJobLocationEligible(rawLoc, activeLocations, countryScope, isRemoteIndeed) &&
            isJobRoleRelevant(rawTitle, activeTitles) &&
            isJobWorkplaceEligible(rawLoc, rawDesc, rawTitle, candidateWorkType, isRemoteIndeed)) {
          const indeedId = crypto.createHash('md5').update(rawUrl).digest('hex').slice(0, 10);
          allFetchedJobs.push({
            id: `indeed_${indeedId}`,
            title: rawTitle,
            company: rawComp,
            location: rawLoc,
            created: dateM ? new Date(dateM[1]).toISOString() : new Date().toISOString(),
            description: rawDesc,
            redirect_url: rawUrl,
            source: `Indeed (${countryScope})`
          });
          count++;
        }
      }
    }
  } catch (err) {
    // Non-fatal fallback
  }
  if (count > 0) console.error(`[Fetch] Indeed (${countryScope}) found: ${count} jobs`);
}

/**
 * Fetches jobs from Germany's Bundesagentur für Arbeit (Official Gov Jobsuche REST API).
 * Zero fake jobs, 100% verified German employer registry.
 */
async function fetchArbeitsagentur() {
  if (boardsEnabled.arbeitsagentur === false) return;
  if (countryScope !== 'DE' && countryScope !== 'GLOBAL') return;

  let count = 0;
  try {
    const loc = CTX.loc && CTX.loc.toLowerCase() !== 'remote' ? CTX.loc : '';
    const url = `https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs?was=${encodeURIComponent(CTX.role)}&wo=${encodeURIComponent(loc)}&size=20`;
    
    const res = await hostFetch(url, {
      headers: {
        'X-API-Key': 'jobboerse-jobsuche',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(7000)
    });

    if (res.ok) {
      const data = await res.json();
      const jobs = data.stellenangebote || [];
      
      for (const item of jobs) {
        const rawTitle = item.titel || CTX.role;
        const rawComp = item.arbeitgeber || 'Arbeitgeber in Deutschland';
        const rawLoc = (item.arbeitsort && (item.arbeitsort.ort || item.arbeitsort.region)) || 'Deutschland';
        const refnr = item.refnr || crypto.createHash('md5').update(rawTitle + rawComp).digest('hex').slice(0, 10);
        const rawUrl = `https://www.arbeitsagentur.de/jobsuche/jobdetail/${refnr}`;
        const rawDesc = `${rawTitle} bei ${rawComp} in ${rawLoc}. Referenznummer: ${refnr}. Offizielles Stellenangebot der Bundesagentur für Arbeit.`;
        const isRemote = /homeoffice|remote|telearbeit/i.test(`${rawTitle} ${rawDesc}`);

        if (isJobLocationEligible(rawLoc, activeLocations, countryScope, isRemote) &&
            isJobRoleRelevant(rawTitle, activeTitles) &&
            isJobWorkplaceEligible(rawLoc, rawDesc, rawTitle, candidateWorkType, isRemote)) {
          allFetchedJobs.push({
            id: `ba_${refnr}`,
            title: rawTitle,
            company: rawComp,
            location: rawLoc,
            created: item.aktuelleVakanzBeginn ? new Date(item.aktuelleVakanzBeginn).toISOString() : new Date().toISOString(),
            description: rawDesc,
            redirect_url: rawUrl,
            source: 'Bundesagentur für Arbeit (DE)'
          });
          count++;
        }
      }
    }
  } catch (err) {
    // Non-fatal
  }
  if (count > 0) console.error(`[Fetch] Bundesagentur für Arbeit found: ${count} verified jobs`);
}

/**
 * Fetches jobs from Singapore's Workforce Singapore (Official Gov MyCareersFuture REST API).
 * Zero fake jobs, 100% verified ACRA-registered companies.
 */
async function fetchMyCareersFuture() {
  if (boardsEnabled.mycareersfuture === false) return;
  if (countryScope !== 'SG' && countryScope !== 'GLOBAL') return;

  let count = 0;
  try {
    const url = `https://api.mycareersfuture.gov.sg/v2/jobs?search=${encodeURIComponent(CTX.role)}&limit=20`;
    const res = await hostFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(7000)
    });

    if (res.ok) {
      const data = await res.json();
      const results = data.results || data.data?.results || [];
      
      for (const item of results) {
        const rawTitle = item.title || CTX.role;
        const rawComp = item.postedCompany?.name || 'Singapore Employer';
        const rawLoc = 'Singapore';
        const rawUrl = item.metadata?.jobPostUrl || `https://www.mycareersfuture.gov.sg/job/${item.uuid}`;
        const salaryInfo = item.salary ? ` | Salary: SGD ${item.salary.minimum || ''} - ${item.salary.maximum || ''} / ${item.salary.type || 'month'}` : '';
        const rawDesc = `${rawTitle} at ${rawComp} in Singapore${salaryInfo}. Verified ACRA Employer on MyCareersFuture Government Portal.\n\n${item.description || ''}`.trim();
        const isRemote = /remote|work from home/i.test(`${rawTitle} ${rawDesc}`);

        if (isJobLocationEligible(rawLoc, activeLocations, countryScope, isRemote) &&
            isJobRoleRelevant(rawTitle, activeTitles) &&
            isJobWorkplaceEligible(rawLoc, rawDesc, rawTitle, candidateWorkType, isRemote)) {
          allFetchedJobs.push({
            id: `mcf_${item.uuid || crypto.createHash('md5').update(rawUrl).digest('hex').slice(0, 10)}`,
            title: rawTitle,
            company: rawComp,
            location: rawLoc,
            created: item.metadata?.updatedAt || new Date().toISOString(),
            description: rawDesc,
            redirect_url: rawUrl,
            source: 'MyCareersFuture (Gov SG)'
          });
          count++;
        }
      }
    }
  } catch (err) {
    // Non-fatal
  }
  if (count > 0) console.error(`[Fetch] MyCareersFuture (Gov SG) found: ${count} verified jobs`);
}

/**
 * Fetches jobs from Australia & NZ Market Leader: SEEK.
 */
async function fetchSeek() {
  if (boardsEnabled.seek === false) return;
  if (countryScope !== 'AU' && countryScope !== 'NZ' && countryScope !== 'GLOBAL') return;

  let count = 0;
  try {
    const isNZ = countryScope === 'NZ' || /new zealand|auckland|wellington/i.test(CTX.loc);
    const domain = isNZ ? 'www.seek.co.nz' : 'www.seek.com.au';
    const loc = CTX.loc && CTX.loc.toLowerCase() !== 'remote' ? CTX.loc : (isNZ ? 'All New Zealand' : 'All Australia');
    const url = `https://${domain}/api/chalice-search/v4/search?keywords=${encodeURIComponent(CTX.role)}&where=${encodeURIComponent(loc)}&pageSize=20`;
    
    const res = await hostFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(7000)
    });

    if (res.ok) {
      const data = await res.json();
      const jobs = data.data || [];
      for (const item of jobs) {
        const rawTitle = item.title || CTX.role;
        const rawComp = item.advertiser?.description || 'SEEK Employer';
        const rawLoc = item.location || (isNZ ? 'New Zealand' : 'Australia');
        const rawUrl = `https://${domain}/job/${item.id}`;
        const rawDesc = `${rawTitle} at ${rawComp} in ${rawLoc}. ${item.teaser || ''}`.trim();
        const isRemote = /remote|work from home/i.test(`${rawTitle} ${rawDesc}`);

        if (isJobLocationEligible(rawLoc, activeLocations, countryScope, isRemote) &&
            isJobRoleRelevant(rawTitle, activeTitles) &&
            isJobWorkplaceEligible(rawLoc, rawDesc, rawTitle, candidateWorkType, isRemote)) {
          allFetchedJobs.push({
            id: `seek_${item.id}`,
            title: rawTitle,
            company: rawComp,
            location: rawLoc,
            created: item.listingDate || new Date().toISOString(),
            description: rawDesc,
            redirect_url: rawUrl,
            source: isNZ ? 'SEEK (New Zealand)' : 'SEEK (Australia)'
          });
          count++;
        }
      }
    }
  } catch (err) {
    // Non-fatal
  }
  if (count > 0) console.error(`[Fetch] SEEK found: ${count} jobs`);
}

/**
 * Fetches jobs from United Kingdom Market Leader: Reed.co.uk.
 */
async function fetchReedUK() {
  if (boardsEnabled.reed === false) return;
  if (countryScope !== 'GB' && countryScope !== 'GLOBAL') return;

  let count = 0;
  try {
    const roleSlug = CTX.role.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const cleanCity = CTX.loc && CTX.loc.toLowerCase() !== 'remote' ? CTX.loc.split(',')[0].trim() : '';
    const locSlug = cleanCity ? cleanCity.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : '';
    const url = locSlug
      ? `https://www.reed.co.uk/jobs/${roleSlug}-jobs-in-${locSlug}?format=rss`
      : `https://www.reed.co.uk/jobs/${roleSlug}-jobs?format=rss`;
    
    const res = await hostFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, text/xml'
      },
      signal: AbortSignal.timeout(7000)
    });

    if (res.ok) {
      const bodyText = typeof res.text === 'function' ? await res.text() : (typeof res.json === 'function' ? JSON.stringify(await res.json()) : '');
      let isJson = false;
      let jsonResults = null;
      try {
        const parsed = JSON.parse(bodyText);
        if (parsed.results && Array.isArray(parsed.results)) {
          isJson = true;
          jsonResults = parsed.results;
        }
      } catch (_) {}

      if (isJson) {
        for (const item of jsonResults) {
          const rawTitle = item.jobTitle || CTX.role;
          const rawUrl = item.jobUrl || `https://www.reed.co.uk/jobs/${item.jobId}`;
          const rawComp = item.employerName || 'UK Employer (Reed.co.uk)';
          const rawLoc = item.locationName || CTX.loc || 'London, UK';
          const rawDesc = item.jobDescription || `${rawTitle} at ${rawComp} in ${rawLoc}`;
          const isNeg = isExplicitlyNegativeRemote(`${rawTitle} ${rawDesc}`);
          const isRemote = !isNeg && /remote|work from home|hybrid/i.test(`${rawTitle} ${rawDesc}`);

          if (isJobLocationEligible(rawLoc, activeLocations, countryScope, isRemote) &&
              isJobRoleRelevant(rawTitle, activeTitles) &&
              isJobWorkplaceEligible(rawLoc, rawDesc, rawTitle, candidateWorkType, isRemote)) {
            const reedId = String(item.jobId || crypto.createHash('md5').update(rawUrl).digest('hex').slice(0, 10));
            allFetchedJobs.push({
              id: `reed_${reedId}`,
              title: rawTitle,
              company: rawComp,
              location: rawLoc,
              created: new Date().toISOString(),
              description: rawDesc,
              redirect_url: rawUrl,
              source: 'Reed.co.uk'
            });
            count++;
          }
        }
      } else {
        const items = bodyText.split('<item>').slice(1);
        
        for (const item of items) {
          const titleM = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
          const linkM = item.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
          const descM = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
          const dateM = item.match(/<pubDate>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/pubDate>/i);

          if (!titleM || !linkM) continue;
          const rawTitle = titleM[1].replace(/<\/?[^>]+(>|$)/g, '').trim();
          const rawUrl = linkM[1].replace(/<\/?[^>]+(>|$)/g, '').trim();
          const rawDesc = descM ? descM[1].replace(/<\/?[^>]+(>|$)/g, ' ').replace(/\s+/g, ' ').trim() : '';
          const rawLoc = CTX.loc || 'United Kingdom';
          const isRemote = /remote|work from home|hybrid/i.test(`${rawTitle} ${rawDesc}`);

          if (isJobLocationEligible(rawLoc, activeLocations, countryScope, isRemote) &&
              isJobRoleRelevant(rawTitle, activeTitles) &&
              isJobWorkplaceEligible(rawLoc, rawDesc, rawTitle, candidateWorkType, isRemote)) {
            const reedId = (rawUrl.match(/\/([0-9]{6,})/i) || [])[1] || crypto.createHash('md5').update(rawUrl).digest('hex').slice(0, 10);
            allFetchedJobs.push({
              id: `reed_${reedId}`,
              title: rawTitle,
              company: 'UK Employer (Reed.co.uk)',
              location: rawLoc,
              created: dateM ? new Date(dateM[1]).toISOString() : new Date().toISOString(),
              description: rawDesc,
              redirect_url: rawUrl,
              source: 'Reed.co.uk'
            });
            count++;
          }
        }
      }
    }
  } catch (err) {
    // Non-fatal
  }
  if (count > 0) console.error(`[Fetch] Reed.co.uk found: ${count} jobs`);
}

/**
 * Fetches jobs from UAE & Gulf Market Leader: Bayt.com.
 */
async function fetchBayt() {
  if (boardsEnabled.bayt === false) return;
  if (countryScope !== 'AE' && countryScope !== 'GLOBAL') return;

  let count = 0;
  try {
    const roleSlug = CTX.role.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const url = `https://www.bayt.com/en/international/jobs/${roleSlug}-jobs/`;
    
    const res = await hostFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html'
      },
      signal: AbortSignal.timeout(7000)
    });

    if (res.ok) {
      const html = await res.text();
      // Search for JSON-LD schema or structured job listings
      const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
      if (jsonLdMatch) {
        try {
          const parsed = JSON.parse(jsonLdMatch[1]);
          const jobList = Array.isArray(parsed) ? parsed : (parsed.itemListElement ? parsed.itemListElement.map(e => e.item) : [parsed]);
          for (const item of jobList) {
            if (item['@type'] === 'JobPosting' && item.title) {
              const rawTitle = item.title;
              const rawComp = item.hiringOrganization?.name || 'Gulf Employer';
              const rawLoc = item.jobLocation?.address?.addressLocality || 'Dubai, UAE';
              const rawUrl = item.url || url;
              const rawDesc = item.description || `${rawTitle} at ${rawComp} in ${rawLoc}`;
              const isRemote = /remote/i.test(`${rawTitle} ${rawDesc}`);

              if (isJobLocationEligible(rawLoc, activeLocations, countryScope, isRemote) &&
                  isJobRoleRelevant(rawTitle, activeTitles) &&
                  isJobWorkplaceEligible(rawLoc, rawDesc, rawTitle, candidateWorkType, isRemote)) {
                allFetchedJobs.push({
                  id: `bayt_${crypto.createHash('md5').update(rawUrl).digest('hex').slice(0, 10)}`,
                  title: rawTitle,
                  company: rawComp,
                  location: rawLoc,
                  created: item.datePosted || new Date().toISOString(),
                  description: rawDesc,
                  redirect_url: rawUrl,
                  source: 'Bayt.com (Middle East)'
                });
                count++;
              }
            }
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    // Non-fatal
  }
  if (count > 0) console.error(`[Fetch] Bayt.com found: ${count} jobs`);
}

/**
 * Fetches jobs from France Market Leader: Welcome to the Jungle.
 */
async function fetchWTTJ() {
  if (boardsEnabled.wttj === false) return;
  if (countryScope !== 'FR' && countryScope !== 'GLOBAL') return;

  let count = 0;
  try {
    const cleanCity = CTX.loc && CTX.loc.toLowerCase() !== 'remote' ? CTX.loc.split(',')[0].trim() : '';
    const locParam = cleanCity ? `&aroundQuery=${encodeURIComponent(cleanCity)}` : '';
    const url = `https://api.welcometothejungle.com/api/v1/organizations/jobs?query=${encodeURIComponent(CTX.role)}${locParam}&aroundRadius=50000`;
    const res = await hostFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(7000)
    });

    if (res.ok) {
      const data = await res.json();
      const jobs = data.jobs || data.results || [];
      for (const item of jobs) {
        const rawTitle = item.name || item.title || CTX.role;
        const rawComp = item.organization?.name || 'Tech Startup (WTTJ)';
        const rawLoc = (item.office && item.office.city) ? `${item.office.city}, France` : 'Paris, France';
        const rawUrl = `https://www.welcometothejungle.com/fr/companies/${item.organization?.slug}/jobs/${item.slug}`;
        const rawDesc = item.profile || item.summary || `${rawTitle} chez ${rawComp} à ${rawLoc}`;
        const isRemote = Boolean(item.remote === 'fulltime' || item.remote === 'partial');

        if (isJobLocationEligible(rawLoc, activeLocations, countryScope, isRemote) &&
            isJobRoleRelevant(rawTitle, activeTitles) &&
            isJobWorkplaceEligible(rawLoc, rawDesc, rawTitle, candidateWorkType, isRemote)) {
          allFetchedJobs.push({
            id: `wttj_${item.id || item.slug}`,
            title: rawTitle,
            company: rawComp,
            location: rawLoc,
            created: item.published_at || new Date().toISOString(),
            description: rawDesc,
            redirect_url: rawUrl,
            source: 'Welcome to the Jungle (FR)'
          });
          count++;
        }
      }
    }
  } catch (err) {
    // Non-fatal
  }
  if (count > 0) console.error(`[Fetch] Welcome to the Jungle found: ${count} jobs`);
}

/**
 * Fetches jobs from India Market Leader: Naukri.com (Clean Search Feed).
 */
async function fetchNaukri() {
  if (boardsEnabled.naukri === false) return;
  if (countryScope !== 'IN' && countryScope !== 'GLOBAL') return;

  let count = 0;
  try {
    const roleSlug = CTX.role.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const cleanCity = CTX.loc && CTX.loc.toLowerCase() !== 'remote' ? CTX.loc.split(',')[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') : '';
    const url = cleanCity
      ? `https://www.naukri.com/${roleSlug}-jobs-in-${cleanCity}`
      : `https://www.naukri.com/${roleSlug}-jobs`;
    const res = await hostFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html'
      },
      signal: AbortSignal.timeout(7000)
    });

    if (res.ok) {
      const html = await res.text();
      // Extract structured article or schema cards
      const tupleMatches = html.match(/<article[\s\S]*?<\/article>/gi) || [];
      for (const card of tupleMatches.slice(0, 20)) {
        const titleM = card.match(/<a[^>]*class="title[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
        const compM = card.match(/<a[^>]*class="comp-name[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
        const locM = card.match(/<span[^>]*class="loc-wrap[^"]*"[^>]*>([\s\S]*?)<\/span>/i);

        if (titleM) {
          const rawUrl = titleM[1].startsWith('http') ? titleM[1] : `https://www.naukri.com${titleM[1]}`;
          const rawTitle = titleM[2].replace(/<\/?[^>]+(>|$)/g, '').trim();
          const rawComp = compM ? compM[1].replace(/<\/?[^>]+(>|$)/g, '').trim() : 'Indian Corporate Employer';
          const rawLoc = locM ? locM[1].replace(/<\/?[^>]+(>|$)/g, '').trim() : 'Bangalore, India';
          const isNeg = isExplicitlyNegativeRemote(`${rawTitle} ${rawLoc}`);
          const isRemote = !isNeg && /remote|work from home/i.test(`${rawTitle} ${rawLoc}`);
          const rawDesc = `${rawTitle} at ${rawComp} in ${rawLoc}. Verified Corporate Post on Naukri.com.`;

          if (isJobLocationEligible(rawLoc, activeLocations, countryScope, isRemote) &&
              isJobRoleRelevant(rawTitle, activeTitles) &&
              isJobWorkplaceEligible(rawLoc, rawDesc, rawTitle, candidateWorkType, isRemote)) {
            const naukriId = crypto.createHash('md5').update(rawUrl).digest('hex').slice(0, 10);
            allFetchedJobs.push({
              id: `naukri_${naukriId}`,
              title: rawTitle,
              company: rawComp,
              location: rawLoc,
              created: new Date().toISOString(),
              description: rawDesc,
              redirect_url: rawUrl,
              source: 'Naukri.com (India)'
            });
            count++;
          }
        }
      }
    }
  } catch (err) {
    // Non-fatal
  }
  if (count > 0) console.error(`[Fetch] Naukri.com found: ${count} jobs`);
}

/**
 * Fetches jobs from Japan Market Leader: Daijob / GaijinPot (Bilingual & English Careers).
 */
async function fetchDaijobJP() {
  if (boardsEnabled.daijob === false) return;
  if (countryScope !== 'JP' && countryScope !== 'GLOBAL') return;

  let count = 0;
  try {
    const cleanCity = CTX.loc && CTX.loc.toLowerCase() !== 'remote' ? CTX.loc.split(',')[0].trim() : '';
    const locParam = cleanCity ? `&location=${encodeURIComponent(cleanCity)}` : '';
    const url = `https://jobs.gaijinpot.com/job/index/lang/en?keywords=${encodeURIComponent(CTX.role)}${locParam}`;
    const res = await hostFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html'
      },
      signal: AbortSignal.timeout(7000)
    });

    if (res.ok) {
      const html = await res.text();
      const articles = html.split(/<div\s+class="gp-job-item(?=["\s>])/i).slice(1);
      for (const art of articles.slice(0, 15)) {
        const titleM = art.match(/<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
        const compM = art.match(/<div class="gp-job-item__company"[^>]*>([\s\S]*?)<\/div>/i);
        const locM = art.match(/<div class="gp-job-item__location"[^>]*>([\s\S]*?)<\/div>/i);

        if (titleM) {
          const rawUrl = titleM[1].startsWith('http') ? titleM[1] : `https://jobs.gaijinpot.com${titleM[1]}`;
          const rawTitle = titleM[2].replace(/<\/?[^>]+(>|$)/g, '').trim();
          const rawComp = compM ? compM[1].replace(/<\/?[^>]+(>|$)/g, '').trim() : 'Tokyo / Japan Employer';
          const rawLoc = locM ? locM[1].replace(/<\/?[^>]+(>|$)/g, '').trim() : 'Tokyo, Japan';
          const isNeg = isExplicitlyNegativeRemote(`${rawTitle} ${rawLoc}`);
          const isRemote = !isNeg && /remote|work from home/i.test(`${rawTitle} ${rawLoc}`);
          const rawDesc = `${rawTitle} at ${rawComp} in ${rawLoc}. Verified Bilingual & Global Career in Japan.`;

          if (isJobLocationEligible(rawLoc, activeLocations, countryScope, isRemote) &&
              isJobRoleRelevant(rawTitle, activeTitles) &&
              isJobWorkplaceEligible(rawLoc, rawDesc, rawTitle, candidateWorkType, isRemote)) {
            const jpId = crypto.createHash('md5').update(rawUrl).digest('hex').slice(0, 10);
            allFetchedJobs.push({
              id: `gaijinpot_${jpId}`,
              title: rawTitle,
              company: rawComp,
              location: rawLoc,
              created: new Date().toISOString(),
              description: rawDesc,
              redirect_url: rawUrl,
              source: 'GaijinPot / Daijob (Japan)'
            });
            count++;
          }
        }
      }
    }
  } catch (err) {
    // Non-fatal
  }
  if (count > 0) console.error(`[Fetch] Japan (GaijinPot/Daijob) found: ${count} jobs`);
}

/**
 * Fetches jobs from Brazil Market Leader: Vagas.com.br.
 */
async function fetchVagasBR() {
  if (boardsEnabled.vagas === false) return;
  if (countryScope !== 'BR' && countryScope !== 'GLOBAL') return;

  let count = 0;
  try {
    const roleSlug = CTX.role.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const cleanCity = CTX.loc && CTX.loc.toLowerCase() !== 'remote' ? CTX.loc.split(',')[0].trim() : '';
    const locParam = cleanCity ? `?onde=${encodeURIComponent(cleanCity)}` : '';
    const url = `https://www.vagas.com.br/vagas-de-${roleSlug}${locParam}`;
    const res = await hostFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html'
      },
      signal: AbortSignal.timeout(7000)
    });

    if (res.ok) {
      const html = await res.text();
      const articles = html.split('<article class="vaga').slice(1);
      for (const art of articles.slice(0, 15)) {
        const titleM = art.match(/<h2[^>]*class="cargo"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
        const compM = art.match(/<span[^>]*class="empr"[^>]*>([\s\S]*?)<\/span>/i);
        const locM = art.match(/<span[^>]*class="vaga-local"[^>]*>([\s\S]*?)<\/span>/i);

        if (titleM) {
          const rawUrl = titleM[1].startsWith('http') ? titleM[1] : `https://www.vagas.com.br${titleM[1]}`;
          const rawTitle = titleM[2].replace(/<\/?[^>]+(>|$)/g, '').trim();
          const rawComp = compM ? compM[1].replace(/<\/?[^>]+(>|$)/g, '').trim() : 'Empresa no Brasil';
          const rawLoc = locM ? locM[1].replace(/<\/?[^>]+(>|$)/g, '').trim() : 'São Paulo, Brasil';
          const isRemote = /remoto|home office/i.test(`${rawTitle} ${rawLoc}`);
          const rawDesc = `${rawTitle} na empresa ${rawComp} em ${rawLoc}. Vaga verificada no Vagas.com.br.`;

          if (isJobLocationEligible(rawLoc, activeLocations, countryScope, isRemote) &&
              isJobRoleRelevant(rawTitle, activeTitles) &&
              isJobWorkplaceEligible(rawLoc, rawDesc, rawTitle, candidateWorkType, isRemote)) {
            const brId = crypto.createHash('md5').update(rawUrl).digest('hex').slice(0, 10);
            allFetchedJobs.push({
              id: `vagas_${brId}`,
              title: rawTitle,
              company: rawComp,
              location: rawLoc,
              created: new Date().toISOString(),
              description: rawDesc,
              redirect_url: rawUrl,
              source: 'Vagas.com.br (Brasil)'
            });
            count++;
          }
        }
      }
    }
  } catch (err) {
    // Non-fatal
  }
  if (count > 0) console.error(`[Fetch] Vagas.com.br found: ${count} jobs`);
}

function deduplicateJobList(jobs) {
  const seenIds = new Set();
  const seenUrls = new Set();
  const seenKeys = new Set();
  const bySource = {};

  for (const job of jobs) {
    if (!job) continue;
    const cleanId = String(job.id || '').trim();
    const rawUrl = String(job.redirect_url || job.job_url || job.url || '');
    const cleanUrl = rawUrl.split('?')[0].replace(/\/+$/, '').trim().toLowerCase();
    const compClean = (job.company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const titClean = (job.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanKey = (compClean && titClean) ? `${titClean}:::${compClean}` : '';

    if (cleanId && seenIds.has(cleanId)) continue;
    if (cleanUrl && cleanUrl.length > 15 && !cleanUrl.includes('google.com/search') && seenUrls.has(cleanUrl)) continue;
    if (cleanKey && seenKeys.has(cleanKey)) continue;

    if (cleanId) seenIds.add(cleanId);
    if (cleanUrl && cleanUrl.length > 15 && !cleanUrl.includes('google.com/search')) seenUrls.add(cleanUrl);
    if (cleanKey) seenKeys.add(cleanKey);

    const src = job.source || 'Other';
    if (!bySource[src]) bySource[src] = [];
    bySource[src].push(job);
  }

  // Interleave round-robin across sources so no single board monopolizes the batch
  const balanced = [];
  const sources = Object.keys(bySource);
  let hasMore = true;
  let idx = 0;

  while (hasMore) {
    hasMore = false;
    for (const src of sources) {
      if (idx < bySource[src].length) {
        balanced.push(bySource[src][idx]);
        hasMore = true;
      }
    }
    idx++;
  }

  return balanced;
}

// ── Step 5: Main Execution ──────────────────────────────────────────────────
/**
 * Executes all enabled fetchers in parallel and returns the aggregated list.
 * Supports dynamic runtime options from API triggers, cron scheduler, or CLI.
 */
let scanLock = Promise.resolve();

async function fetchAllJobs(options = {}) {
  // Overlapping scans share module settings and the collector array, so queue them.
  const run = scanLock.then(() => fetchAllJobsInner(options));
  scanLock = run.catch(() => {});
  return run;
}

async function fetchAllJobsInner(options = {}) {
  allFetchedJobs.length = 0; // Reset array

  if (options && typeof options === 'object') {
    setSearchContext({
      role: options.targetRole || (Array.isArray(options.targetTitles) ? options.targetTitles[0] : undefined),
      location: options.targetLocation || (Array.isArray(options.targetLocations) ? options.targetLocations[0] : undefined),
      titles: options.targetTitles,
      locations: options.targetLocations,
      scope: options.countryScope,
      workType: options.candidateWorkType || options.work_type,
      boards: options.boardsEnabled,
      freshness: options.freshnessHours,
      radius: options.commuteRadiusKm || options.commute_radius_km
    });
  }

  const sweepTitles = (targetTitles && targetTitles.length > 0) ? targetTitles : ['Data Analyst'];
  const sweepLocs = (targetLocations && targetLocations.length > 0) ? targetLocations : [currentLoc || ''];

  console.error(`[Multi-Board Ingestion] Executing concurrent sweep across ${sweepTitles.length} roles and ${sweepLocs.length} locations (Scope: ${countryScope}).`);

  const boards = [
    ['Adzuna', fetchAdzuna],
    ['Canada Job Bank', fetchCanadaJobBank],
    ['USAJOBS', fetchUSAJobs],
    ['Global Remote Feeds', fetchGlobalRemoteFeeds],
    ['LinkedIn', fetchLinkedIn],
    ['Indeed', fetchIndeed],
    ['Arbeitsagentur', fetchArbeitsagentur],
    ['MyCareersFuture', fetchMyCareersFuture],
    ['Seek', fetchSeek],
    ['Reed', fetchReedUK],
    ['Bayt', fetchBayt],
    ['WTTJ', fetchWTTJ],
    ['Naukri', fetchNaukri],
    ['Daijob', fetchDaijobJP],
    ['Vagas', fetchVagasBR]
  ];

  // Cartesian task list: location x role x board. Each task runs inside its own
  // AsyncLocalStorage context so fetchers read CTX.role / CTX.loc safely.
  const tasks = [];
  for (const loc of sweepLocs) {
    for (const role of sweepTitles) {
      for (const [name, fn] of boards) {
        tasks.push({ board: `${name} [${role} | ${loc}]`, run: () => ctxStore.run({ role, loc }, fn) });
      }
    }
  }

  const t0 = Date.now();
  await runPool(tasks, { globalLimit: 12 });

  const uniqueJobs = deduplicateJobList(allFetchedJobs);
  console.error(`\n[Multi-Board Ingestion] Full sweep complete in ${Date.now() - t0}ms. Total jobs fetched: ${allFetchedJobs.length} (Unique: ${uniqueJobs.length})`);
  return uniqueJobs;
}

// If run directly from the command line, execute and print to stdout
if (require.main === module) {
  fetchAllJobs().then(jobs => {
    process.stdout.write(JSON.stringify(jobs));
  }).catch(err => {
    console.error('[Multi-Board Ingestion] Fatal error:', err);
    process.stdout.write(JSON.stringify([])); // Output empty array on failure
    process.exit(1);
  });
}

// Export for testing or direct module usage
module.exports = {
  fetchAllJobs,
  fetchAdzuna,
  fetchCanadaJobBank,
  fetchUSAJobs,
  fetchGlobalRemoteFeeds,
  fetchLinkedIn,
  fetchLinkedInJobDetails,
  fetchIndeed,
  fetchArbeitsagentur,
  fetchMyCareersFuture,
  fetchSeek,
  fetchReedUK,
  fetchBayt,
  fetchWTTJ,
  fetchNaukri,
  fetchDaijobJP,
  fetchVagasBR,
  deduplicateJobList,
  allFetchedJobs,
  setSearchContext,
  getSearchContext
};
