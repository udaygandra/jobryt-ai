/**
 * country-boards-registry.js — Curated Global & Country-Specific Job Board Registry
 *
 * Strict quality criteria:
 *   1. First Market Leaders implemented for every requested market.
 *   2. Secondary & Tech Specialists included ONLY if free API/feed available and verified low fake job risk.
 *   3. Filtered per country so candidates only see high-signal, relevant boards for their target market.
 */

const COUNTRY_BOARDS = Object.freeze({
  // 🇺🇸 United States
  'US': [
    { id: 'linkedin', name: 'LinkedIn (US)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Primary market leader for US professional & tech postings.' },
    { id: 'indeed', name: 'Indeed (US)', tier: 'primary', is_free_api: true, fake_risk: 'Medium', description: 'Largest US employment aggregator and direct employer postings.' },
    { id: 'usajobs', name: 'USAJOBS (Federal Gov)', tier: 'tech_specialist', is_free_api: true, official_gov: true, fake_risk: 'Zero (Gov Verified)', description: 'Official US Federal Government careers API. 100% verified civil & defense roles.' },
    { id: 'dice', name: 'Dice (Tech Careers)', tier: 'tech_specialist', is_free_api: true, fake_risk: 'Low', description: 'Dedicated US technology & engineering job board.' },
    { id: 'adzuna', name: 'Adzuna (US Gateway)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Free API sweeping direct company career pages nationwide.' }
  ],

  // 🇬🇧 United Kingdom
  'GB': [
    { id: 'reed', name: 'Reed.co.uk', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'UK’s #1 commercial job board with open jobseeker API and RSS feeds.' },
    { id: 'indeed', name: 'Indeed (UK)', tier: 'primary', is_free_api: true, fake_risk: 'Medium', description: 'Major UK aggregator covering all regions and sectors.' },
    { id: 'adzuna', name: 'Adzuna (UK HQ)', tier: 'primary', is_free_api: true, official_partner: true, fake_risk: 'Low', description: 'Official DWP Find a Job partner and UK’s largest indexer.' },
    { id: 'linkedin', name: 'LinkedIn (UK)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Top professional and London/UK tech ecosystem postings.' },
    { id: 'cwjobs', name: 'CWJobs (UK Tech)', tier: 'tech_specialist', is_free_api: true, fake_risk: 'Low', description: 'Specialist IT, cloud, and developer roles in the UK.' }
  ],

  // 🇨🇦 Canada
  'CA': [
    { id: 'canada_job_bank', name: 'Canada Job Bank (Gov)', tier: 'primary', is_free_api: true, official_gov: true, fake_risk: 'Zero (Gov Verified)', description: 'Government of Canada official portal with verified LMIA & domestic employers.' },
    { id: 'linkedin', name: 'LinkedIn (Canada)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Market leader for Canadian tech, finance, and enterprise hiring.' },
    { id: 'indeed', name: 'Indeed (Canada)', tier: 'primary', is_free_api: true, fake_risk: 'Medium', description: 'Widely used Canadian job board across all provinces.' },
    { id: 'adzuna', name: 'Adzuna (Canada)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Free API for Canadian cross-provincial roles.' },
    { id: 'techcareers', name: 'TechCareers Canada', tier: 'tech_specialist', is_free_api: true, fake_risk: 'Low', description: 'Curated Canadian software, data, and engineering opportunities.' }
  ],

  // 🇩🇪 Germany (DACH)
  'DE': [
    { id: 'arbeitsagentur', name: 'Bundesagentur für Arbeit (Jobsuche)', tier: 'primary', is_free_api: true, official_gov: true, fake_risk: 'Zero (Gov Verified)', description: 'Germany official Federal Employment Agency REST API. 100% verified German employers.' },
    { id: 'stepstone', name: 'StepStone (Germany)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Germany and DACH leading specialist recruitment portal.' },
    { id: 'arbeitnow', name: 'ArbeitNow (DACH & EU Tech)', tier: 'tech_specialist', is_free_api: true, fake_risk: 'Zero (ATS Direct)', description: 'Free open API with verified English & German tech jobs directly from ATS systems.' },
    { id: 'linkedin', name: 'LinkedIn (Germany)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Top professional network for Berlin, Munich, Frankfurt tech.' },
    { id: 'adzuna', name: 'Adzuna (Germany)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Comprehensive German nationwide jobs gateway.' }
  ],

  // 🇫🇷 France
  'FR': [
    { id: 'wttj', name: 'Welcome to the Jungle (France)', tier: 'primary', is_free_api: true, fake_risk: 'Zero (Curated)', description: 'France’s premier employer brand & tech recruitment platform.' },
    { id: 'francetravail', name: 'France Travail (Pôle Emploi)', tier: 'primary', is_free_api: true, official_gov: true, fake_risk: 'Zero (Gov Verified)', description: 'Official French government employment agency with authenticated listings.' },
    { id: 'linkedin', name: 'LinkedIn (France)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Market leader for Paris & French tech startups and enterprises.' },
    { id: 'adzuna', name: 'Adzuna (France)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Free API indexing direct employer career portals across France.' }
  ],

  // 🇮🇳 India
  'IN': [
    { id: 'naukri', name: 'Naukri.com', tier: 'primary', is_free_api: true, fake_risk: 'Medium', description: 'India’s undisputed #1 job portal with largest volume of verified corporate postings.' },
    { id: 'linkedin', name: 'LinkedIn (India)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Top network for Bangalore, Hyderabad, Pune, Mumbai tech & product talent.' },
    { id: 'instahyre', name: 'Instahyre (Tech Startups)', tier: 'tech_specialist', is_free_api: true, fake_risk: 'Low', description: 'AI-curated high-growth tech & product engineering roles.' },
    { id: 'adzuna', name: 'Adzuna (India)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Free API covering Indian tech hubs and multinational centers.' }
  ],

  // 🇦🇺 Australia & NZ
  'AU': [
    { id: 'seek', name: 'SEEK (seek.com.au)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Australia and New Zealand’s undisputed #1 job marketplace.' },
    { id: 'jora', name: 'Jora (SEEK Network)', tier: 'tech_specialist', is_free_api: true, fake_risk: 'Low', description: 'Free Australian job search engine powered by SEEK.' },
    { id: 'indeed', name: 'Indeed (Australia)', tier: 'primary', is_free_api: true, fake_risk: 'Medium', description: 'High-volume national aggregator across Sydney, Melbourne, Brisbane.' },
    { id: 'linkedin', name: 'LinkedIn (Australia)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Leading executive and professional network in Australia.' },
    { id: 'adzuna', name: 'Adzuna (Australia)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Free API indexing verified Australian employer career pages.' }
  ],

  // 🇳🇱 Netherlands
  'NL': [
    { id: 'nationalevacaturebank', name: 'Nationale Vacaturebank', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'The Netherlands’ #1 domestic job site for Dutch professionals.' },
    { id: 'linkedin', name: 'LinkedIn (Netherlands)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Essential for Amsterdam, Rotterdam, Utrecht international tech hubs.' },
    { id: 'indeed', name: 'Indeed (Netherlands)', tier: 'primary', is_free_api: true, fake_risk: 'Medium', description: 'Widely used job aggregator across all Dutch provinces.' },
    { id: 'arbeitnow', name: 'ArbeitNow (Benelux Tech)', tier: 'tech_specialist', is_free_api: true, fake_risk: 'Zero (ATS Direct)', description: 'European verified tech & startup roles with English-speaking focus.' },
    { id: 'adzuna', name: 'Adzuna (Netherlands)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Free API for Dutch metropolitan tech corridors.' }
  ],

  // 🇦🇪 UAE & Gulf
  'AE': [
    { id: 'bayt', name: 'Bayt.com', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'The Middle East’s leading job portal covering UAE, Dubai, Abu Dhabi, and GCC.' },
    { id: 'gulftalent', name: 'GulfTalent', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Premier professional recruitment site for experienced talent in the Gulf.' },
    { id: 'linkedin', name: 'LinkedIn (UAE & Gulf)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Top professional network for Dubai Tech, FinTech, and enterprise roles.' }
  ],

  // 🇸🇬 Singapore / SEA
  'SG': [
    { id: 'mycareersfuture', name: 'MyCareersFuture (Gov)', tier: 'primary', is_free_api: true, official_gov: true, fake_risk: 'Zero (Gov Verified)', description: 'Official Singapore Government job portal by Workforce Singapore (WSG). 100% verified ACRA companies.' },
    { id: 'jobstreet', name: 'Jobstreet (SEEK Asia)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Singapore and Southeast Asia’s most trusted commercial jobs portal.' },
    { id: 'nodeflair', name: 'NodeFlair (Tech & Salary)', tier: 'tech_specialist', is_free_api: true, fake_risk: 'Low', description: 'Verified tech, salary transparency, and engineering careers in Singapore.' },
    { id: 'linkedin', name: 'LinkedIn (Singapore)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Leading APAC regional headquarters network.' },
    { id: 'adzuna', name: 'Adzuna (Singapore)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Free API indexing direct Singapore enterprise career pages.' }
  ],

  // 🇯🇵 Japan
  'JP': [
    { id: 'daijob', name: 'Daijob / GaijinPot', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Japan’s leading bilingual, global, and English-friendly professional job board.' },
    { id: 'wantedly', name: 'Wantedly (Japan Tech)', tier: 'tech_specialist', is_free_api: true, fake_risk: 'Low', description: 'Tokyo & Japan tech startup and engineering platform.' },
    { id: 'linkedin', name: 'LinkedIn (Japan)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Top network for multinational corporations and Tokyo tech.' }
  ],

  // 🇧🇷 Brazil
  'BR': [
    { id: 'vagas', name: 'Vagas.com.br', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Brazil’s #1 dedicated career and employer portal.' },
    { id: 'gupy', name: 'Gupy (Brazil ATS)', tier: 'primary', is_free_api: true, fake_risk: 'Zero (ATS Direct)', description: 'Brazil’s leading recruitment platform used by top national companies.' },
    { id: 'linkedin', name: 'LinkedIn (Brazil)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Major hub for São Paulo, Rio, and South American tech talent.' },
    { id: 'adzuna', name: 'Adzuna (Brazil)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Free API covering nationwide Brazilian opportunities.' }
  ]
});

// Worldwide Remote Feeds (Applicable across all countries, 100% Free & Verified)
const GLOBAL_REMOTE_BOARDS = Object.freeze([
  { id: 'arbeitnow', name: 'ArbeitNow (Remote & EU ATS)', tier: 'remote', is_free_api: true, fake_risk: 'Zero (ATS Direct)', description: 'Direct ATS job postings with salary details and visa sponsorship filter.' },
  { id: 'jobicy', name: 'Jobicy (Worldwide Remote)', tier: 'remote', is_free_api: true, fake_risk: 'Low', description: 'Curated remote developer, data, and design positions across 70+ countries.' },
  { id: 'remotive', name: 'Remotive (Tech Remote)', tier: 'remote', is_free_api: true, fake_risk: 'Zero (Curated)', description: 'Hand-screened remote tech, developer, product, and data jobs.' },
  { id: 'himalayas', name: 'Himalayas (Remote Tech)', tier: 'remote', is_free_api: true, fake_risk: 'Zero (Curated)', description: 'Quality-filtered global remote opportunities with deep company profiles.' }
]);

const BOARD_KEY_REQUIREMENTS = Object.freeze({
  'adzuna': {
    requires_api_key: true,
    key_fields: [
      { id: 'ADZUNA_APP_ID', label: 'Adzuna Application ID', placeholder: 'e.g. 523a1b8c' },
      { id: 'ADZUNA_APP_KEY', label: 'Adzuna Application Key', placeholder: 'e.g. 7f89c0...' }
    ],
    key_help_url: 'https://developer.adzuna.com/signup',
    key_help_text: 'Free Adzuna developer account gives access to 16 countries with 1 pair of keys at developer.adzuna.com'
  },
  'usajobs': {
    requires_api_key: true,
    key_fields: [
      { id: 'USAJOBS_API_KEY', label: 'USAJOBS Authorization Key', placeholder: 'e.g. key_xxx...' },
      { id: 'USAJOBS_USER_AGENT', label: 'Contact Email / User Agent', placeholder: 'your.email@example.com' }
    ],
    key_help_url: 'https://developer.usajobs.gov/APIRequest/Index',
    key_help_text: 'Free official US government developer key available at developer.usajobs.gov'
  }
});

function enrichBoard(board) {
  if (!board) return board;
  const req = BOARD_KEY_REQUIREMENTS[board.id];
  if (req) {
    return { ...board, ...req };
  }
  return { ...board, requires_api_key: false };
}

/**
 * Returns the curated, top-tier job boards for a specific country scope.
 * Hides foreign boards that have zero relevance in this market.
 */
function getBoardsForCountry(countryCode = 'GLOBAL') {
  const code = (countryCode || 'GLOBAL').toUpperCase().trim();
  let rawList = [];
  
  if (code === 'GLOBAL' || code === 'AUTO') {
    rawList = [
      { id: 'linkedin', name: 'LinkedIn (Global Guest)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Worldwide professional postings' },
      { id: 'adzuna', name: 'Adzuna (16 Countries)', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Multi-country free search gateway' },
      ...GLOBAL_REMOTE_BOARDS
    ];
  } else if (code === 'US_CA') {
    const usBoards = COUNTRY_BOARDS['US'] || [];
    const caBoards = COUNTRY_BOARDS['CA'] || [];
    const merged = new Map();
    [...usBoards, ...caBoards].forEach(b => merged.set(b.id, b));
    rawList = [...merged.values(), ...GLOBAL_REMOTE_BOARDS];
  } else {
    const countrySpecific = COUNTRY_BOARDS[code] || [];
    if (countrySpecific.length > 0) {
      rawList = [...countrySpecific, ...GLOBAL_REMOTE_BOARDS];
    } else {
      rawList = [
        { id: 'linkedin', name: `LinkedIn (${code})`, tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Professional network' },
        { id: 'adzuna', name: 'Adzuna Global', tier: 'primary', is_free_api: true, fake_risk: 'Low', description: 'Free API search gateway' },
        ...GLOBAL_REMOTE_BOARDS
      ];
    }
  }

  return rawList.map(enrichBoard);
}

/**
 * Returns a dictionary of all supported boards across all countries.
 */
function getAllSupportedBoards() {
  const allMap = new Map();
  for (const boards of Object.values(COUNTRY_BOARDS)) {
    for (const b of boards) {
      if (!allMap.has(b.id)) allMap.set(b.id, b);
    }
  }
  for (const b of GLOBAL_REMOTE_BOARDS) {
    if (!allMap.has(b.id)) allMap.set(b.id, b);
  }
  return [...allMap.values()].map(enrichBoard);
}

module.exports = {
  COUNTRY_BOARDS,
  GLOBAL_REMOTE_BOARDS,
  BOARD_KEY_REQUIREMENTS,
  getBoardsForCountry,
  getAllSupportedBoards
};
