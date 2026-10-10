const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('Plan 27.2 - Setup Wizard Upload Guardrails, Please Wait Feedback & Data Sync Verification', async (t) => {
  await t.test('index.html contains wizard elements for upload button, status text, and next button', () => {
    const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    assert.match(html, /id="welcome-wizard-modal"/, 'welcome-wizard-modal must exist');
    assert.match(html, /id="wizard-btn-upload"/, 'wizard-btn-upload element must have unique ID');
    assert.match(html, /id="wizard-resume-status"/, 'wizard-resume-status must exist');
    assert.match(html, /id="wizard-btn-next"/, 'wizard-btn-next must exist');
  });

  await t.test('guide.js declares isWizardParsingResume state flag and step guard', () => {
    const guidePath = path.join(__dirname, '..', 'public', 'js', 'guide.js');
    const js = fs.readFileSync(guidePath, 'utf8');

    // 1. Flag declaration
    assert.match(js, /let isWizardParsingResume\s*=\s*false;/, 'isWizardParsingResume flag must be declared');

    // 2. Step navigation guard
    assert.match(js, /function goToWizardStep\(stepNum\)\s*\{[\s\S]*?if\s*\(isWizardParsingResume\s*&&\s*stepNum\s*>\s*1\)\s*\{/,
      'goToWizardStep must block progression past step 1 while resume parsing');
    assert.match(js, /Please wait for resume parsing to complete before proceeding/, 'Should alert user to wait');
  });

  await t.test('guide.js triggerResumeUploadFromWizard disables Next button and shows animated spinner', () => {
    const guidePath = path.join(__dirname, '..', 'public', 'js', 'guide.js');
    const js = fs.readFileSync(guidePath, 'utf8');

    // Disables Next button on file selection
    assert.match(js, /isWizardParsingResume\s*=\s*true;/, 'Must set isWizardParsingResume = true on file selection');
    assert.match(js, /nextBtn\.disabled\s*=\s*true;/, 'Must disable nextBtn');
    assert.match(js, /opacity-50[\s\S]*?cursor-not-allowed[\s\S]*?pointer-events-none/, 'Must style nextBtn as disabled');

    // Shows waiting message and spinner
    assert.match(js, /animate-spin/, 'Must include animated spinner svg in wizard status');
    assert.match(js, /Please wait, analyzing &amp; parsing resume\.\.\./, 'Must display waiting message');
  });

  await t.test('guide.js handles resume-parse-complete event by unlocking Next button and hydrating roles/locations', () => {
    const guidePath = path.join(__dirname, '..', 'public', 'js', 'guide.js');
    const js = fs.readFileSync(guidePath, 'utf8');

    // Event listener
    assert.match(js, /window\.addEventListener\('resume-parse-complete'/, 'Must register listener for resume-parse-complete');
    assert.match(js, /isWizardParsingResume\s*=\s*false;/, 'Must reset isWizardParsingResume = false');
    assert.match(js, /nextBtn\.disabled\s*=\s*false;/, 'Must re-enable nextBtn');
    assert.match(js, /nextBtn\.classList\.remove\('opacity-50'/, 'Must remove disabled styling from nextBtn');

    // Hydrates roles and locations into wizard state
    assert.match(js, /wizardRolesList\s*=\s*\[\.\.\.roles\];/, 'Must hydrate wizardRolesList');
    assert.match(js, /renderWizardRoles\(\);/, 'Must call renderWizardRoles');
    assert.match(js, /wizardLocationsList\s*=\s*\[\.\.\.locs\];/, 'Must hydrate wizardLocationsList');
    assert.match(js, /renderWizardLocations\(\);/, 'Must call renderWizardLocations');
  });
});
