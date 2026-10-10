const fs = require('fs');
const assert = require('assert');

console.log('🧪 Testing Phase 20: Toast Visibility, Light Palette & EROFS Resilience...');

// 1. Check docker-compose.yml
const compose = fs.readFileSync('docker-compose.yml', 'utf8');
assert(!compose.includes('/app/.env:ro'), 'docker-compose.yml must not mount .env with :ro');
assert(compose.includes('/app/.env'), 'docker-compose.yml must mount .env');
console.log('   ✔ docker-compose.yml .env mount verified without :ro');

// 2. Check settings.js EROFS safety
const settingsRoute = fs.readFileSync('src/routes/settings.js', 'utf8');
assert(settingsRoute.includes('Notice: Could not persist to'), 'settings.js must have catch for env writes');
assert(settingsRoute.includes('currSettings.api_keys.adzuna ='), 'settings.js must persist Adzuna credentials to settings');
assert(settingsRoute.includes('currSettings.api_keys.usajobs ='), 'settings.js must persist USAJOBS credentials to settings');
console.log('   ✔ settings.js EROFS resilience & settingsHelper persistence verified');

// 3. Check server.js credential hydration
const serverCode = fs.readFileSync('server.js', 'utf8');
assert(serverCode.includes('currentSettings.api_keys'), 'server.js must hydrate api_keys on startup');
console.log('   ✔ server.js startup credential hydration verified');

// 4. Check theme.css eye-friendly tokens and toast styles
const themeCss = fs.readFileSync('public/css/theme.css', 'utf8');
assert(themeCss.includes('--bg-base: #EDEFF2;'), 'theme.css must use eye-friendly #EDEFF2 canvas');
assert(themeCss.includes('--text-primary: #1E232B;'), 'theme.css must use ergonomic charcoal #1E232B text');
assert(themeCss.includes('.toast-notification'), 'theme.css must define .toast-notification');
assert(themeCss.includes('[data-theme="light"] .toast-notification'), 'theme.css must define light theme toast override');
assert(themeCss.includes('[data-theme="light"] .toast-success'), 'theme.css must define light theme success toast');
assert(themeCss.includes('[data-theme="light"] .toast-error'), 'theme.css must define light theme error toast');
console.log('   ✔ theme.css eye-friendly palette and toast system verified');

// 5. Check utils.js showToast implementation
const utilsJs = fs.readFileSync('public/js/utils.js', 'utf8');
assert(utilsJs.includes('toast-notification'), 'utils.js must use toast-notification class');
assert(utilsJs.includes('toast-icon'), 'utils.js must render semantic toast-icon SVG');
assert(utilsJs.includes('addEventListener(\'click\''), 'utils.js must support click dismissal');
console.log('   ✔ utils.js showToast implementation verified');

console.log('🎉 ALL PHASE 20 STATIC & COMPONENT ASSERTIONS PASSED!');
