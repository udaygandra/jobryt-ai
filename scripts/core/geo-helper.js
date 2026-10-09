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
  if (!profileObj || typeof profileObj !== 'object') {
    return process.env.TIMEZONE || 'America/Toronto';
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
    return process.env.TIMEZONE || 'America/Toronto';
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

  // International checks
  if (/\b(uk|united kingdom|london|england|great britain)\b/i.test(locText)) {
    return 'Europe/London';
  }
  if (/\b(india|delhi|mumbai|bangalore|hyderabad|bengaluru|pune|chennai|warangal)\b/i.test(locText)) {
    return 'Asia/Kolkata';
  }
  if (/\b(sydney|melbourne|brisbane|australia)\b/i.test(locText)) {
    return 'Australia/Sydney';
  }

  // Default fallback based on country scope
  const countryScope = detectTargetCountryScope(locList);
  if (countryScope === 'US') return 'America/New_York';
  return process.env.TIMEZONE || 'America/Toronto';
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

// ── 3. Candidate Matching Logic ─────────────────────────────────────────────
function isJobLocationEligible(jobLoc, candidateLocations = [], countryScope = 'CA', isJobRemote = false) {
  if (!jobLoc || typeof jobLoc !== 'string') return true;
  const lower = jobLoc.toLowerCase().trim();
  const geo = loadGeoHierarchy();

  // 1. Determine if job is located in Canada
  let isCanada = /\bcanada\b/i.test(lower) || /\bremote\s*[-–(,]?\s*ca\b/i.test(lower);
  if (!isCanada && Array.isArray(geo.data?.cities)) {
    isCanada = geo.data.cities.some(c => c.country_code === 'CA' && Array.isArray(c.names) && c.names.some(n => lower === n || lower.includes(n)));
  }
  if (!isCanada && Array.isArray(geo.data?.canadian_provinces)) {
    isCanada = geo.data.canadian_provinces.some(p => lower.includes(p.name.toLowerCase()) || new RegExp(`(,\\s*|\\b)${p.code}(\\b|\\s*$)`, 'i').test(lower));
  }

  // 2. Determine if job is located in the US
  let isUS = /\b(usa|united states|u\.s\.)\b/i.test(lower) || /\bremote\s*[-–(,]?\s*us(a)?\b/i.test(lower);
  if (!isUS && Array.isArray(geo.data?.cities)) {
    isUS = geo.data.cities.some(c => c.country_code === 'US' && Array.isArray(c.names) && c.names.some(n => lower === n || lower.includes(n)));
  }
  if (!isUS && Array.isArray(geo.data?.us_states)) {
    isUS = geo.data.us_states.some(s => (s.code === 'CA' ? (!isCanada && (new RegExp(`,\\s*ca(\\b|\\s*$)`, 'i').test(lower) || /\bcalifornia\b/i.test(lower))) : (lower.includes(s.name.toLowerCase()) || new RegExp(`(,\\s*|\\b)${s.code}(\\b|\\s*$)`, 'i').test(lower))));
  }

  const isGlobal = /^(worldwide|global|remote|anywhere|north america|americas|any)$/i.test(lower) || /\b(worldwide|anywhere|north america|americas)\b/i.test(lower);
  const candLocsText = (Array.isArray(candidateLocations) ? candidateLocations.join(' ') : String(candidateLocations || '')).toLowerCase();
  const candidateAllowsWorldwide = /worldwide|global|anywhere/i.test(candLocsText);
  const isDetectedRemote = isJobRemote || isGlobal || /\b(remote|work from home|wfh|telecommute|virtual|anywhere)\b/i.test(lower);

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

  // 4. LINKEDIN MODEL:
  // If the job is REMOTE and within candidate's country scope, it is ELIGIBLE regardless of HQ city!
  // (e.g. A Toronto candidate CAN work for a Vancouver-based or Calgary-based Remote company)
  if (isDetectedRemote) {
    return true;
  }

  // If candidate selected Worldwide / Global, all jobs in country scope are accepted
  if (candidateAllowsWorldwide) return true;

  // Nationwide allowances (e.g. "United States (All States / Nationwide)", "Canada (All Provinces / Nationwide)", "North America")
  const candidateAllowsAllUS = /united states|usa|all states/i.test(candLocsText);
  const candidateAllowsAllCA = /canada|all provinces/i.test(candLocsText);
  const candidateAllowsAllNA = /north america/i.test(candLocsText);

  if (candidateAllowsAllNA && (isUS || isCanada)) return true;
  if (candidateAllowsAllUS && isUS) return true;
  if (candidateAllowsAllCA && isCanada) return true;

  // 5. HYBRID & ONSITE JOBS:
  // Must physically match candidate's target commuting location / metropolitan cluster!
  if (Array.isArray(candidateLocations) && candidateLocations.length > 0) {
    let physicalCityMatch = false;
    const candidateAllowedTokens = new Set();

    for (const candLoc of candidateLocations) {
      if (!candLoc) continue;
      const cLower = candLoc.toLowerCase().trim();
      candidateAllowedTokens.add(cLower);

      if (Array.isArray(geo.data?.cities)) {
        for (const city of geo.data.cities) {
          const isMatch = (city.metro && (cLower.includes(city.metro.toLowerCase()) || city.metro.toLowerCase().includes(cLower))) ||
                          (city.display_city && (cLower.includes(city.display_city.toLowerCase()) || city.display_city.toLowerCase().includes(cLower))) ||
                          (Array.isArray(city.names) && city.names.some(n => cLower.includes(n.toLowerCase())));
          if (isMatch) {
            city.names.forEach(n => candidateAllowedTokens.add(n.toLowerCase()));
            if (city.display_city) candidateAllowedTokens.add(city.display_city.toLowerCase());
            if (city.metro) candidateAllowedTokens.add(city.metro.toLowerCase());
            if (city.province) candidateAllowedTokens.add(city.province.toLowerCase());
            if (city.province_name) candidateAllowedTokens.add(city.province_name.toLowerCase());
            if (city.state) candidateAllowedTokens.add(city.state.toLowerCase());
            if (city.state_name) candidateAllowedTokens.add(city.state_name.toLowerCase());
          }
        }
      }

      // Dynamic province/state expansion from cLower
      if (Array.isArray(geo.data?.canadian_provinces)) {
        for (const p of geo.data.canadian_provinces) {
          if ((p.name && cLower.includes(p.name.toLowerCase())) || (p.code && new RegExp(`\\b${p.code}\\b`, 'i').test(cLower))) {
            if (p.name) candidateAllowedTokens.add(p.name.toLowerCase());
            if (p.code) candidateAllowedTokens.add(p.code.toLowerCase());
          }
        }
      }
      if (Array.isArray(geo.data?.us_states)) {
        for (const s of geo.data.us_states) {
          if ((s.name && cLower.includes(s.name.toLowerCase())) || (s.code && new RegExp(`\\b${s.code}\\b`, 'i').test(cLower))) {
            if (s.name) candidateAllowedTokens.add(s.name.toLowerCase());
            if (s.code) candidateAllowedTokens.add(s.code.toLowerCase());
          }
        }
      }
    }

    for (const token of candidateAllowedTokens) {
      if (token.length < 2) continue;
      if (token.length <= 3) {
        if (new RegExp(`\\b${token.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(lower)) {
          physicalCityMatch = true;
          break;
        }
      } else {
        if (lower.includes(token) || token.includes(lower)) {
          physicalCityMatch = true;
          break;
        }
      }
    }

    if (!physicalCityMatch) return false;
  }

  return true;
}

function isJobWorkplaceEligible(jobLoc, jobDesc = '', jobTitle = '', candidateWorkType = 'Open to All', isExplicitRemoteSource = false) {
  if (!candidateWorkType || candidateWorkType === 'Open to All' || candidateWorkType === 'Any') return true;
  const pref = candidateWorkType.toLowerCase().trim();
  const text = `${jobLoc || ''} ${jobTitle || ''} ${jobDesc || ''}`.toLowerCase();

  const isRemoteJob = isExplicitRemoteSource || /\b(remote|work from home|wfh|telecommute|virtual|anywhere)\b/i.test(text);
  const isHybridJob = /\b(hybrid|flexible work model|in-office \d days|partially remote)\b/i.test(text);
  const isStrictlyOnsite = /\b(100% on-site|on-site only|in-person only|no remote|must be in office 5 days)\b/i.test(text);

  if (pref.includes('remote') && !pref.includes('hybrid')) {
    return !isStrictlyOnsite && (isRemoteJob || (isHybridJob && !isStrictlyOnsite));
  }
  if (pref.includes('hybrid')) {
    return isHybridJob || isRemoteJob || !isStrictlyOnsite;
  }
  return true; // onsite or open to all allows onsite
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

  // 3. Direct exact or boundary-checked substring match with target titles
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

function getSearchLocationQuery(loc) {
  if (!loc || typeof loc !== 'string') return 'Toronto';
  const lower = loc.toLowerCase().trim();
  if (lower.includes('gta') || lower.includes('greater toronto') || lower.includes('toronto')) return 'Toronto';
  if (lower.includes('vancouver')) return 'Vancouver';
  if (lower.includes('montreal')) return 'Montreal';
  if (lower.includes('calgary')) return 'Calgary';
  if (lower.includes('ottawa')) return 'Ottawa';
  if (lower.includes('edmonton')) return 'Edmonton';
  if (lower.includes('new york') || lower.includes('nyc')) return 'New York';
  if (lower.includes('austin')) return 'Austin';
  if (lower.includes('san francisco') || lower.includes('bay area')) return 'San Francisco';
  if (lower.includes('chicago')) return 'Chicago';
  if (lower.includes('seattle')) return 'Seattle';
  if (lower === 'remote' || lower.includes('remote') || lower.includes('worldwide')) return 'Remote';
  return loc.replace(/\s*\([^)]*\)/g, '').trim();
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
  SUPPORTED_COUNTRIES,
  COUNTRY_PATTERNS
};
