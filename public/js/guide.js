/**
 * public/js/guide.js — Interactive Onboarding & Workflow Guide Controller
 *
 * Walks candidates through the end-to-end Jobryt workflow:
 *  1. Import Resume -> 2. Master Profile -> 3. Search Preferences ->
 *  4. Schedule Cron / Manual Scan -> 5. Opportunities Review -> 6. Application Tracking
 */

async function refreshWorkflowGuide() {
  const guideContainer = document.getElementById('workflow-guide-content');
  if (!guideContainer) return;

  try {
    const [statusRes, profileRes, settingsRes, schedRes] = await Promise.all([
      fetch('/api/status').then(r => r.json()).catch(() => ({})),
      fetch('/api/profile').then(r => r.json()).catch(() => ({})),
      fetch('/api/settings').then(r => r.json()).catch(() => ({})),
      fetch('/api/scheduler').then(r => r.json()).catch(() => ({}))
    ]);

    const candidate = statusRes.candidate || {};
    const counts = statusRes.counts || { seen: 0, pending: 0, applied: 0, rejected: 0 };
    const hasResume = Boolean(candidate.name && candidate.name !== 'Not Configured' && (candidate.experience_count > 0 || candidate.skills_count > 0));
    const targetTitles = candidate.target_titles || [];
    const locations = candidate.locations || [];
    const minScore = settingsRes.score_threshold || 60;
    const cronSchedule = schedRes.schedule || '0 9 * * *';
    const cronDesc = schedRes.description || 'Daily at 9:00 AM';
    const cronEnabled = schedRes.enabled !== false;

    // Update Step 1 Status
    const step1Badge = document.getElementById('guide-step1-status');
    const step1Desc = document.getElementById('guide-step1-desc');
    if (step1Badge) {
      if (hasResume) {
        step1Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        step1Badge.innerHTML = '✓ Resume Imported';
        if (step1Desc) step1Desc.innerText = `Active candidate: ${candidate.name} (${candidate.skills_count} skills, ${candidate.experience_count} roles).`;
      } else {
        step1Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20';
        step1Badge.innerHTML = '⚠ Needs Resume';
        if (step1Desc) step1Desc.innerText = 'Upload your PDF or paste resume text to automatically populate your baseline.';
      }
    }

    // Update Step 2 Status
    const step2Badge = document.getElementById('guide-step2-status');
    const step2Desc = document.getElementById('guide-step2-desc');
    if (step2Badge) {
      if (hasResume && candidate.skills_count > 0) {
        step2Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        step2Badge.innerHTML = '✓ Ground Truth Active';
        if (step2Desc) step2Desc.innerText = `Zero-fabrication baseline ready with ${candidate.skills_count} verifiable skills and timeline.`;
      } else {
        step2Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20';
        step2Badge.innerHTML = 'Pending Profile';
        if (step2Desc) step2Desc.innerText = 'Ensure your roles, bullet points, and skills are accurate.';
      }
    }

    // Update Step 3 Status
    const step3Badge = document.getElementById('guide-step3-status');
    const step3Desc = document.getElementById('guide-step3-desc');
    if (step3Badge) {
      if (targetTitles.length > 0) {
        step3Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        step3Badge.innerHTML = '✓ Rules Configured';
        if (step3Desc) step3Desc.innerText = `Targeting "${targetTitles.slice(0, 2).join(', ')}" in "${locations.slice(0, 2).join(', ')}" (${minScore}+ score).`;
      } else {
        step3Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20';
        step3Badge.innerHTML = '⚠ Needs Preferences';
      }
    }

    // Update Step 4 Status
    const step4Badge = document.getElementById('guide-step4-status');
    const step4Desc = document.getElementById('guide-step4-desc');
    if (step4Badge) {
      if (cronEnabled) {
        step4Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        step4Badge.innerHTML = '✓ Cron Active';
        if (step4Desc) step4Desc.innerText = `Automated scan runs ${cronDesc} (${cronSchedule}) across 6+ multi-board aggregators.`;
      } else {
        step4Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20';
        step4Badge.innerHTML = 'Cron Paused';
        if (step4Desc) step4Desc.innerText = 'Scheduler is paused. You can trigger scans manually or re-enable the cron.';
      }
    }

    // Update Step 5 Status
    const step5Badge = document.getElementById('guide-step5-status');
    const step5Desc = document.getElementById('guide-step5-desc');
    if (step5Badge) {
      step5Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20';
      step5Badge.innerHTML = `${counts.pending} In Discovery Queue`;
      if (step5Desc) step5Desc.innerText = `${counts.pending} pre-scored opportunities waiting for review, 1-click ATS tailoring, and approval.`;
    }

    // Update Step 6 Status
    const step6Badge = document.getElementById('guide-step6-status');
    const step6Desc = document.getElementById('guide-step6-desc');
    if (step6Badge) {
      step6Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20';
      step6Badge.innerHTML = `${counts.applied} Tracked Applications`;
      if (step6Desc) step6Desc.innerText = `Full LinkedIn-style stage manager tracking: Tailored ➔ Applied ➔ Interviewing ➔ Offer.`;
    }

  } catch (err) {
    console.error('refreshWorkflowGuide error:', err);
  }
}

// ==========================================
// Quick Setup & Welcome Wizard Controller
// ==========================================

let wizardCurrentStep = 1;
let wizardRolesList = [];
let wizardLocationsList = [];
let wizardSchedulePreset = 'daily9am';
let wizardCountryCode = 'CA';

function openWelcomeWizard() {
  wizardCurrentStep = 1;

  // Initialize roles from global state or defaults
  if (Array.isArray(window.targetRolesList) && window.targetRolesList.length) {
    wizardRolesList = [...window.targetRolesList];
  } else if (currentProfile && (currentProfile.role || currentProfile.target_titles)) {
    wizardRolesList = Array.isArray(currentProfile.target_titles) && currentProfile.target_titles.length
      ? [...currentProfile.target_titles]
      : (currentProfile.role ? [currentProfile.role] : ['Full Stack Developer']);
  } else {
    wizardRolesList = ['Full Stack Developer'];
  }

  // Initialize locations from global state or defaults
  if (Array.isArray(window.targetLocationsList) && window.targetLocationsList.length) {
    wizardLocationsList = [...window.targetLocationsList];
  } else if (currentProfile && currentProfile.locations && currentProfile.locations.length) {
    wizardLocationsList = [...currentProfile.locations];
  } else {
    wizardLocationsList = ['Toronto, Ontario', 'Remote'];
  }

  // Detect candidate country from settings or master profile
  let detectedCountry = 'CA';
  if (typeof currentSettings !== 'undefined' && currentSettings && currentSettings.country_scope && currentSettings.country_scope !== 'AUTO') {
    detectedCountry = currentSettings.country_scope;
  } else if (typeof currentProfile !== 'undefined' && currentProfile) {
    if (currentProfile.contact && currentProfile.contact.country) {
      detectedCountry = currentProfile.contact.country.toUpperCase();
    } else if (Array.isArray(currentProfile.locations) && currentProfile.locations.length) {
      const locStr = currentProfile.locations.join(' ').toLowerCase();
      if (locStr.includes('usa') || locStr.includes('united states') || locStr.includes(', ca') || locStr.includes(', ny') || locStr.includes(', tx')) detectedCountry = 'US';
      else if (locStr.includes('india') || locStr.includes('bengaluru') || locStr.includes('hyderabad') || locStr.includes('delhi')) detectedCountry = 'IN';
      else if (locStr.includes('uk') || locStr.includes('london') || locStr.includes('united kingdom')) detectedCountry = 'GB';
      else if (locStr.includes('germany') || locStr.includes('berlin') || locStr.includes('munich')) detectedCountry = 'DE';
      else if (locStr.includes('canada') || locStr.includes('toronto') || locStr.includes('vancouver')) detectedCountry = 'CA';
    }
  }
  wizardCountryCode = detectedCountry;
  const countrySelect = document.getElementById('wizard-country-select');
  if (countrySelect) {
    const hasOption = Array.from(countrySelect.options).some(o => o.value === detectedCountry);
    countrySelect.value = hasOption ? detectedCountry : 'AUTO';
  }
  renderWizardLocationSuggestions(countrySelect ? countrySelect.value : detectedCountry);

  renderWizardRoles();
  renderWizardLocations();
  selectWizardSchedulePreset(wizardSchedulePreset);
  setupWizardInputListeners();

  const modal = document.getElementById('welcome-wizard-modal');
  if (modal) modal.classList.remove('hidden');

  goToWizardStep(1);
}

function closeWelcomeWizard() {
  const modal = document.getElementById('welcome-wizard-modal');
  if (modal) modal.classList.add('hidden');
  const onboarded = localStorage.getItem('jobryt_onboarded');
  if (!onboarded) {
    localStorage.setItem('jobryt_onboarded', 'dismissed');
  }
}

function skipWelcomeWizard() {
  localStorage.setItem('jobryt_onboarded', 'dismissed');
  const modal = document.getElementById('welcome-wizard-modal');
  if (modal) modal.classList.add('hidden');
  if (typeof showToast === 'function') {
    showToast('Setup skipped. You can relaunch the wizard anytime from Settings.', 'info');
  }
}

function goToWizardStep(stepNum) {
  wizardCurrentStep = stepNum;

  // Update progress bar
  const progressBar = document.getElementById('wizard-progress-bar');
  const progressPercent = document.getElementById('wizard-progress-percentage');
  const indicatorText = document.getElementById('wizard-step-indicator-text');

  const stepTitles = [
    'Upload Resume',
    'Target Roles & Locations',
    'Scan Frequency',
    'Ready to Start'
  ];

  const pct = Math.round((stepNum / 4) * 100);
  if (progressBar) progressBar.style.width = `${pct}%`;
  if (progressPercent) progressPercent.innerText = `${pct}%`;
  if (indicatorText) indicatorText.innerText = `Step ${stepNum} of 4: ${stepTitles[stepNum - 1]}`;

  // Toggle step panels
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`wizard-step-${i}`);
    if (el) {
      if (i === stepNum) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  }

  // Prev button
  const prevBtn = document.getElementById('wizard-btn-prev');
  if (prevBtn) {
    if (stepNum > 1) prevBtn.classList.remove('hidden');
    else prevBtn.classList.add('hidden');
  }

  // Next vs Finish buttons
  const nextBtn = document.getElementById('wizard-btn-next');
  const finishBtn = document.getElementById('wizard-btn-finish');
  if (nextBtn && finishBtn) {
    if (stepNum === 4) {
      nextBtn.classList.add('hidden');
      finishBtn.classList.remove('hidden');
      updateWizardSummary();
    } else {
      nextBtn.classList.remove('hidden');
      finishBtn.classList.add('hidden');
    }
  }
}

function nextWizardStep() {
  if (wizardCurrentStep < 4) {
    goToWizardStep(wizardCurrentStep + 1);
  }
}

function prevWizardStep() {
  if (wizardCurrentStep > 1) {
    goToWizardStep(wizardCurrentStep - 1);
  }
}

function triggerResumeUploadFromWizard() {
  const fileInput = document.getElementById('resume-file-input');
  if (!fileInput) return;

  // One-time listener to update status in wizard
  fileInput.addEventListener('change', function onUpload(e) {
    const file = e.target.files && e.target.files[0];
    const statusEl = document.getElementById('wizard-resume-status');
    if (statusEl && file) {
      statusEl.className = 'text-xs text-emerald-400 font-semibold flex items-center gap-1';
      statusEl.innerHTML = `✓ ${escapeHtml(file.name)} loaded!`;
    }
    fileInput.removeEventListener('change', onUpload);
  }, { once: true });

  fileInput.click();
}

function setupWizardInputListeners() {
  const roleInput = document.getElementById('wizard-role-input');
  if (roleInput && !roleInput.dataset.bound) {
    roleInput.dataset.bound = 'true';
    roleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addWizardRole(roleInput.value);
        roleInput.value = '';
      }
    });
  }

  const locInput = document.getElementById('wizard-location-input');
  if (locInput && !locInput.dataset.bound) {
    locInput.dataset.bound = 'true';
    locInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addWizardLocation(locInput.value);
        locInput.value = '';
      }
    });
  }
}

function addWizardRole(role) {
  if (!role || typeof role !== 'string') return;
  const clean = role.trim();
  if (!clean) return;
  if (wizardRolesList.length >= 10) {
    if (typeof showToast === 'function') {
      showToast('Maximum 10 job roles allowed.', 'warning');
    }
    return;
  }
  if (!wizardRolesList.some(r => r.toLowerCase() === clean.toLowerCase())) {
    wizardRolesList.push(clean);
    renderWizardRoles();
  }
}

function removeWizardRole(index) {
  wizardRolesList.splice(index, 1);
  renderWizardRoles();
}

function renderWizardRoles() {
  const container = document.getElementById('wizard-roles-container');
  const input = document.getElementById('wizard-role-input');
  if (!container || !input) return;

  container.querySelectorAll('.wizard-role-tag').forEach(t => t.remove());

  wizardRolesList.forEach((role, idx) => {
    const chip = document.createElement('span');
    chip.className = 'wizard-role-tag inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#242830] text-[#D9A441] border border-[#D9A441]/30';
    chip.innerHTML = `
      <span>${escapeHtml(role)}</span>
      <button type="button" onclick="removeWizardRole(${idx})" class="text-[#9AA0A6] hover:text-white ml-0.5 cursor-pointer" title="Remove">&times;</button>
    `;
    container.insertBefore(chip, input);
  });
}

function addWizardLocation(loc) {
  if (!loc || typeof loc !== 'string') return;
  const clean = loc.trim();
  if (!clean) return;
  if (wizardLocationsList.length >= 5) {
    if (typeof showToast === 'function') {
      showToast('Maximum 5 cities allowed to prevent exceeding API scoring limits.', 'warning');
    }
    return;
  }
  if (!wizardLocationsList.some(l => l.toLowerCase() === clean.toLowerCase())) {
    wizardLocationsList.push(clean);
    renderWizardLocations();
  }
}

function removeWizardLocation(index) {
  wizardLocationsList.splice(index, 1);
  renderWizardLocations();
}

function renderWizardLocations() {
  const container = document.getElementById('wizard-locations-container');
  const input = document.getElementById('wizard-location-input');
  if (!container || !input) return;

  container.querySelectorAll('.wizard-location-tag').forEach(t => t.remove());

  wizardLocationsList.forEach((loc, idx) => {
    const chip = document.createElement('span');
    chip.className = 'wizard-location-tag inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#242830] text-[#5FA8A0] border border-[#5FA8A0]/30';
    chip.innerHTML = `
      <span>${escapeHtml(loc)}</span>
      <button type="button" onclick="removeWizardLocation(${idx})" class="text-[#9AA0A6] hover:text-white ml-0.5 cursor-pointer" title="Remove">&times;</button>
    `;
    container.insertBefore(chip, input);
  });
}

async function renderWizardLocationSuggestions(countryCode) {
  const container = document.getElementById('wizard-location-suggestions');
  if (!container) return;

  const code = countryCode || wizardCountryCode || 'CA';
  const badge = document.getElementById('wizard-country-badge');
  if (badge) {
    const label = (code && code !== 'ALL' && code !== 'AUTO') ? code : 'Global';
    badge.innerText = `${label} Autocomplete`;
  }

  let hubs = [];
  try {
    const res = await fetch(`/api/settings/cities?country=${encodeURIComponent(code)}`);
    if (res.ok) {
      const data = await res.json();
      hubs = data.popular_hubs || [];
    }
  } catch (e) {
    console.warn('Error fetching wizard city hubs:', e);
  }

  if (!hubs || !hubs.length) {
    hubs = ['Remote', 'New York, NY', 'Toronto, ON', 'London, UK', 'Bengaluru, KA', 'Berlin, Germany'];
  }

  const label = (code && code !== 'ALL' && code !== 'AUTO') ? code : 'Global';
  container.innerHTML = `
    <span class="text-[11px] text-[#9AA0A6]">Top ${escapeHtml(label)} hubs:</span>
    ${hubs.slice(0, 6).map(hub => {
      const shortName = hub.split(',')[0].trim();
      return `<button type="button" onclick="addWizardLocation('${escapeHtml(hub)}')" class="text-[11px] px-2 py-0.5 rounded bg-[#242830] hover:bg-[#2B3036] text-[#E8E6E1] border border-[#2B3036] hover:border-[#5FA8A0] transition-colors cursor-pointer">+ ${escapeHtml(shortName)}</button>`;
    }).join('')}
  `;
}

async function onWizardCountryChange() {
  const select = document.getElementById('wizard-country-select');
  if (!select) return;
  wizardCountryCode = select.value;
  await renderWizardLocationSuggestions(wizardCountryCode);

  // Sync with settings dropdown if present
  const cfgScope = document.getElementById('cfg-scope');
  if (cfgScope && wizardCountryCode !== 'AUTO') {
    cfgScope.value = wizardCountryCode;
    if (typeof onCountryScopeChange === 'function') {
      onCountryScopeChange();
    }
  }
}

function selectWizardSchedulePreset(presetId) {
  wizardSchedulePreset = presetId;
  const presets = ['daily9am', 'twice_daily', 'every_4h', 'manual'];

  presets.forEach(p => {
    const btn = document.getElementById(`wizard-preset-${p}`);
    if (!btn) return;
    if (p === presetId) {
      btn.className = 'p-3 rounded-lg border text-left transition-all border-[#D9A441] bg-[#D9A441]/10 cursor-pointer shadow-xs';
    } else {
      btn.className = 'p-3 rounded-lg border text-left transition-all border-[#2B3036] bg-[#181B20] hover:border-[#3D444D] cursor-pointer';
    }
  });
}

function updateWizardSummary() {
  const rolesEl = document.getElementById('wizard-summary-roles');
  const locsEl = document.getElementById('wizard-summary-locations');
  const schedEl = document.getElementById('wizard-summary-schedule');

  if (rolesEl) rolesEl.innerText = wizardRolesList.length ? wizardRolesList.join(', ') : 'Open to All Roles';
  const countryTag = (wizardCountryCode && wizardCountryCode !== 'AUTO') ? ` (${wizardCountryCode})` : '';
  if (locsEl) locsEl.innerText = (wizardLocationsList.length ? wizardLocationsList.join(', ') : 'All Open Locations') + countryTag;

  const scheduleLabels = {
    'daily9am': 'Daily at 9:00 AM (Recommended)',
    'twice_daily': 'Twice Daily (9 AM & 5 PM)',
    'every_4h': 'Every 4 Hours',
    'manual': 'Manual Only'
  };
  if (schedEl) schedEl.innerText = scheduleLabels[wizardSchedulePreset] || 'Daily at 9:00 AM';
}

async function finishWelcomeWizard() {
  // Sync wizard data into main app state
  if (wizardRolesList.length) {
    window.targetRolesList = [...wizardRolesList];
    if (typeof renderRoleTags === 'function') renderRoleTags();
  }
  if (wizardLocationsList.length) {
    window.targetLocationsList = [...wizardLocationsList];
    if (typeof renderLocationTags === 'function') renderLocationTags();
  }

  // Sync country scope from wizard to settings
  const countrySelect = document.getElementById('wizard-country-select');
  if (countrySelect && countrySelect.value) {
    const cfgScope = document.getElementById('cfg-scope');
    if (cfgScope) cfgScope.value = countrySelect.value;
  }

  // Default workplace to Open to All if dropdown present
  const wpSelect = document.getElementById('cfg-workplace-type');
  if (wpSelect && (!wpSelect.value || wpSelect.value === '')) {
    wpSelect.value = 'all';
  }

  // Apply scheduler preset
  if (typeof selectSchedulerPreset === 'function') {
    selectSchedulerPreset(wizardSchedulePreset);
  }

  // Persist settings
  if (typeof saveAllSettings === 'function') {
    await saveAllSettings();
  }

  localStorage.setItem('jobryt_onboarded', 'true');
  closeWelcomeWizard();

  if (typeof showToast === 'function') {
    showToast('🚀 Setup complete! Searching for your best matches...');
  }

  // Switch to Find Jobs view
  if (typeof selectNavTab === 'function') {
    selectNavTab('feed');
  }
  if (typeof loadPendingJobs === 'function') {
    loadPendingJobs();
  }
}

async function checkFirstTimeOnboarding() {
  try {
    const onboarded = localStorage.getItem('jobryt_onboarded');
    if (onboarded === 'true' || onboarded === 'dismissed') {
      return;
    }

    // Check if user already has an active profile or roles/locations in memory
    if (window.currentProfile && (
      (Array.isArray(window.currentProfile.target_titles) && window.currentProfile.target_titles.length > 0) ||
      (Array.isArray(window.currentProfile.locations) && window.currentProfile.locations.length > 0) ||
      window.currentProfile.contact?.name
    )) {
      localStorage.setItem('jobryt_onboarded', 'true');
      return;
    }

    // Double check with backend master profile
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        const prof = data.profile || data;
        if (prof && (
          (Array.isArray(prof.target_titles) && prof.target_titles.length > 0) ||
          (Array.isArray(prof.locations) && prof.locations.length > 0) ||
          prof.contact?.name
        )) {
          localStorage.setItem('jobryt_onboarded', 'true');
          return;
        }
      }
    } catch (e) {
      // Non-fatal profile check error
    }

    // Virgin setup only: trigger initial onboarding once
    setTimeout(() => {
      openWelcomeWizard();
    }, 600);
  } catch (err) {
    console.error('checkFirstTimeOnboarding error:', err);
  }
}

// Window exports
window.openWelcomeWizard = openWelcomeWizard;
window.closeWelcomeWizard = closeWelcomeWizard;
window.skipWelcomeWizard = skipWelcomeWizard;
window.addWizardRole = addWizardRole;
window.removeWizardRole = removeWizardRole;
window.addWizardLocation = addWizardLocation;
window.removeWizardLocation = removeWizardLocation;
window.onWizardCountryChange = onWizardCountryChange;
window.renderWizardLocationSuggestions = renderWizardLocationSuggestions;
window.selectWizardSchedulePreset = selectWizardSchedulePreset;
window.nextWizardStep = nextWizardStep;
window.prevWizardStep = prevWizardStep;
window.finishWelcomeWizard = finishWelcomeWizard;

