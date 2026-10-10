/**
 * board-requests.js — Pure request builders, one per job board.
 *
 * Each builder sends ONLY parameters the user actually set in Settings and that
 * the board's API supports. No I/O, no module state: unit-testable.
 *
 * ctx = {
 *   role, loc,            // current search task
 *   cityQuery,            // resolved city string for `loc` (e.g. "Toronto, ON")
 *   scope,                // country scope code (CA, US, ...)
 *   workType,             // 'Remote' | 'Hybrid & Remote' | 'Onsite' | 'Open to All' ...
 *   radiusKm,             // user commute radius (0-100). 0 = exact city only.
 *   freshnessHours,       // <= 0 means "any time"
 * }
 */

const LINKEDIN_COUNTRY_NAMES = Object.freeze({
  US: 'United States', CA: 'Canada', GB: 'United Kingdom', UK: 'United Kingdom',
  DE: 'Germany', FR: 'France', IN: 'India', AU: 'Australia', SG: 'Singapore',
  NL: 'Netherlands', BR: 'Brazil', JP: 'Japan', AE: 'United Arab Emirates',
});

const LINKEDIN_DISTANCES_MILES = [10, 25, 50, 75, 100];

/** Which workplace modes does the user accept? Blank / Open to All => all three. */
function parseWorkModes(workType) {
  const t = String(workType || '').toLowerCase();
  const remote = /remote/.test(t);
  const hybrid = /hybrid/.test(t);
  const onsite = /on-?site|in-?office|in-?person/.test(t);
  if (!remote && !hybrid && !onsite) return { remote: true, hybrid: true, onsite: true, any: true };
  return { remote, hybrid, onsite, any: false };
}

/** Remote is the ONLY accepted mode (so location/radius must not be sent). */
function isRemoteOnly(modes) {
  return modes.remote && !modes.hybrid && !modes.onsite;
}

function clampRadiusKm(r) {
  const n = Number(r);
  if (!Number.isFinite(n)) return 25;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function kmToMiles(km) {
  return Math.round(km * 0.621371);
}

function freshnessDays(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return null;
  return Math.max(1, Math.ceil(h / 24));
}

function freshnessToLinkedIn(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return '';
  if (h <= 1) return 'r3600';
  if (h <= 24) return 'r86400';
  if (h <= 72) return 'r259200';
  if (h <= 168) return 'r604800';
  if (h <= 720) return 'r2592000';
  return '';
}

function snapLinkedInDistance(km) {
  const miles = kmToMiles(km);
  return LINKEDIN_DISTANCES_MILES.find(d => d >= miles) || 100;
}

/** Strip seniority prefixes for recall on boards that fuzzy-match (re-scored locally). */
function coreTitle(role) {
  const r = String(role || '').replace(/^(senior|sr\.?|lead|principal|junior|jr\.?)\s+/i, '').trim();
  return r || String(role || '');
}

function qs(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

function redact(url) {
  return url.replace(/(app_key|Authorization-Key|api_key)=[^&]+/gi, '$1=***');
}

// ── Adzuna ──────────────────────────────────────────────────────────────────
function buildAdzuna(ctx, { appId, appKey, countryCode, pages = 3 } = {}) {
  const modes = parseWorkModes(ctx.workType);
  const remoteOnly = isRemoteOnly(modes);
  const radius = clampRadiusKm(ctx.radiusKm);
  const days = freshnessDays(ctx.freshnessHours);
  const city = String(ctx.cityQuery || ctx.loc || '').split(',')[0].trim();

  const out = [];
  for (let page = 1; page <= pages; page++) {
    const params = {
      app_id: appId,
      app_key: appKey,
      what: coreTitle(ctx.role),
      sort_by: 'date',
      results_per_page: 50,
    };
    if (!remoteOnly && city && city.toLowerCase() !== 'remote') {
      params.where = city;
      if (radius > 0) params.distance = radius;
    }
    if (days) params.max_days_old = days;
    const url = `https://api.adzuna.com/v1/api/jobs/${countryCode}/search/${page}?${qs(params)}`;
    out.push({ page, url, safeUrl: redact(url) });
  }
  return out;
}

// ── LinkedIn guest API ──────────────────────────────────────────────────────
/**
 * Returns one variant per workplace mode the user accepts, each with `pages` page URLs.
 *  - remote  -> country-wide, f_WT=2
 *  - hybrid  -> city + radius, f_WT=3
 *  - onsite  -> city + radius, f_WT=1
 *  - Open to All -> city + radius (no f_WT) and country-wide remote (f_WT=2)
 */
function buildLinkedIn(ctx, { pages = 3, pageSize = 10 } = {}) {
  const modes = parseWorkModes(ctx.workType);
  const radius = clampRadiusKm(ctx.radiusKm);
  const tpr = freshnessToLinkedIn(ctx.freshnessHours);
  const city = String(ctx.cityQuery || ctx.loc || '').trim();
  const country = LINKEDIN_COUNTRY_NAMES[ctx.scope] || 'Canada';
  const hasCity = city && city.toLowerCase() !== 'remote';

  const variants = [];
  const local = (wt, mode) => ({
    mode,
    params: { keywords: ctx.role, location: city, f_WT: wt, f_TPR: tpr, distance: radius > 0 ? snapLinkedInDistance(radius) : undefined },
  });
  const remote = () => ({ mode: 'remote', params: { keywords: ctx.role, location: country, f_WT: '2', f_TPR: tpr } });

  if (modes.any) {
    if (hasCity) variants.push(local(undefined, 'any-local'));
    variants.push(remote());
  } else {
    if (modes.remote) variants.push(remote());
    if (hasCity && modes.hybrid) variants.push(local('3', 'hybrid'));
    if (hasCity && modes.onsite) variants.push(local('1', 'onsite'));
  }

  return variants.map(v => ({
    mode: v.mode,
    urls: Array.from({ length: pages }, (_, p) =>
      `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${qs({ ...v.params, start: p * pageSize })}`),
  }));
}

// ── Canada Job Bank ─────────────────────────────────────────────────────────
function buildJobBank(ctx) {
  const modes = parseWorkModes(ctx.workType);
  const remoteOnly = isRemoteOnly(modes);
  const city = String(ctx.cityQuery || ctx.loc || '').split(',')[0].trim();
  const role = String(ctx.role || '').replace(/\s+(II|III|IV|I)\b/i, '').trim() || ctx.role;
  const out = [];
  const local = city && city.toLowerCase() !== 'remote' && !remoteOnly;
  if (local) {
    out.push({ mode: 'local', url: `https://www.jobbank.gc.ca/jobsearch/jobsearch?${qs({ searchstring: role, locationstring: city, sort: 'D' })}` });
  }
  if (modes.remote) {
    // Nationwide telework: parsed from the telework pill after fetch
    out.push({ mode: 'remote', url: `https://www.jobbank.gc.ca/jobsearch/jobsearch?${qs({ searchstring: role, locationstring: 'Canada', sort: 'D' })}` });
  }
  return out;
}

// ── Indeed (RSS) ────────────────────────────────────────────────────────────
function buildIndeed(ctx, { domain }) {
  const modes = parseWorkModes(ctx.workType);
  const remoteOnly = isRemoteOnly(modes);
  const radius = clampRadiusKm(ctx.radiusKm);
  const days = freshnessDays(ctx.freshnessHours);
  const city = String(ctx.cityQuery || ctx.loc || '').trim();
  const params = { q: ctx.role, sort: 'date', fromage: days || undefined };
  if (remoteOnly) {
    params.l = 'Remote';
  } else {
    params.l = city;
    if (radius > 0) params.radius = radius;
  }
  return [{ mode: remoteOnly ? 'remote' : 'local', url: `https://${domain}/rss?${qs(params)}` }];
}

// ── USAJOBS ─────────────────────────────────────────────────────────────────
function buildUSAJobs(ctx) {
  const modes = parseWorkModes(ctx.workType);
  const remoteOnly = isRemoteOnly(modes);
  const radius = clampRadiusKm(ctx.radiusKm);
  const days = freshnessDays(ctx.freshnessHours);
  const nationwide = /remote|anywhere|united states|usa|all states/i.test(ctx.loc || '');
  const params = { Keyword: coreTitle(ctx.role), ResultsPerPage: 25, DatePosted: days || undefined };
  if (remoteOnly) {
    params.RemoteIndicator = 'True';
  } else if (!nationwide && ctx.loc) {
    params.LocationName = ctx.loc;
    if (radius > 0) params.Radius = kmToMiles(radius);
  }
  return [{ mode: remoteOnly ? 'remote' : 'local', url: `https://data.usajobs.gov/api/search?${qs(params)}` }];
}

// ── Shared work-mode classifier (replaces copy-pasted regex blocks) ─────────
const RE_HYBRID_LOC = /\b(hybrid|hybride)\b/i;
const RE_HYBRID_DESC = /\b(hybrid|hybride|hybrid\s+work|hybrid\s+role|hybrid\s+model|hybrid\s+environment|in-office\s+and\s+remote|in\s+office\s+and\s+remote)\b/i;
const RE_REMOTE_TITLE_LOC = /\b(remote|wfh|telecommute|virtual)\b/i;
const RE_REMOTE_DESC = /\b(100%\s*remote|fully\s*remote|fully-remote|permanent\s*remote|remote\s*across\s*canada|remote\s*anywhere\s*in\s*canada|work\s*from\s*home\s*anywhere)\b/i;
const RE_NEG_REMOTE = /\b(no remote|not remote|non-remote|not a remote|remote:\s*no|100%\s*on-site|100%\s*in-office|strictly in-office|strictly on-site|on-site only|in-person only|no work from home|no wfh)\b/i;

/**
 * Classify workplace mode. A hybrid signal ALWAYS wins over remote words,
 * because "in-office and remote days" means physical attendance in that city.
 * @returns {'remote'|'hybrid'|'onsite'|'unknown'}
 */
function classifyWorkMode(title = '', loc = '', desc = '', { sourceRemote = false } = {}) {
  const t = String(title), l = String(loc), d = String(desc);
  if (RE_HYBRID_LOC.test(l) || RE_HYBRID_LOC.test(t) || RE_HYBRID_DESC.test(d)) return 'hybrid';
  if (RE_NEG_REMOTE.test(`${t} ${l} ${d}`)) return 'onsite';
  if (sourceRemote || RE_REMOTE_TITLE_LOC.test(l) || RE_REMOTE_TITLE_LOC.test(t) || RE_REMOTE_DESC.test(d)) return 'remote';
  return 'unknown';
}

module.exports = {
  parseWorkModes, isRemoteOnly, clampRadiusKm, kmToMiles, freshnessDays,
  freshnessToLinkedIn, snapLinkedInDistance, coreTitle, redact,
  buildAdzuna, buildLinkedIn, buildJobBank, buildIndeed, buildUSAJobs,
  classifyWorkMode,
};
