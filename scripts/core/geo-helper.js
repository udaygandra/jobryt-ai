/**
 * geo-helper.js — Unified Data-Driven Geography Engine
 *
 * PURPOSE:
 *   Provides agnostic geography validation, region detection, and title filtering.
 *   Dynamically loads from `data/config/geo-hierarchy.json` with zero hardcoding,
 *   supporting smart expansion of cities, provinces, states, and global scopes.
 *
 * EXPORTS:
 *   - loadGeoHierarchy: Caches and returns the underlying JSON hierarchy.
 *   - detectTargetCountryScope: Derives 'CA', 'US', 'US_CA', or 'GLOBAL'.
 *   - isJobLocationEligible: Evaluates if a job location falls within candidate bounds.
 *   - isJobWorkplaceEligible: Checks remote/hybrid/onsite settings.
 *   - isJobRoleRelevant: Core tokenized evaluation for roles vs target titles.
 *   - calculateExperienceYears & generateSmartRoleSuggestions: Utility heuristics.
 */

const fs = require('fs');
const path = require('path');
const { getDataDir } = require('./common-utils');

function getSystemTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (_) {
    return 'UTC';
  }
}

// ── 1. Caching & Setup ──────────────────────────────────────────────────────
let cachedGeo = null;
let cachedGeoMtime = 0;

function loadGeoHierarchy() {
  const geoPath = path.join(__dirname, '..', '..', 'data', 'config', 'geo-hierarchy.json');

  try {
    if (fs.existsSync(geoPath)) {
      const stats = fs.statSync(geoPath);
      if (cachedGeo && stats.mtimeMs === cachedGeoMtime) {
        return cachedGeo;
      }
      
      const data = JSON.parse(fs.readFileSync(geoPath, 'utf8'));
      cachedGeoMtime = stats.mtimeMs;

      // Compile O(1) lookup sets for high-speed location parsing
      const caProvs = new Set();
      const usStates = new Set();
      const caTokens = new Set(['canada', 'ca']);
      const usTokens = new Set(['usa', 'us', 'united states']);
      const allKnownAcronyms = new Set(['CA', 'US', 'USA', 'UK', 'Remote', 'GTA', 'NYC']);

      if (Array.isArray(data.canadian_provinces)) {
        for (const p of data.canadian_provinces) {
          if (p.name) { caProvs.add(p.name.toLowerCase()); caTokens.add(p.name.toLowerCase()); }
          if (p.code) {
            caProvs.add(p.code.toLowerCase());
            caTokens.add(p.code.toLowerCase());
            allKnownAcronyms.add(p.code.toUpperCase());
          }
        }
      }

      if (Array.isArray(data.us_states)) {
        for (const s of data.us_states) {
          if (s.name) { usStates.add(s.name.toLowerCase()); usTokens.add(s.name.toLowerCase()); }
          if (s.code) {
            usStates.add(s.code.toLowerCase());
            usTokens.add(s.code.toLowerCase());
            allKnownAcronyms.add(s.code.toUpperCase());
          }
        }
      }

      if (Array.isArray(data.cities)) {
        for (const c of data.cities) {
          const isCa = c.country_code === 'CA';
          const isUs = c.country_code === 'US';
          if (Array.isArray(c.names)) {
            for (const n of c.names) {
              const lower = n.toLowerCase();
              if (isCa) caTokens.add(lower);
              if (isUs) usTokens.add(lower);
              if (/^[A-Z]{2,5}$/i.test(n) && n.length <= 4) allKnownAcronyms.add(n.toUpperCase());
            }
          }
        }
      }

      cachedGeo = { data, caProvs, usStates, caTokens, usTokens, allKnownAcronyms };
      return cachedGeo;
    }
  } catch (e) {
    console.error('❌ Error loading geo hierarchy:', e.message);
  }

  // Fallback structure to prevent crashes
  return {
    data: { canadian_provinces: [], us_states: [], cities: [] },
    caProvs: new Set(), usStates: new Set(),
    caTokens: new Set(), usTokens: new Set(),
    allKnownAcronyms: new Set()
  };
}

// ── 2. Location Formatting & Parsing ────────────────────────────────────────
function formatLocationName(loc) {
  if (!loc || typeof loc !== 'string') return '';
  const geo = loadGeoHierarchy();

  return loc.split(',').map(part => {
    const trimmed = part.trim();
    const upper = trimmed.toUpperCase();
    if (geo.allKnownAcronyms.has(upper) || /^[A-Z]{2}$/.test(upper)) return upper;
    return trimmed.replace(/\b\w+/g, w => /^(and|or|of|the|in|at)$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }).join(', ');
}

const COUNTRY_PATTERNS = Object.freeze({
  US: /\b(usa|united states|u\.s\.|u\.s\.a\.)\b/i,
  CA: /\b(canada|canadian)\b/i,
  GB: /\b(uk|united kingdom|great britain|england|scotland|wales|london|manchester|birmingham|leeds|edinburgh|glasgow)\b/i,
  UK: /\b(uk|united kingdom|great britain|england|scotland|wales|london|manchester|birmingham|leeds|edinburgh|glasgow)\b/i,
  DE: /\b(germany|deutschland|berlin|munich|münchen|frankfurt|hamburg|cologne|köln|stuttgart|düsseldorf)\b/i,
  AU: /\b(australia|sydney|melbourne|brisbane|perth|adelaide|canberra)\b/i,
  FR: /\b(france|paris|lyon|marseille|toulouse|bordeaux|nantes|lille)\b/i,
  IN: /\b(india|delhi|mumbai|bangalore|bengaluru|hyderabad|pune|chennai|kolkata|noida|gurgaon|gurugram|ahmedabad)\b/i,
  NL: /\b(netherlands|holland|amsterdam|rotterdam|the hague|den haag|utrecht|eindhoven)\b/i,
  SG: /\b(singapore)\b/i,
  BR: /\b(brazil|brasil|são paulo|sao paulo|rio de janeiro|curitiba|belo horizonte)\b/i,
  IT: /\b(italy|italia|milan|milano|rome|roma|turin|torino|florence|firenze)\b/i,
  PL: /\b(poland|polska|warsaw|warszawa|krakow|kraków|wrocław|wroclaw|gdańsk|gdansk)\b/i,
  ZA: /\b(south africa|johannesburg|cape town|durban|pretoria)\b/i,
  AT: /\b(austria|österreich|vienna|wien|salzburg|graz|linz)\b/i,
  NZ: /\b(new zealand|auckland|wellington|christchurch)\b/i,
  MX: /\b(mexico|méxico|mexico city|cdmx|guadalajara|monterrey)\b/i,
  AE: /\b(uae|united arab emirates|dubai|abu dhabi|sharjah|gulf|gcc)\b/i,
  JP: /\b(japan|tokyo|osaka|kyoto|yokohama|fukuoka|nagoya)\b/i,
  ES: /\b(spain|españa|madrid|barcelona|valencia|seville|sevilla|malaga|málaga)\b/i,
  CH: /\b(switzerland|schweiz|suisse|zurich|zürich|geneva|genève|basel|lausanne|bern)\b/i,
  IE: /\b(ireland|dublin|cork|galway|limerick)\b/i,
  SE: /\b(sweden|sverige|stockholm|gothenburg|göteborg|malmö)\b/i
});

const SUPPORTED_COUNTRIES = Object.freeze([
  { id: 'AUTO', code: 'AUTO', name: 'Auto-Detect from Master Profile', flag: '🤖', scope: 'AUTO', adzuna: 'auto' },
  { id: 'US', code: 'US', name: 'United States', flag: '🇺🇸', scope: 'US', adzuna: 'us' },
  { id: 'GB', code: 'GB', name: 'United Kingdom', flag: '🇬🇧', scope: 'GB', adzuna: 'gb' },
  { id: 'CA', code: 'CA', name: 'Canada', flag: '🇨🇦', scope: 'CA', adzuna: 'ca' },
  { id: 'DE', code: 'DE', name: 'Germany (DACH)', flag: '🇩🇪', scope: 'DE', adzuna: 'de' },
  { id: 'AU', code: 'AU', name: 'Australia', flag: '🇦🇺', scope: 'AU', adzuna: 'au' },
  { id: 'FR', code: 'FR', name: 'France', flag: '🇫🇷', scope: 'FR', adzuna: 'fr' },
  { id: 'IN', code: 'IN', name: 'India', flag: '🇮🇳', scope: 'IN', adzuna: 'in' },
  { id: 'NL', code: 'NL', name: 'Netherlands', flag: '🇳🇱', scope: 'NL', adzuna: 'nl' },
  { id: 'AE', code: 'AE', name: 'UAE & Gulf (Middle East)', flag: '🇦🇪', scope: 'AE', adzuna: 'us' },
  { id: 'SG', code: 'SG', name: 'Singapore', flag: '🇸🇬', scope: 'SG', adzuna: 'sg' },
  { id: 'JP', code: 'JP', name: 'Japan', flag: '🇯🇵', scope: 'JP', adzuna: 'us' },
  { id: 'BR', code: 'BR', name: 'Brazil', flag: '🇧🇷', scope: 'BR', adzuna: 'br' },
  { id: 'IT', code: 'IT', name: 'Italy', flag: '🇮🇹', scope: 'IT', adzuna: 'it' },
  { id: 'PL', code: 'PL', name: 'Poland', flag: '🇵🇱', scope: 'PL', adzuna: 'pl' },
  { id: 'ZA', code: 'ZA', name: 'South Africa', flag: '🇿🇦', scope: 'ZA', adzuna: 'za' },
  { id: 'AT', code: 'AT', name: 'Austria', flag: '🇦🇹', scope: 'AT', adzuna: 'at' },
  { id: 'NZ', code: 'NZ', name: 'New Zealand', flag: '🇳🇿', scope: 'NZ', adzuna: 'nz' },
  { id: 'MX', code: 'MX', name: 'Mexico', flag: '🇲🇽', scope: 'MX', adzuna: 'mx' },
  { id: 'US_CA', code: 'US_CA', name: 'North America (USA & Canada)', flag: '🌎', scope: 'US_CA', adzuna: 'us' },
  { id: 'GLOBAL', code: 'GLOBAL', name: 'Worldwide / Global Remote', flag: '🌐', scope: 'GLOBAL', adzuna: 'us' }
]);

function detectTargetCountryScope(locations) {
  if (!locations) return 'GLOBAL';
  const geo = loadGeoHierarchy();
  const text = (Array.isArray(locations) ? locations : [locations]).join(' ').toLowerCase();

  const isCrossBorder = /us\s*(&|\band\b|\/)\s*canada|cross[- ]border|north america/i.test(text);
  if (isCrossBorder) return 'US_CA';

  // Check specific international markets first
  if (/\b(uk|united kingdom|great britain|england|scotland|wales|london)\b/i.test(text)) return 'GB';
  if (/\b(germany|deutschland|berlin|munich|münchen|frankfurt|hamburg)\b/i.test(text)) return 'DE';
  if (/\b(australia|sydney|melbourne|brisbane|perth)\b/i.test(text)) return 'AU';
  if (/\b(india|delhi|mumbai|bangalore|bengaluru|hyderabad|pune|chennai)\b/i.test(text)) return 'IN';
  if (/\b(france|paris|lyon|marseille)\b/i.test(text)) return 'FR';
  if (/\b(netherlands|holland|amsterdam|rotterdam|utrecht)\b/i.test(text)) return 'NL';
  if (/\b(uae|united arab emirates|dubai|abu dhabi|sharjah|gulf)\b/i.test(text)) return 'AE';
  if (/\b(singapore)\b/i.test(text)) return 'SG';
  if (/\b(japan|tokyo|osaka|kyoto|yokohama)\b/i.test(text)) return 'JP';
  if (/\b(brazil|brasil|são paulo|sao paulo|rio de janeiro)\b/i.test(text)) return 'BR';
  if (/\b(italy|italia|milan|milano|rome|roma)\b/i.test(text)) return 'IT';
  if (/\b(poland|polska|warsaw|warszawa|krakow)\b/i.test(text)) return 'PL';
  if (/\b(south africa|johannesburg|cape town)\b/i.test(text)) return 'ZA';
  if (/\b(austria|österreich|vienna|wien)\b/i.test(text)) return 'AT';
  if (/\b(new zealand|auckland|wellington)\b/i.test(text)) return 'NZ';
  if (/\b(mexico|méxico|mexico city|guadalajara)\b/i.test(text)) return 'MX';
  if (/\b(ireland|dublin|cork)\b/i.test(text)) return 'IE';
  if (/\b(switzerland|schweiz|suisse|zurich|zürich|geneva)\b/i.test(text)) return 'CH';
  if (/\b(spain|españa|madrid|barcelona)\b/i.test(text)) return 'ES';

  let hasCaMatch = false;
  for (const token of geo.caTokens) {
    if (token.length <= 2 ? new RegExp(`\\b${token}\\b`, 'i').test(text) : text.includes(token)) {
      hasCaMatch = true; break;
    }
  }

  let hasUsMatch = false;
  for (const token of geo.usTokens) {
    if (token.length <= 2 ? new RegExp(`\\b${token}\\b`, 'i').test(text) : text.includes(token)) {
      hasUsMatch = true; break;
    }
  }

  if (hasCaMatch && hasUsMatch) return 'US_CA';
  if (hasUsMatch && !hasCaMatch) return 'US';
  if (hasCaMatch && !hasUsMatch) return 'CA';
  if (/worldwide|anywhere|global/i.test(text)) return 'GLOBAL';
  return 'GLOBAL';
}

function detectCandidateTimezone(profileObj) {
  const defaultFallback = process.env.TIMEZONE || getSystemTimezone();
  if (!profileObj || typeof profileObj !== 'object') {
    return defaultFallback;
  }

  // 1. Explicit timezone property in master-profile.json
  if (profileObj.timezone && typeof profileObj.timezone === 'string' && profileObj.timezone.trim()) {
    const rawTz = profileObj.timezone.trim();
    try {
      Intl.DateTimeFormat(undefined, { timeZone: rawTz });
      return rawTz;
    } catch (_) {}
  }

  // 2. Derive from candidate locations or contact location
  const locList = [];
  if (Array.isArray(profileObj.locations)) locList.push(...profileObj.locations);
  if (profileObj.contact?.location) locList.push(profileObj.contact.location);

  const locText = locList.join(' ').toLowerCase();
  if (!locText) {
    return defaultFallback;
  }

  // International checks (checked first to prevent collisions like London, UK vs London, ON)
  if (/\b(uk|united kingdom|england|great britain|london,?\s*uk)\b/i.test(locText) || (/london/i.test(locText) && !/\b(on|ontario|canada)\b/i.test(locText))) {
    return 'Europe/London';
  }
  if (/\b(germany|deutschland|berlin|munich|frankfurt|hamburg|france|paris|amsterdam|netherlands|spain|madrid|italy|rome)\b/i.test(locText)) {
    return 'Europe/Berlin';
  }
  if (/\b(india|delhi|mumbai|bangalore|hyderabad|bengaluru|pune|chennai|warangal)\b/i.test(locText)) {
    return 'Asia/Kolkata';
  }
  if (/\b(singapore|tokyo|japan|hong kong|seoul|korea)\b/i.test(locText)) {
    return /\b(tokyo|japan|seoul|korea)\b/i.test(locText) ? 'Asia/Tokyo' : 'Asia/Singapore';
  }
  if (/\b(uae|dubai|abu dhabi|qatar|doha|saudi|riyadh)\b/i.test(locText)) {
    return 'Asia/Dubai';
  }
  if (/\b(sydney|melbourne|brisbane|australia)\b/i.test(locText)) {
    return 'Australia/Sydney';
  }

  // Newfoundland (NST/NDT: UTC-3:30)
  if (/\b(nl|newfoundland|st\.?\s*john'?s?)\b/i.test(locText)) {
    return 'America/St_Johns';
  }

  // Atlantic (AST/ADT: UTC-4)
  if (/\b(ns|nova scotia|halifax|nb|new brunswick|moncton|fredericton|pe|pei|prince edward island|charlottetown)\b/i.test(locText)) {
    return 'America/Halifax';
  }

  // Pacific (PST/PDT: UTC-8) - BC, Washington, California, Oregon, Nevada
  if (/\b(bc|british columbia|vancouver|victoria|surrey|burnaby|kelowna|richmond|yt|yukon|whitehorse|seattle|wa|washington|portland|or|oregon|california|los angeles|san francisco|san diego|san jose|sacramento|nv|nevada|las vegas)\b/i.test(locText) && !/\b(ontario|toronto|ottawa)\b/i.test(locText)) {
    return (locText.includes('canada') || /\b(bc|vancouver|victoria)\b/i.test(locText)) ? 'America/Vancouver' : 'America/Los_Angeles';
  }

  // Mountain (MST/MDT: UTC-7) - Alberta, Colorado, Utah, Arizona, etc.
  if (/\b(ab|alberta|calgary|edmonton|red deer|nt|northwest territories|nu|nunavut|denver|co|colorado|utah|salt lake|phoenix|az|arizona|idaho|wyoming|montana)\b/i.test(locText)) {
    return /\b(phoenix|arizona|az)\b/i.test(locText) ? 'America/Phoenix' : ((locText.includes('canada') || /\b(ab|calgary|edmonton)\b/i.test(locText)) ? 'America/Edmonton' : 'America/Denver');
  }

  // Central (CST/CDT: UTC-6) - Manitoba, Saskatchewan, Texas, Illinois, etc.
  if (/\b(mb|manitoba|winnipeg|sk|saskatchewan|regina|saskatoon|texas|tx|austin|dallas|houston|san antonio|chicago|il|illinois|minnesota|minneapolis|missouri|st\.?\s*louis|kansas|wisconsin|iowa|tennessee|nashville|memphis|louisiana|new orleans)\b/i.test(locText)) {
    return (locText.includes('canada') || /\b(mb|winnipeg|sk|saskatchewan)\b/i.test(locText)) ? 'America/Winnipeg' : 'America/Chicago';
  }

  // Eastern (EST/EDT: UTC-5) - Ontario, Quebec, New York, Florida, etc.
  if (/\b(on|ontario|toronto|gta|mississauga|brampton|markham|vaughan|ottawa|hamilton|london|kitchener|waterloo|windsor|qc|quebec|montreal|laval|gatineau|ny|new york|nyc|boston|ma|massachusetts|miami|fl|florida|dc|washington dc|atlanta|ga|georgia|pa|philadelphia|pittsburgh|nc|charlotte|raleigh|va|virginia|ohio|columbus|cleveland|detroit|mi|michigan)\b/i.test(locText)) {
    return (locText.includes('canada') || /\b(on|ontario|toronto|ottawa|qc|quebec|montreal)\b/i.test(locText)) ? 'America/Toronto' : 'America/New_York';
  }

  // Default fallback based on country scope
  const countryScope = detectTargetCountryScope(locList);
  if (countryScope === 'US') return 'America/New_York';
  if (countryScope === 'CA') return 'America/Toronto';
  return defaultFallback;
}

function getSearchLocationQuery(targetLoc) {
  if (!targetLoc || typeof targetLoc !== 'string') return '';
  const geo = loadGeoHierarchy();
  const lower = targetLoc.toLowerCase().trim();

  if (Array.isArray(geo.data?.cities)) {
    for (const c of geo.data.cities) {
      if (Array.isArray(c.names) && c.names.some(n => lower === n.toLowerCase() || lower.includes(n.toLowerCase()))) {
        const countryLabel = c.country || (c.country_code === 'CA' ? 'Canada' : (c.country_code === 'US' ? 'United States' : ''));
        const baseCity = c.display_city || formatLocationName(targetLoc);
        return (countryLabel && !baseCity.toLowerCase().includes(countryLabel.toLowerCase())) ? `${baseCity}, ${countryLabel}` : baseCity;
      }
    }
  }
  return formatLocationName(targetLoc);
}

function isCandidateExplicitNationwide(candLocations = [], countryCode = 'CA') {
  const list = Array.isArray(candLocations) ? candLocations : [String(candLocations || '')];
  for (const item of list) {
    if (!item) continue;
    const trimmed = item.trim().toLowerCase();
    if (/all provinces|all states|all regions|nationwide|entire country|any province|any state|all cities/i.test(trimmed)) {
      return true;
    }
    if (countryCode === 'CA' && /^(canada|ca)$/i.test(trimmed)) return true;
    if (countryCode === 'US' && /^(united states|usa|us|u\.s\.)$/i.test(trimmed)) return true;
    if (countryCode === 'US_CA' && /^(north america|usa and canada|canada and usa)$/i.test(trimmed)) return true;
  }
  return false;
}

// ── 3. Candidate Matching Logic ─────────────────────────────────────────────
function isExplicitlyNegativeRemote(text = '') {
  if (!text || typeof text !== 'string') return false;
  return /\b(no remote|not remote|non-remote|not a remote|remote:\s*no|100%\s*on-site|100%\s*in-office|strictly in-office|strictly on-site|on-site only|in-person only|no work from home|no wfh)\b/i.test(text) ||
    /\bremote(\s+work)?\s+(is\s+)?(not\s+(available|permitted|offered|allowed|an option)|unavailable)\b/i.test(text) ||
    /\bnot\s+(available|eligible)\s+for\s+remote\b/i.test(text);
}

function isJobLocationEligible(jobLoc, candidateLocations = [], countryScope = 'CA', isJobRemote = false, jobDesc = '') {
  if (!jobLoc || typeof jobLoc !== 'string') return true;
  const lower = jobLoc.toLowerCase().trim();
  const descText = String(jobDesc || '').toLowerCase();
  const geo = loadGeoHierarchy();

  // Normalize isJobRemote if passed as string (e.g. 'onsite', 'hybrid', 'remote', etc.)
  const isExplicitRemote = typeof isJobRemote === 'boolean'
    ? isJobRemote
    : (typeof isJobRemote === 'string' && /^(remote|wfh|telecommute|virtual)$/i.test(isJobRemote.trim()));

  // 1. Determine if job is located in Canada
  let isCanada = /\bcanada\b/i.test(lower) || /\bremote\s*[-–(,]?\s*ca\b/i.test(lower);
  if (!isCanada && Array.isArray(geo.data?.cities)) {
    isCanada = geo.data.cities.some(c => c.country_code === 'CA' && Array.isArray(c.names) && c.names.some(n => lower === n || lower.includes(n)));
  }
  if (!isCanada && Array.isArray(geo.data?.canadian_provinces)) {
    isCanada = geo.data.canadian_provinces.some(p => lower.includes(p.name.toLowerCase()) || new RegExp(`(,\\s*|\\b)${p.code}(\\b|\\s*$)`, 'i').test(lower));
  }

  // 2. Determine if job is located in the US
  let isUS = /\b(usa|united states|u\.s\.)\b/i.test(lower) || /\bremote\s*[-–(,]?\s*us(a)?\b/i.test(lower) || (countryScope === 'US' && /\bmultiple locations\b/i.test(lower));
  if (!isUS && Array.isArray(geo.data?.cities)) {
    isUS = geo.data.cities.some(c => c.country_code === 'US' && Array.isArray(c.names) && c.names.some(n => lower === n || lower.includes(n)));
  }
  if (!isUS && Array.isArray(geo.data?.us_states)) {
    isUS = geo.data.us_states.some(s => (s.code === 'CA' ? (!isCanada && (new RegExp(`,\\s*ca(\\b|\\s*$)`, 'i').test(lower) || /\bcalifornia\b/i.test(lower))) : (lower.includes(s.name.toLowerCase()) || new RegExp(`(,\\s*|\\b)${s.code}(\\b|\\s*$)`, 'i').test(lower))));
  }

  const isGlobal = /^(worldwide|global|remote|anywhere|north america|americas|any)$/i.test(lower) || /\b(worldwide|anywhere|north america|americas)\b/i.test(lower);
  const candLocsText = (Array.isArray(candidateLocations) ? candidateLocations.join(' ') : String(candidateLocations || '')).toLowerCase();
  const candidateAllowsWorldwide = /worldwide|global|anywhere/i.test(candLocsText);
  
  // Guard against false positive remote detection (e.g. "no remote", "not a remote role", "on-site only")
  const hasNegativeRemote = isExplicitlyNegativeRemote(lower) || isExplicitlyNegativeRemote(descText);
  const isDetectedRemote = !hasNegativeRemote && (
    isExplicitRemote ||
    isGlobal ||
    /\b(remote|work from home|wfh|telecommute|virtual|anywhere)\b/i.test(lower) ||
    /\(remote\)|-\s*remote|remote\s*in\b|canada\s*wide\s*remote|remote\s*across/i.test(lower) ||
    /\b(100% remote|fully remote|remote work available across|remote across canada|remote anywhere in canada)\b/i.test(descText) ||
    (isExplicitRemote && /\bmultiple locations\b/i.test(lower))
  );

  // 3. Country Scope Gate (Strict Destination Routing)
  let countryMatch = true;
  if (countryScope === 'CA') {
    countryMatch = isCanada || isGlobal || (candidateAllowsWorldwide && isGlobal);
  } else if (countryScope === 'US') {
    countryMatch = isUS || isGlobal || (candidateAllowsWorldwide && isGlobal);
  } else if (countryScope === 'US_CA') {
    countryMatch = isCanada || isUS || isGlobal || (candidateAllowsWorldwide && isGlobal);
  } else if (COUNTRY_PATTERNS[countryScope]) {
    countryMatch = COUNTRY_PATTERNS[countryScope].test(lower) || isGlobal || (candidateAllowsWorldwide && isGlobal);
  } else if (countryScope === 'GLOBAL' || countryScope === 'AUTO' || !countryScope) {
    countryMatch = true;
  }

  if (!countryMatch) return false;

  // 4. REMOTE JOBS:
  // If the job is verified REMOTE and within candidate's country scope, it is eligible
  if (isDetectedRemote) {
    return true;
  }

  // If candidate selected Worldwide / Global, all jobs in country scope are accepted
  if (candidateAllowsWorldwide) return true;

  // Explicit Nationwide allowances only (must not match generic country name inside a city string)
  const candidateAllowsAllUS = isCandidateExplicitNationwide(candidateLocations, 'US');
  const candidateAllowsAllCA = isCandidateExplicitNationwide(candidateLocations, 'CA');
  const candidateAllowsAllNA = isCandidateExplicitNationwide(candidateLocations, 'US_CA');

  if (candidateAllowsAllNA && (isUS || isCanada)) return true;
  if (candidateAllowsAllUS && isUS) return true;
  if (candidateAllowsAllCA && isCanada) return true;

  // 5. HYBRID & ONSITE JOBS:
  // Must physically match candidate's target commuting location / metropolitan cluster!
  if (Array.isArray(candidateLocations) && candidateLocations.length > 0) {
    let physicalCityMatch = false;
    const candidateAllowedCityTokens = new Set();
    const candidateAllowedWholeRegionTokens = new Set();

    for (const candLoc of candidateLocations) {
      if (!candLoc) continue;
      const cLower = candLoc.toLowerCase().trim();
      const cFirstPart = cLower.split(',')[0].trim();
      if (cFirstPart) candidateAllowedCityTokens.add(cFirstPart);

      // Check if candidate explicitly requested a whole province / state
      const isExplicitWholeProvince = /all provinces|all cities|nationwide|entire province|entire state/i.test(cLower) ||
        (cLower.length > 3 && !cLower.includes(',') && (geo.caProvs.has(cLower) || geo.usStates.has(cLower)));
      if (isExplicitWholeProvince) {
        candidateAllowedWholeRegionTokens.add(cLower);
      }

      // Check candidate home province/state (e.g. candidate in "Toronto, ON, Canada" has home province "Ontario")
      if (Array.isArray(geo.data?.canadian_provinces)) {
        for (const prov of geo.data.canadian_provinces) {
          if (cLower.includes(prov.name.toLowerCase()) || new RegExp(`(,\\s*|\\b)${prov.code}(\\b|\\s*$)`, 'i').test(cLower)) {
            candidateAllowedWholeRegionTokens.add(prov.name.toLowerCase());
          }
        }
      }
      if (Array.isArray(geo.data?.us_states)) {
        for (const st of geo.data.us_states) {
          if (cLower.includes(st.name.toLowerCase()) || new RegExp(`(,\\s*|\\b)${st.code}(\\b|\\s*$)`, 'i').test(cLower)) {
            candidateAllowedWholeRegionTokens.add(st.name.toLowerCase());
          }
        }
      }

      if (Array.isArray(geo.data?.cities)) {
        for (const city of geo.data.cities) {
          const isMatch = (city.display_city && (cLower.includes(city.display_city.toLowerCase()) || city.display_city.toLowerCase().includes(cFirstPart))) ||
                          (city.metro && (cLower.includes(city.metro.toLowerCase()) || city.metro.toLowerCase().includes(cFirstPart))) ||
                          (Array.isArray(city.names) && city.names.some(n => cLower.includes(n.toLowerCase()) || cFirstPart.includes(n.toLowerCase())));
          if (isMatch) {
            city.names.forEach(n => candidateAllowedCityTokens.add(n.toLowerCase()));
            if (city.display_city) candidateAllowedCityTokens.add(city.display_city.toLowerCase().split(',')[0].trim());
            if (city.metro) candidateAllowedCityTokens.add(city.metro.toLowerCase());
          }
        }
      }
    }

    // A. Match against explicit city / metro cluster tokens
    for (const token of candidateAllowedCityTokens) {
      if (token.length < 2) continue;
      if (token.length <= 3) {
        if (new RegExp(`\\b${token.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'i').test(lower)) {
          physicalCityMatch = true;
          break;
        }
      } else {
        if (lower.includes(token)) {
          physicalCityMatch = true;
          break;
        }
      }
    }

    // B. If no city token matched, check if job is pure province/state encompassed by candidate
    if (!physicalCityMatch && candidateAllowedWholeRegionTokens.size > 0) {
      const lowerClean = lower.replace(/^(location|lieu)\s*[:\-]?\s*/i, '').trim();
      const isPureRegion = geo.caProvs.has(lowerClean) || geo.usStates.has(lowerClean) ||
        !lowerClean.includes(',');
      if (isPureRegion) {
        for (const regToken of candidateAllowedWholeRegionTokens) {
          if (lowerClean === regToken || (regToken.length > 3 && lowerClean.includes(regToken))) {
            let hasConflictingCity = false;
            if (Array.isArray(geo.data?.cities)) {
              for (const c of geo.data.cities) {
                if (c.names && c.names.some(n => n.length > 3 && lowerClean.includes(n))) {
                  const matchesOurCity = candidateAllowedCityTokens.has(c.display_city?.toLowerCase()?.split(',')[0]?.trim()) ||
                    c.names.some(n => candidateAllowedCityTokens.has(n.toLowerCase()));
                  if (!matchesOurCity) {
                    hasConflictingCity = true;
                    break;
                  }
                }
              }
            }
            if (!hasConflictingCity) {
              physicalCityMatch = true;
              break;
            }
          }
        }
      }
    }

    if (!physicalCityMatch) return false;
  }

  return true;
}

// ── Coordinates and Haversine Distance ──────────────────────────────────────
const CITY_COORDINATES = Object.freeze({
  // Greater Toronto Area & Ontario
  'toronto': { lat: 43.6532, lon: -79.3832 },
  'downtown toronto': { lat: 43.6532, lon: -79.3832 },
  'north york': { lat: 43.7615, lon: -79.4111 },
  'east york': { lat: 43.6912, lon: -79.3417 },
  'york': { lat: 43.6957, lon: -79.4504 },
  'etobicoke': { lat: 43.6205, lon: -79.5132 },
  'scarborough': { lat: 43.7764, lon: -79.2318 },
  'mississauga': { lat: 43.5890, lon: -79.6441 },
  'markham': { lat: 43.8561, lon: -79.3370 },
  'vaughan': { lat: 43.8563, lon: -79.5085 },
  'richmond hill': { lat: 43.8828, lon: -79.4403 },
  'brampton': { lat: 43.7315, lon: -79.7624 },
  'oakville': { lat: 43.4675, lon: -79.6877 },
  'pickering': { lat: 43.8384, lon: -79.0868 },
  'ajax': { lat: 43.8509, lon: -79.0204 },
  'whitby': { lat: 43.8971, lon: -78.9429 },
  'oshawa': { lat: 43.8975, lon: -78.8658 },
  'milton': { lat: 43.5183, lon: -79.8774 },
  'newmarket': { lat: 44.0592, lon: -79.4613 },
  'aurora': { lat: 44.0065, lon: -79.4504 },
  'burlington': { lat: 43.3255, lon: -79.7990 },
  'hamilton': { lat: 43.2557, lon: -79.8711 },
  'guelph': { lat: 43.5448, lon: -80.2482 },
  'kitchener': { lat: 43.4516, lon: -80.4925 },
  'waterloo': { lat: 43.4643, lon: -80.5204 },
  'cambridge': { lat: 43.3616, lon: -80.3144 },
  'barrie': { lat: 44.3894, lon: -79.6903 },
  'london': { lat: 42.9849, lon: -81.2453 },
  'windsor': { lat: 42.3149, lon: -83.0364 },
  'kingston': { lat: 44.2312, lon: -76.4860 },
  'ottawa': { lat: 45.4215, lon: -75.6972 },
  'sudbury': { lat: 46.4917, lon: -80.9930 },
  'thunder bay': { lat: 48.3809, lon: -89.2477 },
  'niagara falls': { lat: 43.0896, lon: -79.0849 },
  'st. catharines': { lat: 43.1594, lon: -79.2469 },

  // Quebec
  'montreal': { lat: 45.5017, lon: -73.5673 },
  'laval': { lat: 45.5699, lon: -73.6920 },
  'longueuil': { lat: 45.5312, lon: -73.5181 },
  'brossard': { lat: 45.4667, lon: -73.4500 },
  'quebec city': { lat: 46.8139, lon: -71.2080 },
  'quebec': { lat: 46.8139, lon: -71.2080 },
  'gatineau': { lat: 45.4765, lon: -75.7013 },

  // British Columbia
  'vancouver': { lat: 49.2827, lon: -123.1207 },
  'burnaby': { lat: 49.2488, lon: -122.9805 },
  'surrey': { lat: 49.1913, lon: -122.8490 },
  'richmond': { lat: 49.1666, lon: -123.1336 },
  'coquitlam': { lat: 49.2838, lon: -122.7932 },
  'langley': { lat: 49.1042, lon: -122.6604 },
  'north vancouver': { lat: 49.3163, lon: -123.0688 },
  'victoria': { lat: 48.4284, lon: -123.3656 },
  'kelowna': { lat: 49.8880, lon: -119.4960 },

  // Alberta & Prairie
  'calgary': { lat: 51.0447, lon: -114.0719 },
  'edmonton': { lat: 53.5461, lon: -113.4938 },
  'winnipeg': { lat: 49.8951, lon: -97.1384 },
  'saskatoon': { lat: 52.1332, lon: -106.6700 },
  'regina': { lat: 50.4452, lon: -104.6189 },

  // Atlantic
  'halifax': { lat: 44.6488, lon: -63.5752 },
  'moncton': { lat: 46.0878, lon: -64.7782 },
  'saint john': { lat: 45.2733, lon: -66.0633 },
  'fredericton': { lat: 45.9636, lon: -66.6431 },
  'st. john\'s': { lat: 47.5615, lon: -52.7126 },
  'charlottetown': { lat: 46.2382, lon: -63.1311 },

  // United States Metros
  'new york': { lat: 40.7128, lon: -74.0060 },
  'nyc': { lat: 40.7128, lon: -74.0060 },
  'brooklyn': { lat: 40.6782, lon: -73.9442 },
  'manhattan': { lat: 40.7831, lon: -73.9712 },
  'queens': { lat: 40.7282, lon: -73.7949 },
  'jersey city': { lat: 40.7178, lon: -74.0431 },
  'los angeles': { lat: 34.0522, lon: -118.2437 },
  'san francisco': { lat: 37.7749, lon: -122.4194 },
  'san jose': { lat: 37.3382, lon: -121.8863 },
  'oakland': { lat: 37.8044, lon: -122.2712 },
  'seattle': { lat: 47.6062, lon: -122.3321 },
  'bellevue': { lat: 47.6101, lon: -122.2015 },
  'chicago': { lat: 41.8781, lon: -87.6298 },
  'austin': { lat: 30.2672, lon: -97.7431 },
  'boston': { lat: 42.3601, lon: -71.0589 },
  'cambridge': { lat: 42.3736, lon: -71.1097 },
  'washington': { lat: 38.9072, lon: -77.0369 },
  'dallas': { lat: 32.7767, lon: -96.7970 },
  'houston': { lat: 29.7604, lon: -95.3698 },
  'denver': { lat: 39.7392, lon: -104.9903 },
  'atlanta': { lat: 33.7490, lon: -84.3880 },
  'miami': { lat: 25.7617, lon: -80.1918 },

  // Global Hubs
  'london, uk': { lat: 51.5074, lon: -0.1278 },
  'berlin': { lat: 52.5200, lon: 13.4050 },
  'paris': { lat: 48.8566, lon: 2.3522 },
  'singapore': { lat: 1.3521, lon: 103.8198 },
  'sydney': { lat: -33.8688, lon: 151.2093 },
  'melbourne': { lat: -37.8136, lon: 144.9631 },
  'dubai': { lat: 25.2048, lon: 55.2708 },
  'tokyo': { lat: 35.6762, lon: 139.6503 },
  'bengaluru': { lat: 12.9716, lon: 77.5946 },
  'bangalore': { lat: 12.9716, lon: 77.5946 }
});

function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's mean radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

function resolveCoordinates(loc) {
  if (!loc || typeof loc !== 'string') return null;
  const clean = loc.toLowerCase().replace(/^(location|lieu)\s*[:\-]?\s*/i, '').trim();
  const parts = clean.split(/[,\(\)\/]/).map(p => p.trim()).filter(Boolean);
  for (const p of parts) {
    if (CITY_COORDINATES[p]) return CITY_COORDINATES[p];
  }
  for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
    if (clean.includes(key)) return coords;
  }
  return null;
}

function calculateCommuteDistanceKm(jobLoc, candidateLocations = []) {
  if (!jobLoc) return 999;
  const candList = Array.isArray(candidateLocations) ? candidateLocations : [candidateLocations];
  const jCoords = resolveCoordinates(jobLoc);

  let minDistance = 999;

  for (const candLoc of candList) {
    if (!candLoc) continue;
    const cCoords = resolveCoordinates(candLoc);

    if (jCoords && cCoords) {
      const d = calculateHaversineDistanceKm(cCoords.lat, cCoords.lon, jCoords.lat, jCoords.lon);
      if (d < minDistance) minDistance = d;
      continue;
    }

    // Heuristic fallbacks if exact GPS coordinates are unmapped
    const jClean = (jobLoc || '').toLowerCase().replace(/^(location|lieu)\s*[:\-]?\s*/i, '').trim();
    const cClean = (candLoc || '').toLowerCase().trim();
    const cFirst = cClean.split(',')[0].trim();

    if (jClean.includes(cFirst) || cClean.includes(jClean.split(',')[0].trim())) {
      if (0 < minDistance) minDistance = 0;
      continue;
    }

    // Metro cluster estimate
    const geo = loadGeoHierarchy();
    let inSameMetro = false;
    let suburbDistance = 35;
    if (Array.isArray(geo.data?.cities)) {
      for (const city of geo.data.cities) {
        const matchesCand = (city.display_city && cClean.includes(city.display_city.toLowerCase().split(',')[0].trim())) ||
                            (city.names && city.names.some(n => cClean.includes(n.toLowerCase())));
        if (matchesCand) {
          const matchesJob = (city.display_city && jClean.includes(city.display_city.toLowerCase().split(',')[0].trim())) ||
                             (city.names && city.names.some(n => jClean.includes(n.toLowerCase())));
          if (matchesJob) {
            inSameMetro = true;
            // Check borough vs suburb
            if (/\b(north york|east york|york|etobicoke)\b/i.test(jClean)) suburbDistance = 12;
            else if (/\b(mississauga|markham|vaughan|richmond hill)\b/i.test(jClean)) suburbDistance = 23;
            else if (/\b(brampton|oakville|milton|pickering|ajax|whitby|burlington)\b/i.test(jClean)) suburbDistance = 35;
            break;
          }
        }
      }
    }

    if (inSameMetro && suburbDistance < minDistance) {
      minDistance = suburbDistance;
    }
  }

  return minDistance;
}

function calculateLocationFitScore(jobLoc, candidateLocations = [], countryScope = 'GLOBAL', isJobRemote = false, candidateWorkType = 'Open to All', commuteRadiusKm = 25, jobDesc = '') {
  if (!jobLoc || typeof jobLoc !== 'string') return 80;
  const lower = jobLoc.toLowerCase().trim();
  const descText = String(jobDesc || '').toLowerCase();
  const candLocsText = (Array.isArray(candidateLocations) ? candidateLocations.join(' ') : String(candidateLocations || '')).toLowerCase();
  const pref = (candidateWorkType || 'Open to All').toLowerCase().trim();

  const hasNegativeRemote = isExplicitlyNegativeRemote(lower) || isExplicitlyNegativeRemote(descText);
  const isDetectedRemote = !hasNegativeRemote && (
    isJobRemote ||
    /^(worldwide|global|remote|anywhere)$/i.test(lower) ||
    /\b(remote|work from home|wfh|telecommute|virtual|anywhere)\b/i.test(lower) ||
    /\(remote\)|-\s*remote|remote\s*in\b|canada\s*wide\s*remote|remote\s*across/i.test(lower) ||
    /\b(100% remote|fully remote|remote work available across|remote across canada|remote anywhere in canada)\b/i.test(descText)
  );

  // 1. Check basic country eligibility & city bounds
  const eligible = isJobLocationEligible(jobLoc, candidateLocations, countryScope, isDetectedRemote, descText);
  if (!eligible) return 15;

  // 2. Candidate wants Remote-only but job is strictly onsite or negative-remote
  if (pref.includes('remote') && !pref.includes('hybrid') && (hasNegativeRemote || !isDetectedRemote)) {
    return 15;
  }

  // 3. Remote within candidate's country scope -> Always 100% (zero travel required)
  if (isDetectedRemote) {
    return 100;
  }

  // 4. If candidate explicitly specified nationwide or worldwide
  const allowsAll = isCandidateExplicitNationwide(candidateLocations, countryScope) || /worldwide|global|anywhere/i.test(candLocsText);
  if (allowsAll) {
    return 85;
  }

  // 5. Dynamic Radial Gradient Scoring for Onsite / Hybrid Positions
  const R = (typeof commuteRadiusKm === 'number' && !isNaN(commuteRadiusKm)) ? Math.max(0, Math.min(100, commuteRadiusKm)) : 25;
  const distanceKm = calculateCommuteDistanceKm(jobLoc, candidateLocations);

  // Exact 0 km / walk distance
  if (distanceKm <= 2) {
    return 100;
  }

  // If user set 0 km radius, require exact city match
  if (R <= 0) {
    return distanceKm <= 2 ? 100 : 15;
  }

  // Bracket Zones:
  // Zone 1: Immediate Core (<= 0.20 * R): 90-100% gradient
  // Zone 2: Inner Commute / Suburbs (<= 0.50 * R or 0.60 * R for R=25): 80-90% gradient
  // Zone 3: Outer Commuter Ring (<= 1.00 * R): 70-80% gradient
  // Zone 4: Beyond Radius (> R): <= 20% (15%)
  const z1 = 0.20 * R;
  const z2 = (R <= 25) ? (0.60 * R) : (0.50 * R);
  const z3 = 1.00 * R;

  if (distanceKm <= z1) {
    return Math.round(100 - 10 * (distanceKm / z1));
  } else if (distanceKm <= z2) {
    return Math.round(90 - 10 * ((distanceKm - z1) / (z2 - z1)));
  } else if (distanceKm <= z3) {
    return Math.round(80 - 10 * ((distanceKm - z2) / (z3 - z2)));
  } else {
    // Outside commute tolerance!
    return 15;
  }
}

function isJobWorkplaceEligible(jobLoc, jobDesc = '', jobTitle = '', candidateWorkType = 'Open to All', isExplicitRemoteSource = false) {
  if (!candidateWorkType || candidateWorkType === 'Open to All' || candidateWorkType === 'Any') return true;
  const pref = candidateWorkType.toLowerCase().trim();
  const text = `${jobLoc || ''} ${jobTitle || ''} ${jobDesc || ''}`.toLowerCase();

  const hasNegativeRemote = isExplicitlyNegativeRemote(text);
  const isRemoteJob = !hasNegativeRemote && (isExplicitRemoteSource || /\b(remote|work from home|wfh|telecommute|virtual|anywhere)\b/i.test(text));
  const isHybridJob = /\b(hybrid|flexible work model|in-office \d days|partially remote)\b/i.test(text);
  const isStrictlyOnsite = hasNegativeRemote || /\b(100% on-site|on-site only|in-person only|no remote|must be in office 5 days)\b/i.test(text);

  if (pref.includes('remote') && !pref.includes('hybrid')) {
    return isRemoteJob && !isStrictlyOnsite && !isHybridJob;
  }
  if (pref.includes('onsite') || pref.includes('on-site')) {
    return !isRemoteJob;
  }
  if (pref.includes('hybrid')) {
    return isHybridJob || isRemoteJob || !isStrictlyOnsite;
  }
  return true;
}

const SENIORITY_MODIFIERS = new Set([
  'senior', 'sr', 'junior', 'jr', 'intermediate', 'lead', 'principal', 'staff', 
  'associate', 'intern', 'internship', 'entry', 'level', 'mid', 'experienced', 
  'trainee', 'apprentice', 'student', 'co-op', 'coop', 'i', 'ii', 'iii', 'iv', 'v'
]);

const GENERIC_ROLE_NOUNS = new Set([
  'developer', 'engineer', 'analyst', 'specialist', 'consultant', 'scientist', 
  'architect', 'designer', 'manager', 'director', 'officer', 'coordinator', 
  'administrator', 'lead', 'assistant', 'practitioner', 'technician', 'expert',
  'representative', 'worker', 'operator', 'owner', 'programmer'
]);

const ROLE_NOUN_FAMILIES = {
  developer: new Set(['developer', 'engineer', 'programmer', 'architect', 'specialist']),
  engineer: new Set(['developer', 'engineer', 'programmer', 'architect', 'specialist']),
  analyst: new Set(['analyst', 'specialist', 'scientist', 'consultant', 'researcher']),
  specialist: new Set(['specialist', 'analyst', 'consultant', 'expert', 'engineer', 'developer']),
  scientist: new Set(['scientist', 'researcher', 'engineer', 'analyst', 'specialist']),
  manager: new Set(['manager', 'director', 'lead', 'head', 'owner']),
  owner: new Set(['owner', 'manager', 'lead']),
  nurse: new Set(['nurse', 'practitioner', 'coordinator']),
  accountant: new Set(['accountant', 'controller', 'auditor', 'analyst']),
  recruiter: new Set(['recruiter', 'sourcer', 'partner']),
  designer: new Set(['designer', 'researcher', 'architect'])
};

const ROLE_STOP_WORDS = new Set([
  'of', 'and', '&', 'the', 'in', 'for', 'at', 'to', 'a', 'an', 'with', 'by', 'on', 'from'
]);

function normalizeRoleToken(token) {
  return token.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function stemRoleToken(token) {
  if (token.startsWith('analy')) return 'analy';
  if (token.startsWith('data') || token.startsWith('databa')) return 'data';
  if (token.startsWith('report')) return 'report';
  if (token.startsWith('program')) return 'program';
  if (token.startsWith('manage')) return 'manage';
  if (token.startsWith('market')) return 'market';
  if (token.startsWith('financ')) return 'financ';
  if (token.startsWith('account')) return 'account';
  if (token.startsWith('nurs')) return 'nurs';
  if (token.startsWith('clinic')) return 'clinic';
  if (token.startsWith('soft')) return 'softwar';
  if (token.startsWith('develop')) return 'develop';
  if (token.startsWith('product')) return 'product';
  if (token.startsWith('secur')) return 'secur';
  if (token.length > 5) {
    if (token.endsWith('ing')) return token.slice(0, -3);
    if (token.endsWith('ies')) return token.slice(0, -3) + 'y';
    if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
    if (token.endsWith('tion')) return token.slice(0, -4);
    if (token.endsWith('ment')) return token.slice(0, -4);
  }
  return token;
}

function expandHyphenatedTokens(text) {
  const tokens = [];
  text.toLowerCase().split(/[\s,\/]+/).forEach(chunk => {
    if (chunk.includes('-')) {
      tokens.push(normalizeRoleToken(chunk)); // e.g. "back-end" -> "backend"
      chunk.split('-').forEach(sub => tokens.push(normalizeRoleToken(sub)));
    } else {
      tokens.push(normalizeRoleToken(chunk));
    }
  });
  return tokens.filter(t => t && t.length >= 2);
}

/**
 * Universal Agnostic Role Relevance Evaluator
 * Supports ANY profession (Data, Engineering, Healthcare, Finance, HR, Operations, etc.)
 * Dynamically compares candidate target titles against incoming jobs using linguistic decomposition:
 *   [Seniority Modifier] + [Domain Core] + [Functional Role Noun]
 * Zero hardcoded job titles or industry blacklists.
 */
function isJobRoleRelevant(jobTitle, targetTitles = []) {
  if (!jobTitle || typeof jobTitle !== 'string') return false;
  if (!Array.isArray(targetTitles) || targetTitles.length === 0) return true;

  const titleLower = jobTitle.toLowerCase().trim();

  // 1. Language Guard (Canada / US non-English postings filtered unless candidate specifies bilingual)
  if (/\b(français|francais|\(fr\)|-fr)\b/i.test(titleLower) && !targetTitles.some(t => /french|bilingual|français/i.test(t))) {
    return false;
  }

  // 2. Hierarchy & Seniority Alignment (Dynamically derived from candidate intent)
  const wantsExec = targetTitles.some(t => /\b(director|vp|vice president|head of|chief|svp|avp)\b/i.test(t));
  const wantsManager = wantsExec || targetTitles.some(t => /\b(manager|management)\b/i.test(t));
  const wantsLead = targetTitles.some(t => /\b(lead|principal|staff|architect)\b/i.test(t));
  const wantsStudent = targetTitles.some(t => /\b(intern|internship|co-op|student)\b/i.test(t));

  const isExecTitle = /\b(director|vp|vice president|head of|chief|svp|avp)\b/i.test(titleLower);
  const isManagerTitle = (/\b(manager|general manager)\b/i.test(titleLower) || isExecTitle) && !/\b(product manager|project manager)\b/i.test(targetTitles.join(' '));
  const isLeadTitle = /\b(team lead|tech lead|technical lead|lead analyst|lead developer|lead engineer|reporting lead|solutions lead|principal)\b/i.test(titleLower);
  const isStudentTitle = /\b(intern|internship|co-op|coop|\bstudent\b|undergraduate intern)\b/i.test(titleLower);

  // Reject seniority tiers the candidate has not requested
  if (isExecTitle && !wantsExec) return false;
  if (isManagerTitle && !wantsManager && !/\b(manager)\b/i.test(targetTitles.join(' '))) return false;
  if (isLeadTitle && !wantsLead) return false;
  if (isStudentTitle && !wantsStudent) return false;

  // 3. Domain Boundary Guards (Filter out cross-industry false positive traps)
  // A. Electrical / Power Grid trap: e.g. "Power Systems Senior Consultant (Power Grid SME)"
  const isPowerGridJob = /\b(power systems?|power grid|power plant|substation|high voltage|electrical utility|transmission lines?)\b/i.test(titleLower);
  const wantsPowerGrid = targetTitles.some(t => /\b(power systems?|power grid|electrical|substation|utility)\b/i.test(t));
  if (isPowerGridJob && !wantsPowerGrid) return false;

  // B. Cybersecurity / Data Loss Prevention (DLP) trap: e.g. "Senior Specialist, Data Loss Prevention"
  const isDlpSecurityJob = /\b(data loss prevention|dlp|cyber\s*threat|soc analyst|penetration test)\b/i.test(titleLower);
  const wantsDlpSecurity = targetTitles.some(t => /\b(data loss prevention|dlp|cyber|security|infosec|soc)\b/i.test(t));
  if (isDlpSecurityJob && !wantsDlpSecurity) return false;

  // C. Enterprise Data Architect trap: (requires 10+ years architecture)
  const isArchitectTitle = /\b(data architect|enterprise architect|solution architect|cloud architect)\b/i.test(titleLower);
  const wantsArchitect = targetTitles.some(t => /\b(architect)\b/i.test(t));
  if (isArchitectTitle && !wantsArchitect) return false;

  // D. Data Scientist trap: (requires ML/statistical research background)
  const isScientistTitle = /\b(data scientist|research scientist|machine learning scientist)\b/i.test(titleLower);
  const wantsScientist = targetTitles.some(t => /\b(scientist|machine learning|data science)\b/i.test(t));
  if (isScientistTitle && !wantsScientist) return false;

  // 4. Direct exact or boundary-checked substring match with target titles
  for (const target of targetTitles) {
    if (!target) continue;
    const targetLower = target.toLowerCase().trim();
    const regex = new RegExp('\\b' + targetLower.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'i');
    if (regex.test(titleLower)) return true;
  }

  // 4. Universal Dynamic Domain Core & Role Type Extraction
  const targetDomainTokens = new Set();
  const targetDomainStems = new Set();
  const allowedRoleNouns = new Set();

  targetTitles.forEach(t => {
    const tokens = expandHyphenatedTokens(t);
    tokens.forEach(clean => {
      if (ROLE_STOP_WORDS.has(clean) || SENIORITY_MODIFIERS.has(clean)) return;
      if (GENERIC_ROLE_NOUNS.has(clean)) {
        allowedRoleNouns.add(clean);
        // Expand compatible role noun family
        if (ROLE_NOUN_FAMILIES[clean]) {
          ROLE_NOUN_FAMILIES[clean].forEach(fam => allowedRoleNouns.add(fam));
        }
        // Dual nouns: 'analyst' also carries the 'analy' (analytics) domain root
        if (clean === 'analyst') {
          targetDomainStems.add('analy');
        }
      } else {
        targetDomainTokens.add(clean);
        targetDomainStems.add(stemRoleToken(clean));
      }
    });
  });

  const jobTokens = expandHyphenatedTokens(titleLower).filter(w => !ROLE_STOP_WORDS.has(w));
  
  // Count domain matches (excluding seniority modifiers and generic role nouns)
  const matchedDomainTokens = jobTokens.filter(w => 
    !SENIORITY_MODIFIERS.has(w) && 
    !GENERIC_ROLE_NOUNS.has(w) && 
    (targetDomainTokens.has(w) || targetDomainStems.has(stemRoleToken(w)) || (w.startsWith('data') && targetDomainTokens.has('data')))
  );

  const hasRoleNounMatch = jobTokens.some(w => allowedRoleNouns.has(w));

  // Acceptance Rules:
  // Rule A: Matches at least 1 core domain token/stem AND has a compatible role noun
  if (matchedDomainTokens.length >= 1 && hasRoleNounMatch) return true;

  // Rule B: Matches 2 or more distinct domain core tokens
  if (matchedDomainTokens.length >= 2) return true;

  // Rule C: If job title is brief (1-2 words) and matches domain core
  if (jobTokens.length <= 2 && matchedDomainTokens.length >= 1) return true;

  return false;
}


// ── 4. Utilities for Analytics ──────────────────────────────────────────────
function calculateExperienceYears(profile) {
  if (!profile) return 0;
  if (typeof profile.years_of_experience === 'number') return profile.years_of_experience;

  let totalMonths = 0, minStart = new Date().getFullYear(), maxEnd = 1970;
  const experiences = Array.isArray(profile.experience) ? profile.experience : [];
  
  experiences.forEach(exp => {
    const years = String(exp?.dates || '').match(/\b(19\d\d|20\d\d)\b/g);
    if (years && years.length >= 1) {
      const y1 = parseInt(years[0]);
      const y2 = years.length >= 2 ? parseInt(years[1]) : minStart;
      if (y1 < minStart) minStart = y1;
      if (y2 > maxEnd) maxEnd = y2;
    }
  });

  return maxEnd >= minStart ? Math.min(30, Math.max(1, maxEnd - minStart + 1)) : Math.min(20, Math.max(1, experiences.length * 2));
}

function generateSmartRoleSuggestions(profile) {
  const years = calculateExperienceYears(profile);
  let titles = Array.isArray(profile?.target_titles) && profile.target_titles.length > 0 ? profile.target_titles : [];
  if (titles.length === 0 && Array.isArray(profile?.experience) && profile.experience.length > 0) {
    titles = profile.experience.map(e => e.role).filter(Boolean);
  }
  if (titles.length === 0) titles = ['Target Role'];

  const primaryRole = titles[0] || 'Target Role';
  const prefix = years >= 8 ? 'Lead' : (years >= 4 ? 'Senior' : 'Associate');
  const seniorityRole = primaryRole.toLowerCase().startsWith('senior') || primaryRole.toLowerCase().startsWith('lead') || primaryRole.toLowerCase().startsWith('associate')
    ? primaryRole
    : `${prefix} ${primaryRole}`;

  const variationsSet = new Set(titles);
  if (seniorityRole) variationsSet.add(seniorityRole);
  const variations = Array.from(variationsSet);

  return {
    primaryRole,
    yearsOfExp: years,
    seniorityRole,
    suggestedRoles: variations,
    variationsStr: variations.join('; ')
  };
}

// ── 5. Conversational Onboarding Location Helpers ───────────────────────────
function extractLocationOptions(profile) {
  const geo = loadGeoHierarchy();
  const rawLoc = (
    profile?.contact?.location ||
    (Array.isArray(profile?.locations) ? profile.locations.join(' ') : profile?.locations) ||
    ''
  ).toLowerCase();

  let matchedCity = null;
  let matchedProv = null;
  let matchedState = null;

  if (Array.isArray(geo.data?.cities)) {
    for (const c of geo.data.cities) {
      if (Array.isArray(c.names) && c.names.some(n => rawLoc.includes(n.toLowerCase()))) {
        matchedCity = c;
        break;
      }
    }
  }

  if (Array.isArray(geo.data?.canadian_provinces)) {
    for (const p of geo.data.canadian_provinces) {
      if (rawLoc.includes(p.name.toLowerCase()) || (p.code && new RegExp(`\\b${p.code}\\b`, 'i').test(rawLoc))) {
        matchedProv = p;
        break;
      }
    }
  }

  if (Array.isArray(geo.data?.us_states)) {
    for (const s of geo.data.us_states) {
      if (rawLoc.includes(s.name.toLowerCase()) || (s.code && new RegExp(`\\b${s.code}\\b`, 'i').test(rawLoc))) {
        matchedState = s;
        break;
      }
    }
  }

  const options = [];

  if (matchedCity) {
    const cityLabel = matchedCity.metro || matchedCity.display_city;
    options.push(cityLabel);

    if (matchedCity.country_code === 'CA') {
      const provName = matchedCity.region || (matchedProv ? matchedProv.name : 'Ontario');
      options.push(`${provName} (Province-wide)`);
      options.push('Canada (All Provinces / Nationwide)');
      options.push('United States (All States / Nationwide)');
      options.push('North America (US & Canada)');
      options.push('Worldwide / Global Remote');
    } else {
      const stateName = matchedCity.region || (matchedState ? matchedState.name : 'State');
      options.push(`${stateName} (State-wide)`);
      options.push('United States (All States / Nationwide)');
      options.push('Canada (All Provinces / Nationwide)');
      options.push('North America (US & Canada)');
      options.push('Worldwide / Global Remote');
    }
  } else if (matchedProv) {
    options.push(`${matchedProv.name} (Province-wide)`);
    options.push('Canada (All Provinces / Nationwide)');
    options.push('United States (All States / Nationwide)');
    options.push('North America (US & Canada)');
    options.push('Worldwide / Global Remote');
  } else if (matchedState) {
    options.push(`${matchedState.name} (State-wide)`);
    options.push('United States (All States / Nationwide)');
    options.push('Canada (All Provinces / Nationwide)');
    options.push('North America (US & Canada)');
    options.push('Worldwide / Global Remote');
  } else {
    options.push('Canada (All Provinces / Nationwide)');
    options.push('United States (All States / Nationwide)');
    options.push('North America (US & Canada)');
    options.push('Worldwide / Global Remote');
  }

  return [...new Set(options.filter(Boolean))];
}

function parseSmartLocations(inputStr) {
  if (!inputStr || typeof inputStr !== 'string') return [];
  const parts = inputStr.split(/[;,|\r\n]+/).map(s => s.trim()).filter(Boolean);
  return parts.map(formatLocationName).filter(Boolean);
}

function expandCustomLocationsWithGeo(text) {
  const geo = loadGeoHierarchy();
  const parsed = parseSmartLocations(text);
  if (parsed.length === 0) return { locations: ['Worldwide / Global Remote'], note: '' };

  const finalLocs = [];
  let note = '';

  for (const loc of parsed) {
    const lower = loc.toLowerCase();
    let foundCity = null;

    if (Array.isArray(geo.data?.cities)) {
      foundCity = geo.data.cities.find(c =>
        Array.isArray(c.names) && c.names.some(n => lower === n.toLowerCase() || lower.includes(n.toLowerCase()))
      );
    }

    if (foundCity) {
      finalLocs.push(foundCity.metro || foundCity.display_city);
      if (foundCity.metro && !note) {
        note = `💡 Linked to ${foundCity.metro} metropolitan cluster.`;
      }
    } else {
      finalLocs.push(loc);
    }
  }

  return {
    locations: [...new Set(finalLocs.filter(Boolean))],
    note
  };
}

function harmonizeLocationAndWorkType(locations, workType, fallbackDetectedCity = null) {
  let finalLocs = Array.isArray(locations) ? [...locations] : (locations ? [locations] : []);
  if (finalLocs.length === 0 && fallbackDetectedCity) {
    finalLocs.push(fallbackDetectedCity);
  }
  
  const lowerWork = (workType || 'Open to All').toLowerCase();
  const isRemoteOnly = lowerWork.includes('remote only') || lowerWork === 'remote';
  const isHybrid = lowerWork.includes('hybrid');
  const isOnsite = lowerWork.includes('onsite');
  
  let note = '';
  if (isRemoteOnly) {
    note = '🌐 Configured for 100% remote job matching in your target location.';
  } else if (isHybrid) {
    note = '🏢 Configured for hybrid & remote opportunities.';
  } else if (isOnsite) {
    note = '📍 Open to onsite, hybrid, and remote roles.';
  }
  
  return {
    locations: [...new Set(finalLocs.filter(Boolean))],
    work_type: workType || 'Open to All',
    harmonizationNote: note
  };
}

// ── 13. Real-Time Edge Geocoding & Country-Scoped Search ─────────────────────
const liveGeocodingCache = new Map();
const GEOCODING_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function searchLiveCities(query, countryCode) {
  const cleanQuery = (query || '').trim().toLowerCase();
  if (!cleanQuery || cleanQuery.length < 2) return [];

  const scope = (countryCode || 'ALL').toUpperCase().trim();
  const cacheKey = `${scope}:${cleanQuery}`;

  const now = Date.now();
  if (liveGeocodingCache.has(cacheKey)) {
    const entry = liveGeocodingCache.get(cacheKey);
    if (entry.expiresAt > now) {
      return entry.data;
    }
    liveGeocodingCache.delete(cacheKey);
  }

  // Country scoping validator
  const isCountryMatch = (code) => {
    if (!code) return false;
    const c = code.toUpperCase();
    if (scope === 'ALL' || scope === 'GLOBAL' || scope === 'AUTO') return true;
    if (scope === 'US_CA') return c === 'US' || c === 'CA';
    return c === scope;
  };

  let results = [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const apiUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanQuery)}&count=15&language=en&format=json`;
    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.results)) {
        // Fast map of US/CA state/province names to 2-letter codes
        const stateCodeMap = {
          alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
          connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
          illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
          maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
          mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
          'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
          'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
          pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
          tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
          'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
          ontario: 'ON', quebec: 'QC', 'british columbia': 'BC', alberta: 'AB', manitoba: 'MB',
          saskatchewan: 'SK', 'nova scotia': 'NS', 'new brunswick': 'NB', 'newfoundland and labrador': 'NL',
          'prince edward island': 'PE', 'northwest territories': 'NT', nunavut: 'NU', yukon: 'YT'
        };

        for (const r of data.results) {
          const itemCountryCode = (r.country_code || '').toUpperCase();
          if (!isCountryMatch(itemCountryCode)) continue;

          const rawRegion = (r.admin1 || '').trim();
          let region = rawRegion;
          const lowerRegion = rawRegion.toLowerCase();
          if (stateCodeMap[lowerRegion]) {
            region = stateCodeMap[lowerRegion];
          }

          let country = r.country || itemCountryCode;
          if (itemCountryCode === 'US' || /united states|usa/i.test(country)) {
            country = 'USA';
          } else if (itemCountryCode === 'CA' || /canada/i.test(country)) {
            country = 'Canada';
          } else if (itemCountryCode === 'GB' || /united kingdom|uk/i.test(country)) {
            country = 'UK';
          }

          const formatted = `${r.name}, ${region ? region + ', ' : ''}${country}`;

          results.push({
            city: r.name,
            region: region,
            country: country,
            country_code: itemCountryCode,
            formatted: formatted,
            source: 'live_geocoding'
          });
        }
      }
    }
  } catch (err) {
    // Non-fatal: if offline or timed out, fall back gracefully to local dataset
  }

  // Merge with local dataset matches to guarantee coverage
  try {
    const globalCitiesPath = path.join(__dirname, '..', '..', 'public', 'data', 'global-cities.json');
    if (fs.existsSync(globalCitiesPath)) {
      const globalData = JSON.parse(fs.readFileSync(globalCitiesPath, 'utf8'));
      let localPool = [];
      if (scope === 'ALL' || scope === 'GLOBAL' || scope === 'AUTO') {
        for (const meta of Object.values(globalData.by_country || {})) {
          if (Array.isArray(meta.cities)) localPool.push(...meta.cities);
        }
      } else if (scope === 'US_CA') {
        if (globalData.by_country?.US?.cities) localPool.push(...globalData.by_country.US.cities);
        if (globalData.by_country?.CA?.cities) localPool.push(...globalData.by_country.CA.cities);
      } else if (globalData.by_country?.[scope]?.cities) {
        localPool.push(...globalData.by_country[scope].cities);
      }

      const matchingLocal = localPool.filter(c =>
        c.city.toLowerCase().includes(cleanQuery) ||
        (c.formatted && c.formatted.toLowerCase().includes(cleanQuery))
      );

      for (const loc of matchingLocal) {
        if (!results.some(r => r.city.toLowerCase() === loc.city.toLowerCase() && r.country_code === loc.country_code)) {
          results.push({
            city: loc.city,
            region: loc.region || '',
            country: loc.country_name || loc.country_code,
            country_code: loc.country_code,
            formatted: loc.formatted,
            source: 'major_city'
          });
        }
      }
    }
  } catch (_) {}

  // Deduplicate results
  const seen = new Set();
  const uniqueResults = [];
  for (const item of results) {
    const key = `${item.city.toLowerCase()}|${item.region.toLowerCase()}|${item.country_code}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueResults.push(item);
    }
  }

  // Cache results
  if (liveGeocodingCache.size > 500) {
    const oldestKey = liveGeocodingCache.keys().next().value;
    if (oldestKey) liveGeocodingCache.delete(oldestKey);
  }
  liveGeocodingCache.set(cacheKey, { data: uniqueResults, expiresAt: now + GEOCODING_CACHE_TTL_MS });

  return uniqueResults;
}

module.exports = {
  loadGeoHierarchy,
  formatLocationName,
  detectTargetCountryScope,
  getSearchLocationQuery,
  isJobLocationEligible,
  isJobWorkplaceEligible,
  isJobRoleRelevant,
  calculateExperienceYears,
  generateSmartRoleSuggestions,
  extractLocationOptions,
  parseSmartLocations,
  expandCustomLocationsWithGeo,
  harmonizeLocationAndWorkType,
  detectCandidateTimezone,
  searchLiveCities,
  calculateLocationFitScore,
  isExplicitlyNegativeRemote,
  calculateHaversineDistanceKm,
  resolveCoordinates,
  calculateCommuteDistanceKm,
  CITY_COORDINATES,
  SUPPORTED_COUNTRIES,
  COUNTRY_PATTERNS
};
