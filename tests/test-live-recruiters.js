/**
 * test-live-recruiters.js — Recruiter & Hiring Team Finder / X-Ray Search Tests
 *
 * Verifies 100% free, zero-API-key Google X-Ray Search generation for LinkedIn talent acquisition
 * and hiring managers, plus personalized draft outreach messages (<=300 chars).
 */

const assert = require('assert');
const { router } = require('../src/routes/recruiters');

async function testRecruiterSearchGenerator() {
  console.log('🧪 Testing Recruiter Intelligence (100% Free Google X-Ray & LinkedIn Search)...');

  let mockResponse = null;
  const mockReq = {
    query: {
      company: 'Shopify',
      city: 'Toronto, ON'
    }
  };

  const mockRes = {
    json: (data) => { mockResponse = data; return mockRes; },
    status: (code) => {
      return {
        json: (data) => { mockResponse = { ...data, statusCode: code }; return mockRes; }
      };
    }
  };

  // Find the GET handler in recruiter router
  const routeLayer = router.stack.find(s => s.route && s.route.path === '/search');
  assert(routeLayer, 'Recruiter router must have /search route handler');

  const handler = routeLayer.route.stack[0].handle;
  await handler(mockReq, mockRes);

  assert(mockResponse, 'Handler must produce a response');
  assert.strictEqual(mockResponse.success, true);
  assert.strictEqual(mockResponse.company, 'Shopify');
  assert.strictEqual(mockResponse.city, 'Toronto, ON');

  // Verify Google X-Ray URLs
  assert(mockResponse.xRaySearchUrl.includes('google.com/search?q='), 'Must produce valid Google search URL');
  assert(mockResponse.xRaySearchUrl.includes('site%3Alinkedin.com%2Fin%2F'), 'Must contain site:linkedin.com/in/ target');
  assert(mockResponse.xRaySearchUrl.includes('recruiter'), 'Must query recruiters');

  // Verify Leadership URLs
  assert(mockResponse.leadershipSearchUrl.includes('google.com/search?q='), 'Must produce leadership Google search URL');

  // Verify LinkedIn Direct Search
  assert(mockResponse.linkedInSearchUrl.includes('linkedin.com/search/results/people'), 'Must produce LinkedIn search URL');

  // Verify personalized LinkedIn Note <= 300 characters
  assert(mockResponse.draftLinkedInNote, 'Must produce a drafted connection note');
  assert(mockResponse.draftLinkedInNote.length <= 300, `Note must be <= 300 chars for LinkedIn (got ${mockResponse.draftLinkedInNote.length})`);
  assert(mockResponse.draftLinkedInNote.includes('Shopify'), 'Note must customize company name');

  console.log('  ✔ [PASS] Google X-Ray recruiter query correctly generated');
  console.log('  ✔ [PASS] Google X-Ray leadership query correctly generated');
  console.log('  ✔ [PASS] LinkedIn direct company URL verified');
  console.log(`  ✔ [PASS] Tailored connection note within limits (${mockResponse.draftLinkedInNote.length} chars)`);
  console.log('\n🎉 ALL RECRUITER X-RAY & INTELLIGENCE TESTS PASSED (100% FREE)!');
}

testRecruiterSearchGenerator().then(() => process.exit(0)).catch(err => {
  console.error('❌ Error during recruiter search test:', err);
  process.exit(1);
});
