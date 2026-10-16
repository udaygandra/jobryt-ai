/**
 * tests/test-phase-33-resume-parser-settings.test.js
 *
 * Phase 33 Validation Test Suite:
 * 1. Header title -> target_titles[0]
 * 2. Skill filtering excludes unrelated past roles (teaching, retail for SWE)
 * 3. Skill filtering preserves relevant skills (React, Node.js, SQL for SWE; SQL, DAX for DA; lesson planning for Teacher; patient care for Nurse)
 * 4. All original skills preserved in all_skills (all_skills.length >= skills.length)
 * 5. Settings auto-population works (settings.target_roles matches profile.target_titles)
 * 6. Country/location extracted and populated in settings.country_scope
 * 7. Local fallback extractor works end-to-end
 * 8. Zero regression in discoverMarketRoles (4-10 titles discovered)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { filterSkillsByPrimaryProfession, isSkillRelevant, extractProfessionKeywords } = require('../scripts/engine/resume-to-profile');
const { extractResumeLocallyFromText } = require('../scripts/engine/local-resume-extractor');
const { discoverMarketRoles } = require('../scripts/engine/market-role-discovery');
const { syncProfileToSettings, getSettings } = require('../scripts/core/settings-helper');

console.log('='.repeat(70));
console.log('🧪 RUNNING PHASE 33 VALIDATION TEST SUITE');
console.log('='.repeat(70) + '\n');

// ── Test 1: Header title -> target_titles[0] & Market Role Discovery ─────────
console.log('1. Testing Header Title Priority & Market Role Discovery...');
{
  const rawTitlesSWE = ['Software Engineer', 'Teaching Assistant'];
  const discoveredSWE = discoverMarketRoles(rawTitlesSWE, {});
  assert.strictEqual(discoveredSWE[0], 'Software Engineer', 'First target title must be primary header profession');
  assert(discoveredSWE.length >= 4 && discoveredSWE.length <= 10, 'Must discover 4 to 10 market roles');

  const rawTitlesDA = ['Data Analyst', 'Retail Associate'];
  const discoveredDA = discoverMarketRoles(rawTitlesDA, {});
  assert.strictEqual(discoveredDA[0], 'Data Analyst', 'First target title must be Data Analyst');
  assert(discoveredDA.length >= 4 && discoveredDA.length <= 10, 'Must discover 4 to 10 market roles');

  console.log('   ✔ SWE discovered roles (header first):', discoveredSWE.slice(0, 4));
  console.log('   ✔ DA discovered roles (header first):', discoveredDA.slice(0, 4));
}

// ── Test 2 & 3: Skill filtering for Software Engineer ────────────────────────
console.log('\n2. Testing Skill Filtering for Software Engineer...');
{
  const sweProfile = {
    target_titles: ['Software Engineer', 'Full Stack Developer', 'Backend Developer', 'Cloud Engineer'],
    role: 'Software Engineer',
    skills: [
      'React', 'Node.js', 'SQL', 'Docker', 'TypeScript', 'AWS',
      'lesson planning', 'classroom management', 'student grading', 'cash handling', 'retail sales'
    ],
    skills_categorized: [
      { category: 'Frontend', items: ['React', 'TypeScript'] },
      { category: 'Backend', items: ['Node.js', 'SQL'] },
      { category: 'DevOps', items: ['Docker', 'AWS'] },
      { category: 'Other', items: ['lesson planning', 'classroom management', 'cash handling'] }
    ]
  };

  const filtered = filterSkillsByPrimaryProfession(sweProfile);

  // Must exclude unrelated skills
  assert(!filtered.skills.includes('lesson planning'), 'Must exclude lesson planning for SWE');
  assert(!filtered.skills.includes('classroom management'), 'Must exclude classroom management for SWE');
  assert(!filtered.skills.includes('student grading'), 'Must exclude student grading for SWE');
  assert(!filtered.skills.includes('cash handling'), 'Must exclude cash handling for SWE');
  assert(!filtered.skills.includes('retail sales'), 'Must exclude retail sales for SWE');

  // Must preserve relevant skills
  assert(filtered.skills.includes('React'), 'Must preserve React');
  assert(filtered.skills.includes('Node.js'), 'Must preserve Node.js');
  assert(filtered.skills.includes('SQL'), 'Must preserve SQL');
  assert(filtered.skills.includes('Docker'), 'Must preserve Docker');
  assert(filtered.skills.includes('TypeScript'), 'Must preserve TypeScript');
  assert(filtered.skills.includes('AWS'), 'Must preserve AWS');

  // Test 4: All original skills preserved in all_skills
  assert(Array.isArray(filtered.all_skills), 'all_skills field must exist');
  assert.strictEqual(filtered.all_skills.length, sweProfile.skills.length, 'all_skills must preserve all original skills');
  assert(filtered.all_skills.length > filtered.skills.length, 'all_skills count must be greater than filtered skills count');

  // Categorized skills must also be filtered
  const otherCat = filtered.skills_categorized.find(c => c.category === 'Other');
  assert(!otherCat, 'Other category containing only unrelated skills must be pruned');

  console.log(`   ✔ Filtered skills count: ${filtered.skills.length}/${filtered.all_skills.length}`);
  console.log('   ✔ Relevant skills kept:', filtered.skills);
}

// ── Test 3b: Skill filtering for Data Analyst ────────────────────────────────
console.log('\n3. Testing Skill Filtering for Data Analyst...');
{
  const daProfile = {
    target_titles: ['Data Analyst', 'Business Intelligence Analyst', 'Analytics Engineer'],
    role: 'Data Analyst',
    skills: ['SQL', 'Python', 'Power BI', 'Tableau', 'DAX', 'lesson planning', 'cash handling']
  };

  const filteredDA = filterSkillsByPrimaryProfession(daProfile);
  assert(filteredDA.skills.includes('SQL'), 'DA must keep SQL');
  assert(filteredDA.skills.includes('Python'), 'DA must keep Python');
  assert(filteredDA.skills.includes('Power BI'), 'DA must keep Power BI');
  assert(filteredDA.skills.includes('Tableau'), 'DA must keep Tableau');
  assert(filteredDA.skills.includes('DAX'), 'DA must keep DAX');
  assert(!filteredDA.skills.includes('lesson planning'), 'DA must exclude lesson planning');
  assert(!filteredDA.skills.includes('cash handling'), 'DA must exclude cash handling');
  assert.strictEqual(filteredDA.all_skills.length, 7);
  console.log('   ✔ DA skills kept:', filteredDA.skills);
}

// ── Test 3c: Skill filtering for Teacher ──────────────────────────────────────
console.log('\n4. Testing Skill Filtering for Teacher...');
{
  const teacherProfile = {
    target_titles: ['Teacher', 'Educator'],
    role: 'Teacher',
    skills: ['lesson planning', 'classroom management', 'curriculum', 'pedagogy', 'cash handling']
  };

  const filteredTeacher = filterSkillsByPrimaryProfession(teacherProfile);
  assert(filteredTeacher.skills.includes('lesson planning'), 'Teacher must keep lesson planning');
  assert(filteredTeacher.skills.includes('classroom management'), 'Teacher must keep classroom management');
  assert(filteredTeacher.skills.includes('curriculum'), 'Teacher must keep curriculum');
  assert(filteredTeacher.skills.includes('pedagogy'), 'Teacher must keep pedagogy');
  assert(!filteredTeacher.skills.includes('cash handling'), 'Teacher must exclude cash handling');
  console.log('   ✔ Teacher skills kept:', filteredTeacher.skills);
}

// ── Test 3d: Skill filtering for Registered Nurse ────────────────────────────
console.log('\n5. Testing Skill Filtering for Registered Nurse...');
{
  const nurseProfile = {
    target_titles: ['Registered Nurse', 'Clinical Specialist'],
    role: 'Registered Nurse',
    skills: ['patient care', 'triage', 'BLS', 'EMR', 'cash handling']
  };

  const filteredNurse = filterSkillsByPrimaryProfession(nurseProfile);
  assert(filteredNurse.skills.includes('patient care'), 'Nurse must keep patient care');
  assert(filteredNurse.skills.includes('triage'), 'Nurse must keep triage');
  assert(filteredNurse.skills.includes('BLS'), 'Nurse must keep BLS');
  assert(filteredNurse.skills.includes('EMR'), 'Nurse must keep EMR');
  assert(!filteredNurse.skills.includes('cash handling'), 'Nurse must exclude cash handling');
  console.log('   ✔ Nurse skills kept:', filteredNurse.skills);
}

// ── Test 6 & 7: Local Resume Extractor & Country Scope ───────────────────────
console.log('\n6. Testing Local Resume Extractor (Header Priority & Location)...');
{
  const resumeText = `
Alex Mercer
Senior Software Engineer
Austin, TX, USA | alex.mercer@example.com | +1 (512) 555-0199 | US Citizen

SUMMARY:
Senior Software Engineer with 7+ years of experience building distributed backend systems.

SKILLS:
JavaScript, TypeScript, Node.js, Python, PostgreSQL, Docker, AWS, Git, lesson planning, cash handling

EXPERIENCE:
Senior Software Engineer
TechCorp — Austin, TX
Jan 2021 – Present
• Designed distributed microservices using Node.js and AWS.

Graduate Teaching Assistant
University of Texas — Austin, TX
Sep 2018 – Dec 2020
• Conducted lab sessions, lesson planning, and student grading.
`;

  const parsed = extractResumeLocallyFromText(resumeText);
  assert(parsed, 'Local extractor must parse text resume');
  assert.strictEqual(parsed.name, 'Alex Mercer', 'Extracted name must be Alex Mercer');
  assert.strictEqual(parsed.target_titles[0], 'Senior Software Engineer', 'First target role must be Senior Software Engineer');
  assert(parsed.target_titles.length >= 4, 'Must have at least 4 target roles');
  assert.strictEqual(parsed.contact.country_code, 'US', 'Must detect US country code');
  assert(parsed.contact.location.includes('Austin'), 'Must extract Austin location');

  // Skill filtering verified on local extractor output
  assert(parsed.skills.includes('Node.js'), 'Must contain Node.js');
  assert(parsed.skills.includes('PostgreSQL'), 'Must contain PostgreSQL');
  assert(!parsed.skills.includes('lesson planning'), 'Must exclude lesson planning');
  assert(!parsed.skills.includes('cash handling'), 'Must exclude cash handling');
  assert(parsed.all_skills.includes('lesson planning'), 'all_skills must retain lesson planning');

  console.log('   ✔ Local Extractor Header Title:', parsed.target_titles[0]);
  console.log('   ✔ Local Extractor Country Code:', parsed.contact.country_code);
  console.log('   ✔ Local Extractor Filtered Skills:', parsed.skills);
}

// ── Test 5: Settings Auto-Population from Profile ────────────────────────────
console.log('\n7. Testing Settings Auto-Population (syncProfileToSettings)...');
{
  const testCandidate = {
    name: 'Morgan Davis',
    target_titles: ['Software Engineer', 'Full Stack Developer', 'Backend Developer', 'Cloud Engineer'],
    role: 'Software Engineer',
    locations: ['Toronto, ON, Canada'],
    contact: {
      location: 'Toronto, ON, Canada',
      country_code: 'CA'
    },
    country_code: 'CA',
    skills: ['React', 'Node.js', 'PostgreSQL', 'Docker'],
    all_skills: ['React', 'Node.js', 'PostgreSQL', 'Docker', 'lesson planning']
  };

  const updatedSettings = syncProfileToSettings(testCandidate);
  assert(updatedSettings, 'Settings object must be returned');
  assert.strictEqual(updatedSettings.target_roles[0], 'Software Engineer', 'Settings target_roles[0] must match primary role');
  assert.strictEqual(updatedSettings.country_scope, 'CA', 'Settings country_scope must match profile country code');
  assert(updatedSettings.target_locations.some(l => l.includes('Toronto')), 'Settings target_locations must include Toronto');

  // Verify persistence via getSettings()
  const loaded = getSettings();
  assert.strictEqual(loaded.target_roles[0], 'Software Engineer', 'Persisted target_roles[0] must match primary role');
  assert.strictEqual(loaded.country_scope, 'CA', 'Persisted country_scope must be CA');

  console.log('   ✔ settings.target_roles:', loaded.target_roles);
  console.log('   ✔ settings.country_scope:', loaded.country_scope);
  console.log('   ✔ settings.target_locations:', loaded.target_locations);
}

console.log('\n' + '='.repeat(70));
console.log('🎉 ALL 8/8 PHASE 33 VALIDATION CHECKS PASSED PERFECTLY!');
console.log('='.repeat(70));
