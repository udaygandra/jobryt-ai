const fs = require('fs');
const assert = require('assert');

const code = fs.readFileSync('public/js/applied.js', 'utf8');

// Plan 19.1 verifications
assert(!code.includes('onclick="toggleCardRecruiters(\'${app.id}\', ${JSON.stringify'), 'No nested JSON.stringify in toggleCardRecruiters');
assert(!code.includes('onclick="previewLetter(${JSON.stringify'), 'No nested JSON.stringify in previewLetter');
assert(code.includes("toggleCardRecruiters('${app.id}')"), 'Has toggleCardRecruiters id call');
assert(code.includes("previewCardLetter('${app.id}')"), 'Has previewCardLetter id call');
assert(code.includes('appliedJobsCache = new Map()'), 'Has appliedJobsCache Map initialization');
assert(code.includes('appliedJobsCache.set(String(j.id), j)'), 'Has appliedJobsCache populate');
assert(code.includes('function previewCardLetter(appId)'), 'Has previewCardLetter implementation');
assert(code.includes('toggleCardRecruiters(appId)'), 'Has updated toggleCardRecruiters definition');

// Plan 19.2 verifications
assert(code.includes('border-l-2 border-l-[#D9A441]'), 'Has pitch accent border');
assert(code.includes('TIER 1: Header'), 'Has TIER 1 Header');
assert(code.includes('TIER 2: Full-Width Executive Pitch'), 'Has TIER 2 Pitch');
assert(code.includes('TIER 3: Dedicated Bottom Action Toolbar'), 'Has TIER 3 Action Toolbar');

console.log('✅ ALL Phase 19 static assertions passed successfully!');
