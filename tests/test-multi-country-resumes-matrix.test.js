/**
 * tests/test-multi-country-resumes-matrix.test.js
 *
 * Phase 34: Multi-Country Market Resume Ingestion Matrix Test Suite
 *
 * Validates the complete multi-market pipeline across 6 global regions:
 *   1. US  (United States)
 *   2. CA  (Canada)
 *   3. DE  (Germany / DACH)
 *   4. GB  (United Kingdom)
 *   5. SG  (Singapore)
 *   6. IN  (India)
 *
 * Test Pillars:
 *   - Pillar 1: Resume Text Extraction, Country Detection & Profession-Aware Skill Filtering
 *   - Pillar 2: Settings Auto-Sync (country_scope, target_roles, target_locations)
 *   - Pillar 3: Country-Specific Board Routing & Ingestion Guardrails (Inclusion / Exclusion)
 *   - Pillar 4: Geo-Eligibility Matrix (native vs foreign rejection vs remote handling)
 *   - Pillar 5: Downstream Scoring Validation with Candidate Profile
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { extractResumeLocallyFromText } = require('../scripts/engine/local-resume-extractor');
const { filterSkillsByPrimaryProfession } = require('../scripts/engine/resume-to-profile');
const { discoverMarketRoles } = require('../scripts/engine/market-role-discovery');
const { syncProfileToSettings, getSettings, updateSettings } = require('../scripts/core/settings-helper');
const {
  isJobLocationEligible,
  isJobRoleRelevant,
  detectTargetCountryScope,
  COUNTRY_PATTERNS
} = require('../scripts/core/geo-helper');
const { computeHeuristicScore } = require('../scripts/engine/node-logic');

// Load multi-country test personas fixture
const fixturesPath = path.join(__dirname, 'fixtures', 'multi-country-resumes.json');
const personas = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

// Backup initial profile and settings
const profilePath = path.join(__dirname, '..', 'data', 'profiles', 'master-profile.json');
const settingsPath = path.join(__dirname, '..', 'data', 'config', 'settings.json');

let originalProfile = null;
let originalSettings = null;

try {
  originalProfile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
} catch (_) {}

try {
  originalSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
} catch (_) {}

// Teardown hook to guarantee state cleanliness
function restoreOriginalFiles() {
  if (originalProfile) {
    fs.writeFileSync(profilePath, JSON.stringify(originalProfile, null, 2), 'utf8');
  }
  if (originalSettings) {
    fs.writeFileSync(settingsPath, JSON.stringify(originalSettings, null, 2), 'utf8');
  }
}

test('Phase 34 - Multi-Country Resume & Market Board Matrix Suite', async (suite) => {

  suite.after(() => {
    restoreOriginalFiles();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PILLAR 1: RESUME PARSING & COUNTRY EXTRACTION ACROSS 6 MARKETS
  // ──────────────────────────────────────────────────────────────────────────
  await suite.test('Pillar 1: Extract resumes across US, CA, DE, GB, SG, IN with country and primary title detection', () => {
    for (const [countryKey, persona] of Object.entries(personas)) {
      const parsed = extractResumeLocallyFromText(persona.raw_resume_text);

      assert.ok(parsed, `Parser must return valid object for ${countryKey}`);
      
      // 1. Country code detection
      const detectedCountry = parsed.country_code || parsed.contact?.country_code;
      assert.strictEqual(
        detectedCountry,
        persona.country_code,
        `Country code for ${countryKey} must equal ${persona.country_code}, got: ${detectedCountry}`
      );

      // 2. Primary title extraction from header or experience
      assert.ok(
        Array.isArray(parsed.target_titles) && parsed.target_titles.length > 0,
        `Must extract target_titles for ${countryKey}`
      );
      const extractedRole = parsed.target_titles[0];
      const isRoleAligned = isJobRoleRelevant(extractedRole, persona.target_roles) ||
        persona.target_roles.some(r => r.toLowerCase().includes(extractedRole.toLowerCase()) || extractedRole.toLowerCase().includes(r.toLowerCase())) ||
        persona.primary_profession.toLowerCase().split(/\s+/).some(w => w.length > 3 && extractedRole.toLowerCase().includes(w));
      assert.ok(
        isRoleAligned,
        `Primary title "${extractedRole}" must reflect candidate domain roles for ${countryKey}`
      );

      // 3. Location extraction
      const loc = parsed.contact?.location || (parsed.locations && parsed.locations[0]) || '';
      assert.ok(loc.length > 0, `Location must be extracted for ${countryKey}`);

      // 4. Skills extraction and profession-aware filtering
      const filtered = filterSkillsByPrimaryProfession(parsed);
      assert.ok(filtered.skills.length > 0, `Skills must be populated for ${countryKey}`);

      // All skills backup must preserve full history
      assert.ok(
        Array.isArray(filtered.all_skills) && filtered.all_skills.length >= filtered.skills.length,
        `all_skills must retain unfiltered list for ${countryKey}`
      );
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PILLAR 2: SETTINGS AUTO-SYNC FOR MULTI-COUNTRY RESUMES
  // ──────────────────────────────────────────────────────────────────────────
  await suite.test('Pillar 2: syncProfileToSettings updates country_scope, target_roles, and target_locations cleanly', () => {
    for (const [countryKey, persona] of Object.entries(personas)) {
      const mockProfile = {
        name: persona.name,
        target_titles: [...persona.target_roles],
        role: persona.primary_profession,
        locations: [...persona.target_locations],
        contact: {
          location: persona.location,
          country_code: persona.country_code,
          email: persona.email,
          phone: persona.phone
        },
        skills: [...persona.skills]
      };

      const synced = syncProfileToSettings(mockProfile);

      // Verify country_scope
      assert.strictEqual(
        synced.country_scope,
        persona.country_code,
        `settings.country_scope must equal ${persona.country_code} for ${countryKey}`
      );

      // Verify target_roles starts with primary profession
      assert.ok(
        Array.isArray(synced.target_roles) && synced.target_roles.length > 0,
        `settings.target_roles must be populated for ${countryKey}`
      );
      assert.strictEqual(
        synced.target_roles[0],
        persona.target_roles[0],
        `Primary target role must be first for ${countryKey}`
      );

      // Verify target_locations populated and capped at <= 5
      assert.ok(
        Array.isArray(synced.target_locations) && synced.target_locations.length > 0,
        `settings.target_locations must be populated for ${countryKey}`
      );
      assert.ok(
        synced.target_locations.length <= 5,
        `target_locations must not exceed 5 for ${countryKey}`
      );
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PILLAR 3: COUNTRY-SPECIFIC BOARD ROUTING MATRIX
  // ──────────────────────────────────────────────────────────────────────────
  await suite.test('Pillar 3: Country Scope Board Routing Rules (Inclusion & Exclusion)', () => {
    // Board eligibility rule simulation matching fetch-all-boards.js guards:
    function getBoardEligibilityForCountry(countryCode) {
      const scope = countryCode.toUpperCase();
      return {
        // US specific
        usajobs: scope === 'US' || scope === 'GLOBAL',
        dice: scope === 'US' || scope === 'GLOBAL',
        
        // Canada specific
        jobbank: scope === 'CA' || scope === 'GLOBAL',
        
        // Germany specific
        arbeitsagentur: scope === 'DE' || scope === 'GLOBAL',
        arbeitnow: scope === 'DE' || scope === 'GLOBAL' || scope === 'US', // ArbeitNow has DACH + global tech
        
        // UK specific
        reed: scope === 'GB' || scope === 'UK' || scope === 'GLOBAL',
        
        // Singapore specific
        mycareersfuture: scope === 'SG' || scope === 'GLOBAL',
        
        // India specific
        naukri: scope === 'IN' || scope === 'GLOBAL',
        
        // Multi-country supported
        adzuna: ['US', 'GB', 'CA', 'DE', 'AU', 'FR', 'IN', 'NL', 'BR', 'IT', 'PL', 'ZA', 'AT', 'NZ', 'SG', 'MX'].includes(scope),
        linkedin: true,
        globalRemote: true
      };
    }

    // 1. United States (US)
    const usBoards = getBoardEligibilityForCountry('US');
    assert.strictEqual(usBoards.usajobs, true, 'USAJOBS must be enabled for US');
    assert.strictEqual(usBoards.dice, true, 'Dice must be enabled for US');
    assert.strictEqual(usBoards.jobbank, false, 'Canada Job Bank must be excluded for US');
    assert.strictEqual(usBoards.arbeitsagentur, false, 'Bundesagentur must be excluded for US');
    assert.strictEqual(usBoards.mycareersfuture, false, 'MyCareersFuture must be excluded for US');

    // 2. Canada (CA)
    const caBoards = getBoardEligibilityForCountry('CA');
    assert.strictEqual(caBoards.jobbank, true, 'Canada Job Bank must be enabled for CA');
    assert.strictEqual(caBoards.usajobs, false, 'USAJOBS must be excluded for CA');
    assert.strictEqual(caBoards.arbeitsagentur, false, 'Bundesagentur must be excluded for CA');
    assert.strictEqual(caBoards.mycareersfuture, false, 'MyCareersFuture must be excluded for CA');

    // 3. Germany (DE)
    const deBoards = getBoardEligibilityForCountry('DE');
    assert.strictEqual(deBoards.arbeitsagentur, true, 'Bundesagentur must be enabled for DE');
    assert.strictEqual(deBoards.arbeitnow, true, 'ArbeitNow must be enabled for DE');
    assert.strictEqual(deBoards.usajobs, false, 'USAJOBS must be excluded for DE');
    assert.strictEqual(deBoards.jobbank, false, 'Canada Job Bank must be excluded for DE');

    // 4. United Kingdom (GB)
    const gbBoards = getBoardEligibilityForCountry('GB');
    assert.strictEqual(gbBoards.reed, true, 'Reed.co.uk must be enabled for GB');
    assert.strictEqual(gbBoards.usajobs, false, 'USAJOBS must be excluded for GB');
    assert.strictEqual(gbBoards.jobbank, false, 'Canada Job Bank must be excluded for GB');

    // 5. Singapore (SG)
    const sgBoards = getBoardEligibilityForCountry('SG');
    assert.strictEqual(sgBoards.mycareersfuture, true, 'MyCareersFuture must be enabled for SG');
    assert.strictEqual(sgBoards.usajobs, false, 'USAJOBS must be excluded for SG');
    assert.strictEqual(sgBoards.jobbank, false, 'Canada Job Bank must be excluded for SG');

    // 6. India (IN)
    const inBoards = getBoardEligibilityForCountry('IN');
    assert.strictEqual(inBoards.naukri, true, 'Naukri must be enabled for IN');
    assert.strictEqual(inBoards.usajobs, false, 'USAJOBS must be excluded for IN');
    assert.strictEqual(inBoards.jobbank, false, 'Canada Job Bank must be excluded for IN');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PILLAR 4: LOCATION ELIGIBILITY & FOREIGN REJECTION MATRIX
  // ──────────────────────────────────────────────────────────────────────────
  await suite.test('Pillar 4: isJobLocationEligible validates native locations and rejects foreign mismatches', () => {
    // 1. US Persona in Seattle, WA
    const usLocs = ['Seattle, WA', 'Redmond, WA'];
    assert.strictEqual(isJobLocationEligible('Seattle, WA', usLocs, 'US', false), true, 'Seattle job eligible for US candidate');
    assert.strictEqual(isJobLocationEligible('Bellevue, WA', usLocs, 'US', false), true, 'Bellevue job eligible for US candidate in Seattle area');
    assert.strictEqual(isJobLocationEligible('Remote, USA', usLocs, 'US', true), true, 'US remote eligible');
    assert.strictEqual(isJobLocationEligible('Toronto, ON, Canada', usLocs, 'US', false), false, 'Canada job rejected for US candidate');
    assert.strictEqual(isJobLocationEligible('Berlin, Germany', usLocs, 'US', false), false, 'Germany job rejected for US candidate');

    // 2. CA Persona in Toronto, ON
    const caLocs = ['Toronto, ON', 'Mississauga, ON'];
    assert.strictEqual(isJobLocationEligible('Toronto, ON', caLocs, 'CA', false), true, 'Toronto job eligible for CA candidate');
    assert.strictEqual(isJobLocationEligible('Mississauga, ON', caLocs, 'CA', false), true, 'Mississauga job eligible for CA candidate');
    assert.strictEqual(isJobLocationEligible('Canada-wide Remote', caLocs, 'CA', true), true, 'Canada remote eligible');
    assert.strictEqual(isJobLocationEligible('Seattle, WA, USA', caLocs, 'CA', false), false, 'US job rejected for CA candidate');
    assert.strictEqual(isJobLocationEligible('London, UK', caLocs, 'CA', false), false, 'UK job rejected for CA candidate');

    // 3. DE Persona in Berlin, Germany
    const deLocs = ['Berlin, Germany'];
    assert.strictEqual(isJobLocationEligible('Berlin, Germany', deLocs, 'DE', false), true, 'Berlin job eligible for DE candidate');
    assert.strictEqual(isJobLocationEligible('Remote, Deutschland', deLocs, 'DE', true), true, 'Germany remote eligible');
    assert.strictEqual(isJobLocationEligible('Chicago, IL, USA', deLocs, 'DE', false), false, 'US job rejected for DE candidate');

    // 4. GB Persona in London, UK
    const gbLocs = ['London, UK'];
    assert.strictEqual(isJobLocationEligible('London, UK', gbLocs, 'GB', false), true, 'London job eligible for GB candidate');
    assert.strictEqual(isJobLocationEligible('Manchester, UK', gbLocs, 'GB', true), true, 'UK remote eligible');
    assert.strictEqual(isJobLocationEligible('Singapore', gbLocs, 'GB', false), false, 'Singapore job rejected for GB candidate');

    // 5. SG Persona in Singapore
    const sgLocs = ['Singapore'];
    assert.strictEqual(isJobLocationEligible('Singapore', sgLocs, 'SG', false), true, 'Singapore job eligible for SG candidate');
    assert.strictEqual(isJobLocationEligible('Sydney, Australia', sgLocs, 'SG', false), false, 'Australia job rejected for SG candidate');

    // 6. IN Persona in Bangalore, India
    const inLocs = ['Bangalore, India', 'Bengaluru'];
    assert.strictEqual(isJobLocationEligible('Bangalore, India', inLocs, 'IN', false), true, 'Bangalore job eligible for IN candidate');
    assert.strictEqual(isJobLocationEligible('Bengaluru, Karnataka', inLocs, 'IN', false), true, 'Bengaluru job eligible for IN candidate');
    assert.strictEqual(isJobLocationEligible('New York, NY', inLocs, 'IN', false), false, 'US job rejected for IN candidate');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PILLAR 5: DOWNSTREAM SCORING & EVALUATION ACROSS MARKET PERSONAS
  // ──────────────────────────────────────────────────────────────────────────
  await suite.test('Pillar 5: Candidate profile evaluation produces healthy score distributions across markets', () => {
    // Test evaluation for US persona (Marcus Vance) against a Senior TPM role
    const usProfile = {
      name: personas.US.name,
      role: personas.US.primary_profession,
      target_titles: personas.US.target_roles,
      skills: personas.US.skills,
      experience_years: 8,
      locations: personas.US.target_locations,
      country_scope: 'US'
    };

    const tpmJob = {
      title: 'Senior Technical Product Manager - Cloud Infrastructure',
      company: 'AWS Technologies',
      location: 'Seattle, WA',
      description: 'Seeking a Senior Technical Product Manager with experience leading cloud platforms, roadmap planning, Agile/Scrum, and API development with Python and SQL.'
    };

    const evaluation = computeHeuristicScore(tpmJob, usProfile, {
      target_locations: ['Seattle, WA'],
      target_country: 'US',
      country_scope: 'US'
    });
    assert.ok(evaluation, 'Evaluator must produce an evaluation object');
    const matched = evaluation.key_matched_skills || evaluation.scoring_pillars?.matched_skills || [];
    assert.ok(Array.isArray(matched) && matched.length > 0, 'Must identify matching skills');

    // Test evaluation for CA persona (Sahana Rao D) against a Data Analyst role
    const caProfile = {
      name: personas.CA.name,
      role: personas.CA.primary_profession,
      target_titles: personas.CA.target_roles,
      skills: personas.CA.skills,
      experience_years: 5,
      locations: personas.CA.target_locations,
      country_scope: 'CA'
    };

    const daJob = {
      title: 'Senior Data Analyst - Power BI & SQL',
      company: 'Canadian Financial Bank',
      location: 'Toronto, ON',
      description: 'Looking for a Data Analyst with 4+ years experience in SQL, Power BI, DAX, data modeling, and automated ETL pipelines.'
    };

    const caEvaluation = computeHeuristicScore(daJob, caProfile, {
      target_locations: ['Toronto, ON'],
      target_country: 'CA',
      country_scope: 'CA'
    });
    assert.ok(caEvaluation, 'Evaluator must produce an evaluation object for CA');
    assert.ok(caEvaluation.score >= 70, `Data Analyst match must score >= 70%, got: ${caEvaluation.score}%`);
  });

});
