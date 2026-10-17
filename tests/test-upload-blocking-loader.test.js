const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('Plan 27.1 - Full-Screen Resume Upload Blocking Loader Verification', async (t) => {
  await t.test('index.html contains #resume-upload-blocking-overlay with branded elements and animation hooks', () => {
    const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // 1. Root overlay exists with fixed full-screen and z-index 9999
    assert.match(html, /id="resume-upload-blocking-overlay"/, 'Overlay container must exist');
    assert.match(html, /fixed inset-0 z-\[\d+\]/, 'Overlay must cover full screen with high z-index');
    assert.match(html, /backdrop-blur/, 'Overlay should have backdrop blur');

    // 2. Branded logo badge and rotating glow ring
    assert.match(html, /jobryt-logo-badge/, 'Logo badge element must be present');
    assert.match(html, /animate-orbital-spin/, 'Orbital spin animation class must be present');

    // 3. Branded text
    assert.match(html, /Jobryt[\s\S]*?Engine/, 'Overlay should feature Jobryt Engine branding');

    // 4. Progress bar and dynamic status container
    assert.match(html, /resume-parse-progress-bar/, 'Indeterminate progress bar element must be present');
    assert.match(html, /id="resume-upload-status-text"/, 'Dynamic status indicator container must exist');
    // 5. Semantic classes for responsive and theme targeting (Phase 34)
    assert.match(html, /resume-upload-modal-card/, 'Card container must have resume-upload-modal-card class');
    assert.match(html, /resume-upload-engine-badge/, 'Engine pill must have resume-upload-engine-badge class');
    assert.match(html, /resume-upload-progress-track/, 'Progress track must have resume-upload-progress-track class');
  });

  await t.test('theme.css contains premier light mode overrides for resume upload loader (Phase 34)', () => {
    const themeCssPath = path.join(__dirname, '..', 'public', 'css', 'theme.css');
    const themeCss = fs.readFileSync(themeCssPath, 'utf8');

    assert.match(themeCss, /\[data-theme="light"\] #resume-upload-blocking-overlay/, 'Light mode overlay selector must be defined');
    assert.match(themeCss, /\[data-theme="light"\] #resume-upload-blocking-overlay \.resume-upload-modal-card[\s\S]*?background:\s*#FFFFFF/i, 'Card must turn #FFFFFF in light mode');
    assert.match(themeCss, /\[data-theme="light"\] #resume-upload-blocking-overlay \.resume-upload-engine-badge/, 'Engine badge must have light mode styling');
    assert.match(themeCss, /\[data-theme="light"\] #resume-upload-blocking-overlay \.resume-upload-progress-track/, 'Progress track must have light mode styling');
    assert.match(themeCss, /\[data-theme="light"\] #resume-upload-blocking-overlay #resume-upload-status-text/, 'Status text must have light mode styling');
  });

  await t.test('components.css contains orbital-spin and indeterminate progress keyframes', () => {
    const cssPath = path.join(__dirname, '..', 'public', 'css', 'components.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.match(css, /@keyframes orbital-spin/, 'Keyframes orbital-spin must be defined in CSS');
    assert.match(css, /@keyframes parse-progress-indeterminate/, 'Keyframes parse-progress-indeterminate must be defined in CSS');
    assert.match(css, /\.animate-orbital-spin/, '.animate-orbital-spin utility must be defined in CSS');
    assert.match(css, /\.resume-parse-progress-bar/, '.resume-parse-progress-bar class must be defined in CSS');
  });

  await t.test('profile.js implements loader lifecycle and dispatches resume-parse-complete', () => {
    const profileJsPath = path.join(__dirname, '..', 'public', 'js', 'profile.js');
    const js = fs.readFileSync(profileJsPath, 'utf8');

    // Function definitions
    assert.match(js, /function showResumeUploadLoader\(\)/, 'showResumeUploadLoader function must be declared');
    assert.match(js, /function hideResumeUploadLoader\(\)/, 'hideResumeUploadLoader function must be declared');
    assert.match(js, /RESUME_PARSER_STAGES/, 'RESUME_PARSER_STAGES array must exist');

    // Triggering condition: only if not wizard
    assert.match(js, /if \(!isWizardOpen\) \{[\s\S]*?showResumeUploadLoader\(\);[\s\S]*?\}/, 'showResumeUploadLoader should only trigger if wizard is not open');

    // Always hidden in finally
    assert.match(js, /finally \{[\s\S]*?hideResumeUploadLoader\(\);/, 'hideResumeUploadLoader must be invoked in finally block');

    // Custom event dispatched on completion
    assert.match(js, /new CustomEvent\('resume-parse-complete'/, 'resume-parse-complete CustomEvent must be dispatched');
  });
});
