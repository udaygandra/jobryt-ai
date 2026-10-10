/**
 * Jobryt AI - Candidate Dossier & Master Profile Ground Truth
 */

async function loadProfile() {
  try {
    const res = await fetch('/api/profile');
    currentProfile = await res.json();
    populateProfileForm(currentProfile);

    // Pre-fill and sync manual config fields in Search Rules
    window.targetRolesList = Array.isArray(currentProfile.target_titles) && currentProfile.target_titles.length
      ? [...currentProfile.target_titles]
      : (Array.isArray(currentProfile.target_roles) && currentProfile.target_roles.length ? [...currentProfile.target_roles] : (currentProfile.role ? [currentProfile.role] : []));
    window.targetLocationsList = Array.isArray(currentProfile.locations) && currentProfile.locations.length
      ? [...currentProfile.locations]
      : (currentProfile.contact && currentProfile.contact.location ? [currentProfile.contact.location] : ['Remote']);

    if (typeof renderRoleTags === 'function') renderRoleTags();
    if (typeof renderLocationTags === 'function') renderLocationTags();
  } catch (e) {
    console.error('loadProfile error:', e);
  }
}

window.profileSkillsList = [];

// Exact decimal experience rounding: 0.5 increments
// 2.25 rounds to 2, 2.3 rounds to 2.5, 2.75 rounds to 2.5, 2.8 rounds to 3
function roundExperienceYears(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'string') {
    const m = val.match(/(\d+(?:\.\d+)?)/);
    if (m) val = parseFloat(m[1]);
    else return 0;
  }
  const num = parseFloat(val);
  if (isNaN(num) || num < 0) return 0;
  const base = Math.floor(num);
  const dec = num - base;
  if (dec <= 0.25) return base;
  if (dec <= 0.75) return base + 0.5;
  return base + 1.0;
}

function onExperienceInputChange() {
  const input = document.getElementById('prof-total-exp');
  if (!input) return;
  const rounded = roundExperienceYears(input.value);
  input.value = rounded;
  updateExperienceBadge(rounded);
  syncFormToJson();
}

function stepExperienceYears(delta) {
  const input = document.getElementById('prof-total-exp');
  if (!input) return;
  const current = roundExperienceYears(input.value);
  const next = Math.max(0, roundExperienceYears(current + delta));
  input.value = next;
  updateExperienceBadge(next);
  syncFormToJson();
}

function updateExperienceBadge(years) {
  const badge = document.getElementById('prof-years-badge');
  if (badge) {
    badge.innerText = `${years} Yrs Exp`;
  }
}

// Workday-Style Skills Tag Manager
function renderProfileSkillsTags() {
  const container = document.getElementById('prof-skills-tag-container');
  const countEl = document.getElementById('prof-skills-count');
  if (!container) return;
  if (countEl) countEl.innerText = `${window.profileSkillsList.length} skills`;

  if (!window.profileSkillsList.length) {
    container.innerHTML = `<span class="text-xs text-[#5F6B76] italic self-center px-1">No skills added yet. Type a skill and click Add or upload a resume.</span>`;
    return;
  }

  container.innerHTML = window.profileSkillsList.map((skill, idx) => `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-[#1C1F24] border border-[#2B3036] text-[#E8E6E1] hover:border-[#D9A441]/40 transition-colors">
      <span>${escapeHtml(skill)}</span>
      <button type="button" onclick="removeProfileSkill(${idx})" class="text-[#9AA0A6] hover:text-[#E5786D] transition-colors ml-0.5 cursor-pointer text-xs" title="Remove ${escapeHtml(skill)}">×</button>
    </span>
  `).join('');
}

function addProfileSkill(skill) {
  const trimmed = (skill || '').trim();
  if (!trimmed) return;
  const exists = window.profileSkillsList.some(s => s.toLowerCase() === trimmed.toLowerCase());
  if (!exists) {
    window.profileSkillsList.push(trimmed);
    renderProfileSkillsTags();
    syncFormToJson();
  }
}

function addProfileSkillFromInput() {
  const input = document.getElementById('prof-skill-input');
  if (!input) return;
  const val = input.value;
  if (!val.trim()) return;

  const parts = val.split(',').map(s => s.trim()).filter(Boolean);
  parts.forEach(part => addProfileSkill(part));
  input.value = '';
  input.focus();
}

function handleProfileSkillKeyDown(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addProfileSkillFromInput();
  }
}

function removeProfileSkill(idx) {
  if (idx >= 0 && idx < window.profileSkillsList.length) {
    window.profileSkillsList.splice(idx, 1);
    renderProfileSkillsTags();
    syncFormToJson();
  }
}

function populateProfileForm(prof) {
  if (!prof) prof = {};
  currentProfile = prof;

  if (document.getElementById('prof-name')) document.getElementById('prof-name').value = prof.name || '';
  if (document.getElementById('prof-email')) document.getElementById('prof-email').value = (prof.contact && prof.contact.email) || '';
  if (document.getElementById('prof-phone')) document.getElementById('prof-phone').value = (prof.contact && prof.contact.phone) || '';
  if (document.getElementById('prof-location')) document.getElementById('prof-location').value = (prof.contact && prof.contact.location) || (prof.locations && prof.locations[0]) || '';
  if (document.getElementById('prof-status')) document.getElementById('prof-status').value = (prof.contact && prof.contact.status) || '';
  if (document.getElementById('prof-linkedin')) document.getElementById('prof-linkedin').value = (prof.contact && prof.contact.linkedin) || '';
  if (document.getElementById('prof-github')) document.getElementById('prof-github').value = (prof.contact && prof.contact.github) || '';
  const targetRoles = (Array.isArray(prof.target_titles) && prof.target_titles.length)
    ? prof.target_titles
    : ((Array.isArray(prof.target_roles) && prof.target_roles.length) ? prof.target_roles : (prof.role ? [prof.role] : []));
  if (document.getElementById('prof-target-roles')) document.getElementById('prof-target-roles').value = targetRoles.join(', ');

  // Decimal experience rounding
  const roundedYears = roundExperienceYears(prof.total_experience_stated || prof.years_of_experience);
  if (document.getElementById('prof-total-exp')) document.getElementById('prof-total-exp').value = roundedYears;
  updateExperienceBadge(roundedYears);

  // Workday-Style Unified Skills List
  window.profileSkillsList = Array.isArray(prof.skills) ? [...prof.skills] : [];
  renderProfileSkillsTags();

  if (document.getElementById('prof-summary')) document.getElementById('prof-summary').value = prof.summary || prof.writing_sample || '';

  const jsonEl = document.getElementById('prof-json');
  if (jsonEl) jsonEl.value = JSON.stringify(prof, null, 2);

  renderExperienceCards(prof.experience || []);
  renderProjectCards(prof.projects || []);
  renderCertificationCards(prof.certifications || []);
  renderEducationCards(prof.education || []);
  updateProfileCounters();

  // Sync tags in Search Preferences
  window.targetRolesList = targetRoles.length ? [...targetRoles] : (window.targetRolesList || []);
  const targetLocs = (Array.isArray(prof.locations) && prof.locations.length)
    ? prof.locations
    : ((prof.contact && prof.contact.location) ? [prof.contact.location] : []);
  if (targetLocs.length) window.targetLocationsList = [...targetLocs];
  if (typeof renderRoleTags === 'function') renderRoleTags();
  if (typeof renderLocationTags === 'function') renderLocationTags();
}

async function renderProfileCountryBoards(prof = currentProfile) {
  // Deprecated & removed from Profile view to avoid redundancy with Settings
}

// Work Experience Cards
function renderExperienceCards(list) {
  const container = document.getElementById('prof-experience-container');
  if (!container) return;
  container.innerHTML = '';
  if (!list || list.length === 0) {
    container.innerHTML = `
      <div class="empty-exp-hint p-4 rounded-md border border-dashed border-[#2B3036] text-center text-xs text-[#9AA0A6]">
        No work experience added yet. Click <b>"Add Experience"</b> or <b>"Upload Resume"</b> to populate automatically.
      </div>
    `;
    return;
  }
  list.forEach(item => {
    container.appendChild(createExperienceCardElement(item));
  });
}

function createExperienceCardElement(item = {}) {
  const card = document.createElement('div');
  card.className = 'exp-card p-4 rounded-md bg-[#1C1F24] border border-[#2B3036] space-y-3 relative group';

  const role = item.role || item.title || item.job_title || '';
  const company = item.company || '';
  const project = item.project || '';
  let start = item.start_date || '';
  let end = item.end_date || '';
  if (!start && !end && item.dates) {
    const parts = item.dates.split(/\s*[–—\-]|to\s*/i);
    start = (parts[0] || '').trim();
    end = (parts[1] || '').trim();
  }
  const location = item.location || '';
  let bullets = '';
  if (Array.isArray(item.bullets)) {
    bullets = item.bullets.join('\n');
  } else if (typeof item.bullets === 'string') {
    bullets = item.bullets;
  }

  card.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-[#D9A441]"></span>
        <span class="text-xs font-semibold uppercase tracking-wider text-[#E8E6E1] exp-card-title">${escapeHtml(role || 'New Role')}${project ? ` (${escapeHtml(project)})` : ''} @ ${escapeHtml(company || 'Company')}</span>
      </div>
      <button type="button" onclick="removeExperienceCard(this)" title="Remove Role" class="text-xs text-[#9AA0A6] hover:text-rose-400 p-1 rounded hover:bg-[#242830] transition-colors">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      </button>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
      <div>
        <label class="block text-[10px] font-semibold uppercase tracking-wider text-[#9AA0A6] mb-1">Role / Job Title</label>
        <input type="text" value="${escapeHtml(role)}" oninput="updateExpCardHeader(this); syncFormToJson();" class="exp-role w-full px-3 py-1.5 rounded bg-[#111317] border border-[#2B3036] focus:border-[#D9A441] text-xs text-[#E8E6E1] placeholder:text-[#5F6B76] outline-none" placeholder="e.g. Senior Java Developer">
      </div>
      <div>
        <label class="block text-[10px] font-semibold uppercase tracking-wider text-[#9AA0A6] mb-1">Company / Organization</label>
        <input type="text" value="${escapeHtml(company)}" oninput="updateExpCardHeader(this); syncFormToJson();" class="exp-company w-full px-3 py-1.5 rounded bg-[#111317] border border-[#2B3036] focus:border-[#D9A441] text-xs text-[#E8E6E1] placeholder:text-[#5F6B76] outline-none" placeholder="e.g. Northwind Digital Inc.">
      </div>
      <div>
        <label class="block text-[10px] font-semibold uppercase tracking-wider text-[#9AA0A6] mb-1">Project / Domain (Optional)</label>
        <input type="text" value="${escapeHtml(project)}" oninput="updateExpCardHeader(this); syncFormToJson();" class="exp-project w-full px-3 py-1.5 rounded bg-[#111317] border border-[#2B3036] focus:border-[#D9A441] text-xs text-[#E8E6E1] placeholder:text-[#5F6B76] outline-none" placeholder="e.g. Power Trading Analytics">
      </div>
      <div>
        <label class="block text-[10px] font-semibold uppercase tracking-wider text-[#9AA0A6] mb-1">Client Name (Optional)</label>
        <input type="text" value="${escapeHtml(item.client || '')}" oninput="updateExpCardHeader(this); syncFormToJson();" class="exp-client w-full px-3 py-1.5 rounded bg-[#111317] border border-[#2B3036] focus:border-[#D9A441] text-xs text-[#E8E6E1] placeholder:text-[#5F6B76] outline-none" placeholder="e.g. Apple, Barclays">
      </div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
      <div>
        <label class="block text-[10px] font-semibold uppercase tracking-wider text-[#9AA0A6] mb-1">Start Date</label>
        <input type="text" value="${escapeHtml(start)}" oninput="syncFormToJson();" class="exp-start w-full px-3 py-1.5 rounded bg-[#111317] border border-[#2B3036] focus:border-[#D9A441] text-xs text-[#E8E6E1] font-mono placeholder:text-[#5F6B76] outline-none" placeholder="e.g. Mar 2021">
      </div>
      <div>
        <label class="block text-[10px] font-semibold uppercase tracking-wider text-[#9AA0A6] mb-1">End Date</label>
        <input type="text" value="${escapeHtml(end)}" oninput="syncFormToJson();" class="exp-end w-full px-3 py-1.5 rounded bg-[#111317] border border-[#2B3036] focus:border-[#D9A441] text-xs text-[#E8E6E1] font-mono placeholder:text-[#5F6B76] outline-none" placeholder="e.g. Present">
      </div>
      <div>
        <label class="block text-[10px] font-semibold uppercase tracking-wider text-[#9AA0A6] mb-1">Location</label>
        <input type="text" value="${escapeHtml(location)}" oninput="syncFormToJson();" class="exp-loc w-full px-3 py-1.5 rounded bg-[#111317] border border-[#2B3036] focus:border-[#D9A441] text-xs text-[#E8E6E1] placeholder:text-[#5F6B76] outline-none" placeholder="e.g. Austin, TX (Hybrid)">
      </div>
    </div>
    <div>
      <label class="block text-[10px] font-semibold uppercase tracking-wider text-[#9AA0A6] mb-1">Key Responsibilities & Quantifiable Achievements (1 per line)</label>
      <textarea rows="3" oninput="syncFormToJson();" class="exp-bullets w-full px-3 py-1.5 rounded bg-[#111317] border border-[#2B3036] focus:border-[#D9A441] text-xs text-[#E8E6E1] leading-relaxed placeholder:text-[#5F6B76] outline-none" placeholder="Led engineering of high-throughput payment microservices...&#10;Decreased P99 latency by 35% with Redis caching...">${escapeHtml(bullets)}</textarea>
    </div>
  `;
  return card;
}

function addExperienceCard(data = {}) {
  const container = document.getElementById('prof-experience-container');
  if (!container) return;
  const hint = container.querySelector('.empty-exp-hint');
  if (hint) hint.remove();
  container.appendChild(createExperienceCardElement(data));
  syncFormToJson();
}

function removeExperienceCard(btn) {
  const card = btn.closest('.exp-card');
  if (card) card.remove();
  const container = document.getElementById('prof-experience-container');
  if (container && container.querySelectorAll('.exp-card').length === 0) {
    container.innerHTML = `
      <div class="empty-exp-hint p-4 rounded-md border border-dashed border-[#2B3036] text-center text-xs text-[#9AA0A6]">
        No work experience added yet. Click <b>"Add Experience"</b> or <b>"Upload Resume"</b> to populate automatically.
      </div>
    `;
  }
  syncFormToJson();
}

function updateExpCardHeader(input) {
  const card = input.closest('.exp-card');
  if (!card) return;
  const role = card.querySelector('.exp-role')?.value.trim() || 'New Role';
  const company = card.querySelector('.exp-company')?.value.trim() || 'Company';
  const project = card.querySelector('.exp-project')?.value.trim() || '';
  const client = card.querySelector('.exp-client')?.value.trim() || '';
  const title = card.querySelector('.exp-card-title');
  const details = [];
  if (project) details.push(`Project: ${project}`);
  if (client) details.push(`Client: ${client}`);
  const detailsStr = details.length ? ` (${details.join(', ')})` : '';
  if (title) title.innerText = `${role}${detailsStr} @ ${company}`;
}

// Key Projects
function renderProjectCards(list) {
  const container = document.getElementById('prof-projects-container');
  if (!container) return;
  container.innerHTML = '';
  if (!list || list.length === 0) {
    container.innerHTML = `
      <div class="empty-proj-hint p-3 rounded-md border border-dashed border-[#2B3036] text-center text-xs text-[#9AA0A6]">
        No technical projects added yet. Click <b>"Add Project"</b> to showcase portfolio work.
      </div>
    `;
    return;
  }
  list.forEach(item => {
    container.appendChild(createProjectCardElement(item));
  });
}

function createProjectCardElement(item = {}) {
  const card = document.createElement('div');
  card.className = 'proj-card p-3.5 rounded-md bg-[#1C1F24] border border-[#2B3036] space-y-2.5 relative';

  const name = item.name || item.title || '';
  const tech = Array.isArray(item.technologies) ? item.technologies.join(', ') : (item.technologies || item.tech || '');
  const desc = item.description || item.desc || '';

  card.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="text-xs font-semibold uppercase tracking-wider text-[#E8E6E1] proj-card-title">${escapeHtml(name || 'New Project')}</span>
      <button type="button" onclick="removeProjectCard(this)" title="Remove Project" class="text-xs text-[#9AA0A6] hover:text-rose-400 p-1 rounded hover:bg-[#242830] transition-colors">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      </button>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div>
        <label class="block text-[10px] font-semibold uppercase tracking-wider text-[#9AA0A6] mb-1">Project Name</label>
        <input type="text" value="${escapeHtml(name)}" oninput="updateProjCardHeader(this); syncFormToJson();" class="proj-name w-full px-3 py-1.5 rounded bg-[#111317] border border-[#2B3036] focus:border-[#D9A441] text-xs text-[#E8E6E1] outline-none" placeholder="e.g. Job Tracker API">
      </div>
      <div>
        <label class="block text-[10px] font-semibold uppercase tracking-wider text-[#9AA0A6] mb-1">Technologies Used (comma separated)</label>
        <input type="text" value="${escapeHtml(tech)}" oninput="syncFormToJson();" class="proj-tech w-full px-3 py-1.5 rounded bg-[#111317] border border-[#2B3036] focus:border-[#D9A441] text-xs text-[#E8E6E1] font-mono outline-none" placeholder="e.g. Spring Boot, PostgreSQL, Kafka">
      </div>
    </div>
    <div>
      <label class="block text-[10px] font-semibold uppercase tracking-wider text-[#9AA0A6] mb-1">Project Description & Architecture</label>
      <textarea rows="2" oninput="syncFormToJson();" class="proj-desc w-full px-3 py-1.5 rounded bg-[#111317] border border-[#2B3036] focus:border-[#D9A441] text-xs text-[#E8E6E1] leading-relaxed outline-none" placeholder="Built microservices architecture supporting real-time indexation...">${escapeHtml(desc)}</textarea>
    </div>
  `;
  return card;
}

function addProjectCard(data = {}) {
  const container = document.getElementById('prof-projects-container');
  if (!container) return;
  const hint = container.querySelector('.empty-proj-hint');
  if (hint) hint.remove();
  container.appendChild(createProjectCardElement(data));
  syncFormToJson();
}

function removeProjectCard(btn) {
  const card = btn.closest('.proj-card');
  if (card) card.remove();
  const container = document.getElementById('prof-projects-container');
  if (container && container.querySelectorAll('.proj-card').length === 0) {
    container.innerHTML = `
      <div class="empty-proj-hint p-3 rounded-md border border-dashed border-[#2B3036] text-center text-xs text-[#9AA0A6]">
        No technical projects added yet. Click <b>"Add Project"</b> to showcase portfolio work.
      </div>
    `;
  }
  syncFormToJson();
}

function updateProjCardHeader(input) {
  const card = input.closest('.proj-card');
  if (!card) return;
  const name = card.querySelector('.proj-name')?.value.trim() || 'New Project';
  const title = card.querySelector('.proj-card-title');
  if (title) title.innerText = name;
}

// Certifications & Licenses
function renderCertificationCards(list) {
  const container = document.getElementById('prof-certifications-container');
  if (!container) return;
  container.innerHTML = '';
  if (!list || list.length === 0) {
    container.innerHTML = `
      <div class="empty-cert-hint p-2.5 rounded-md border border-dashed border-[#2B3036] text-center text-xs text-[#9AA0A6]">
        No certificates added yet. Click <b>"Add Certificate"</b> to attach verified credentials.
      </div>
    `;
    return;
  }
  list.forEach(item => {
    container.appendChild(createCertificationCardElement(item));
  });
}

function createCertificationCardElement(item = {}) {
  const card = document.createElement('div');
  card.className = 'cert-card p-2.5 rounded-md bg-[#1C1F24] border border-[#2B3036] flex items-center gap-2.5';

  let name = '';
  let issuer = '';
  let date = '';

  if (typeof item === 'string') {
    name = item;
    const yearMatch = item.match(/\b(20\d\d|19\d\d)\b/);
    if (yearMatch) date = yearMatch[0];
  } else if (item && typeof item === 'object') {
    name = item.name || item.title || '';
    issuer = item.issuer || item.organization || '';
    date = item.date || item.year || '';
  }

  card.innerHTML = `
    <div class="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
      <div>
        <input type="text" value="${escapeHtml(name)}" oninput="syncFormToJson();" class="cert-name w-full px-2.5 py-1.5 rounded bg-[#111317] border border-[#2B3036] focus:border-[#D9A441] text-xs text-[#E8E6E1] outline-none" placeholder="Certificate / License Name">
      </div>
      <div>
        <input type="text" value="${escapeHtml(issuer)}" oninput="syncFormToJson();" class="cert-issuer w-full px-2.5 py-1.5 rounded bg-[#111317] border border-[#2B3036] focus:border-[#D9A441] text-xs text-[#E8E6E1] outline-none" placeholder="Issuer (e.g. AWS, Oracle, Google)">
      </div>
      <div>
        <input type="text" value="${escapeHtml(date)}" oninput="syncFormToJson();" class="cert-date w-full px-2.5 py-1.5 rounded bg-[#111317] border border-[#2B3036] focus:border-[#D9A441] text-xs text-[#E8E6E1] font-mono outline-none" placeholder="Date / Year (e.g. 2023)">
      </div>
    </div>
    <button type="button" onclick="removeCertificationCard(this)" title="Remove Certificate" class="text-xs text-[#9AA0A6] hover:text-rose-400 p-1.5 rounded hover:bg-[#242830] transition-colors">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
    </button>
  `;
  return card;
}

function addCertificationCard(data = {}) {
  const container = document.getElementById('prof-certifications-container');
  if (!container) return;
  const hint = container.querySelector('.empty-cert-hint');
  if (hint) hint.remove();
  container.appendChild(createCertificationCardElement(data));
  syncFormToJson();
}

function removeCertificationCard(btn) {
  const card = btn.closest('.cert-card');
  if (card) card.remove();
  const container = document.getElementById('prof-certifications-container');
  if (container && container.querySelectorAll('.cert-card').length === 0) {
    container.innerHTML = `
      <div class="empty-cert-hint p-2.5 rounded-md border border-dashed border-[#2B3036] text-center text-xs text-[#9AA0A6]">
        No certificates added yet. Click <b>"Add Certificate"</b> to attach verified credentials.
      </div>
    `;
  }
  syncFormToJson();
}

// Education
function renderEducationCards(list) {
  const container = document.getElementById('prof-education-container');
  if (!container) return;
  container.innerHTML = '';
  if (!list || list.length === 0) {
    container.innerHTML = `
      <div class="empty-edu-hint p-3 rounded-md border border-dashed border-[#2B3036] text-center text-xs text-[#9AA0A6]">
        No degrees added yet. Click <b>"Add Education"</b> to record academic degrees.
      </div>
    `;
    return;
  }
  list.forEach(item => {
    container.appendChild(createEducationCardElement(item));
  });
}

function createEducationCardElement(item = {}) {
  const card = document.createElement('div');
  card.className = 'edu-card p-3.5 rounded-md bg-[#1C1F24] border border-[#2B3036] space-y-2';

  const degree = item.degree || '';
  const institution = item.institution || item.school || '';
  const dates = item.dates || item.year || '';

  card.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="text-xs font-semibold uppercase tracking-wider text-[#E8E6E1] edu-card-title">${escapeHtml(degree || 'New Degree')}</span>
      <button type="button" onclick="removeEducationCard(this)" title="Remove Education" class="text-xs text-[#9AA0A6] hover:text-rose-400 p-1 rounded hover:bg-[#242830] transition-colors">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      </button>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <div>
        <label class="block text-[10px] font-semibold uppercase tracking-wider text-[#9AA0A6] mb-1">Degree / Qualification</label>
        <input type="text" value="${escapeHtml(degree)}" oninput="updateEduCardHeader(this); syncFormToJson();" class="edu-degree w-full px-3 py-1.5 rounded bg-[#111317] border border-[#2B3036] focus:border-[#D9A441] text-xs text-[#E8E6E1] outline-none" placeholder="e.g. B.S. in Computer Science">
      </div>
      <div>
        <label class="block text-[10px] font-semibold uppercase tracking-wider text-[#9AA0A6] mb-1">Institution / University</label>
        <input type="text" value="${escapeHtml(institution)}" oninput="syncFormToJson();" class="edu-inst w-full px-3 py-1.5 rounded bg-[#111317] border border-[#2B3036] focus:border-[#D9A441] text-xs text-[#E8E6E1] outline-none" placeholder="e.g. Example State University">
      </div>
      <div>
        <label class="block text-[10px] font-semibold uppercase tracking-wider text-[#9AA0A6] mb-1">Dates / Year</label>
        <input type="text" value="${escapeHtml(dates)}" oninput="syncFormToJson();" class="edu-dates w-full px-3 py-1.5 rounded bg-[#111317] border border-[#2B3036] focus:border-[#D9A441] text-xs text-[#E8E6E1] font-mono outline-none" placeholder="e.g. 2015 – 2019">
      </div>
    </div>
  `;
  return card;
}

function addEducationCard(data = {}) {
  const container = document.getElementById('prof-education-container');
  if (!container) return;
  const hint = container.querySelector('.empty-edu-hint');
  if (hint) hint.remove();
  container.appendChild(createEducationCardElement(data));
  syncFormToJson();
}

function removeEducationCard(btn) {
  const card = btn.closest('.edu-card');
  if (card) card.remove();
  const container = document.getElementById('prof-education-container');
  if (container && container.querySelectorAll('.edu-card').length === 0) {
    container.innerHTML = `
      <div class="empty-edu-hint p-3 rounded-md border border-dashed border-[#2B3036] text-center text-xs text-[#9AA0A6]">
        No degrees added yet. Click <b>"Add Education"</b> to record academic degrees.
      </div>
    `;
  }
  syncFormToJson();
}

function updateEduCardHeader(input) {
  const card = input.closest('.edu-card');
  if (!card) return;
  const degree = card.querySelector('.edu-degree')?.value.trim() || 'New Degree';
  const title = card.querySelector('.edu-card-title');
  if (title) title.innerText = degree;
}

function updateProfileCounters() {
  const expCount = (currentProfile.experience || []).length;
  const projCount = (currentProfile.projects || []).length;
  const certCount = (currentProfile.certifications || []).length;
  const eduCount = (currentProfile.education || []).length;

  const elExp = document.getElementById('prof-exp-count');
  if (elExp) elExp.innerText = `${expCount} role${expCount === 1 ? '' : 's'}`;

  const elProj = document.getElementById('prof-proj-count');
  if (elProj) elProj.innerText = `${projCount} project${projCount === 1 ? '' : 's'}`;

  const elCert = document.getElementById('prof-cert-count');
  if (elCert) elCert.innerText = `${certCount} cert${certCount === 1 ? '' : 's'}`;

  const elEdu = document.getElementById('prof-edu-count');
  if (elEdu) elEdu.innerText = `${eduCount} degree${eduCount === 1 ? '' : 's'}`;

  const elYears = document.getElementById('prof-years-badge');
  if (elYears) {
    const yrs = roundExperienceYears(currentProfile.years_of_experience || currentProfile.total_experience_stated);
    elYears.innerText = `${yrs} Yrs Exp`;
  }
}

// Live Bidirectional Sync
function syncFormToJson() {
  const profile = { ...currentProfile };

  profile.name = (document.getElementById('prof-name')?.value || '').trim();
  if (!profile.contact) profile.contact = {};
  profile.contact.email = (document.getElementById('prof-email')?.value || '').trim();
  profile.contact.phone = (document.getElementById('prof-phone')?.value || '').trim();
  profile.contact.location = (document.getElementById('prof-location')?.value || '').trim();
  if (document.getElementById('prof-status')) {
    profile.contact.status = (document.getElementById('prof-status')?.value || '').trim();
  }
  if (document.getElementById('prof-linkedin')) {
    profile.contact.linkedin = (document.getElementById('prof-linkedin')?.value || '').trim();
  }
  if (document.getElementById('prof-github')) {
    profile.contact.github = (document.getElementById('prof-github')?.value || '').trim();
  }
  if (profile.contact.location) {
    profile.locations = [profile.contact.location];
  }

  if (document.getElementById('prof-total-exp')) {
    const rawVal = document.getElementById('prof-total-exp')?.value;
    const rounded = roundExperienceYears(rawVal);
    profile.total_experience_stated = `${rounded}`;
    profile.years_of_experience = rounded;
  }

  const roles = (document.getElementById('prof-target-roles')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
  if (roles.length) {
    profile.target_titles = roles;
    profile.target_roles = roles;
    profile.role = roles[0];
    profile.title = roles[0];
  }

  // Workday-style skills tag list
  profile.skills = Array.isArray(window.profileSkillsList) ? [...window.profileSkillsList] : [];

  profile.summary = (document.getElementById('prof-summary')?.value || '').trim();
  profile.writing_sample = profile.summary;

  // Experience cards
  const expCards = document.querySelectorAll('#prof-experience-container .exp-card');
  const experiences = [];
  expCards.forEach(card => {
    const role = (card.querySelector('.exp-role')?.value || '').trim();
    const company = (card.querySelector('.exp-company')?.value || '').trim();
    const project = (card.querySelector('.exp-project')?.value || '').trim();
    const client = (card.querySelector('.exp-client')?.value || '').trim();
    const start = (card.querySelector('.exp-start')?.value || '').trim();
    const end = (card.querySelector('.exp-end')?.value || '').trim();
    const location = (card.querySelector('.exp-loc')?.value || '').trim();
    const bulletsRaw = (card.querySelector('.exp-bullets')?.value || '').trim();
    const bullets = bulletsRaw.split('\n').map(b => b.replace(/^[\s•*-]+/, '').trim()).filter(Boolean);

    if (role || company) {
      const dates = (start && end) ? `${start} – ${end}` : (start || end || '');
      experiences.push({
        role,
        title: role,
        job_title: role,
        project,
        client,
        company,
        start_date: start,
        end_date: end,
        dates,
        location,
        bullets
      });
    }
  });
  profile.experience = experiences;

  // Project cards
  const projCards = document.querySelectorAll('#prof-projects-container .proj-card');
  const projects = [];
  projCards.forEach(card => {
    const name = (card.querySelector('.proj-name')?.value || '').trim();
    const techRaw = (card.querySelector('.proj-tech')?.value || '').trim();
    const technologies = techRaw.split(',').map(t => t.trim()).filter(Boolean);
    const description = (card.querySelector('.proj-desc')?.value || '').trim();

    if (name) {
      projects.push({
        name,
        technologies,
        description
      });
    }
  });
  profile.projects = projects;

  // Certification cards
  const certCards = document.querySelectorAll('#prof-certifications-container .cert-card');
  const certs = [];
  certCards.forEach(card => {
    const name = (card.querySelector('.cert-name')?.value || '').trim();
    const issuer = (card.querySelector('.cert-issuer')?.value || '').trim();
    const date = (card.querySelector('.cert-date')?.value || '').trim();
    if (name) {
      certs.push({ name, issuer, date });
    }
  });
  profile.certifications = certs;

  // Education cards
  const eduCards = document.querySelectorAll('#prof-education-container .edu-card');
  const education = [];
  eduCards.forEach(card => {
    const degree = (card.querySelector('.edu-degree')?.value || '').trim();
    const institution = (card.querySelector('.edu-inst')?.value || '').trim();
    const dates = (card.querySelector('.edu-dates')?.value || '').trim();
    if (degree || institution) {
      education.push({ degree, institution, dates, year: dates });
    }
  });
  profile.education = education;

  currentProfile = profile;
  const jsonEl = document.getElementById('prof-json');
  if (jsonEl) jsonEl.value = JSON.stringify(profile, null, 2);
  updateProfileCounters();

  clearTimeout(window._profCountryBoardsTimer);
  window._profCountryBoardsTimer = setTimeout(() => {
    renderProfileCountryBoards(profile);
  }, 400);
}

function syncJsonToForm() {
  try {
    const raw = document.getElementById('prof-json')?.value.trim();
    if (!raw) return;
    const parsed = JSON.parse(raw);
    populateProfileForm(parsed);
  } catch (err) {
    console.warn('JSON parsing error in editor:', err.message);
  }
}

// Resume Upload Trigger & Handler
function triggerResumeUpload() {
  const fileInput = document.getElementById('resume-file-input');
  if (fileInput) fileInput.click();
}

function showResumeValidationPrompt(msg) {
  const banner = document.getElementById('prof-validation-banner');
  const bannerMsg = document.getElementById('prof-validation-banner-msg');
  if (banner) {
    banner.classList.remove('hidden');
    if (bannerMsg && msg) bannerMsg.innerText = msg;
  }
  const modal = document.getElementById('resume-validation-modal');
  const modalMsg = document.getElementById('resume-validation-modal-msg');
  if (modal) {
    modal.classList.remove('hidden');
    if (modalMsg && msg) {
      modalMsg.innerText = `${msg} (Your Master Profile JSON was NOT modified).`;
    }
  }
  showToast('⚠️ Format or resume is not correct. Please fill the below master profile from UI.', 'error');
}

function hideResumeValidationPrompt() {
  const banner = document.getElementById('prof-validation-banner');
  if (banner) banner.classList.add('hidden');
  const modal = document.getElementById('resume-validation-modal');
  if (modal) modal.classList.add('hidden');
}

function closeResumeValidationModal(scrollToForm = false) {
  const modal = document.getElementById('resume-validation-modal');
  if (modal) modal.classList.add('hidden');
  if (scrollToForm) {
    const formEl = document.getElementById('prof-name');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => formEl.focus(), 300);
    }
  }
}

async function handleResumeFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const btnLabel = document.getElementById('btn-upload-label');
  const btn = document.getElementById('btn-upload-resume');
  const originalLabel = btnLabel ? btnLabel.innerText : 'Upload Resume';

  if (btnLabel) btnLabel.innerText = 'Parsing Resume...';
  if (btn) btn.disabled = true;

  try {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

    // If JSON file uploaded directly:
    if (ext === '.json') {
      const text = await file.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        showResumeValidationPrompt('Invalid JSON file format. Format or resume is not correct please fill the below master profile from UI.');
        return;
      }
      const hasExp = parsed && Array.isArray(parsed.experience) && parsed.experience.length > 0;
      const hasSkills = parsed && Array.isArray(parsed.skills) && parsed.skills.length > 0;
      if (!parsed || (!hasExp && !hasSkills && !parsed.name)) {
        showResumeValidationPrompt('The JSON does not contain valid resume info or work experience. Format or resume is not correct please fill the below master profile from UI.');
        return;
      }
      hideResumeValidationPrompt();
      currentProfile = { ...currentProfile, ...parsed };
      populateProfileForm(currentProfile);
      syncFormToJson();
      showToast('📄 Resume JSON loaded into Master Profile! Click "Save Profile" to commit.');
      return;
    }

    // For PDF, docx, txt, md: read as Base64 data and optional text
    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result;
        const base64 = typeof res === 'string' ? res.split(',')[1] : '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    let fileText = '';
    if (ext === '.txt' || ext === '.md') {
      fileText = await file.text();
    }

    const res = await fetch('/api/profile/upload-resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        fileBase64: base64Data,
        fileText: fileText
      })
    });

    const data = await res.json();
    if (res.ok && data.success && data.profile) {
      hideResumeValidationPrompt();
      currentProfile = data.profile;
      populateProfileForm(currentProfile);
      showToast('📄 Resume parsed into detailed Master Profile! Click "Save Profile" to commit.');

      // Auto-synchronize country scope & unlock city search
      const candidateLocText = [
        data.profile.country_code,
        data.profile.country,
        data.profile.contact?.location,
        ...(Array.isArray(data.profile.locations) ? data.profile.locations : [])
      ].filter(Boolean).join(' ');

      let detectedCountry = data.profile.country_code;
      if (!detectedCountry || detectedCountry === 'GLOBAL') {
        const s = candidateLocText.toLowerCase();
        if (/\b(canada|toronto|vancouver|montreal|calgary|ottawa|edmonton|ontario|quebec|alberta|british columbia|\bon\b|\bbc\b|\bab\b|\bqc\b)\b/i.test(s)) detectedCountry = 'CA';
        else if (/\b(usa|united states|new york|california|texas|san francisco|austin|seattle|chicago|los angeles|boston|\bny\b|\btx\b|\bwa\b|\bil\b)\b/i.test(s)) detectedCountry = 'US';
        else if (/\b(uk|united kingdom|great britain|london|manchester|birmingham|scotland|england)\b/i.test(s)) detectedCountry = 'GB';
        else if (/\b(germany|deutschland|berlin|munich|frankfurt|hamburg)\b/i.test(s)) detectedCountry = 'DE';
        else if (/\b(india|delhi|mumbai|bangalore|bengaluru|hyderabad|pune|chennai)\b/i.test(s)) detectedCountry = 'IN';
        else if (/\b(australia|sydney|melbourne|brisbane|perth)\b/i.test(s)) detectedCountry = 'AU';
      }

      if (detectedCountry && detectedCountry !== 'GLOBAL') {
        const cfgScope = document.getElementById('cfg-scope');
        if (cfgScope) {
          cfgScope.value = detectedCountry;
          if (typeof onCountryScopeChange === 'function') {
            onCountryScopeChange();
          } else if (typeof window.onCountryScopeChange === 'function') {
            window.onCountryScopeChange();
          }
        }

        // Auto-persist country_scope to settings if currently unset or AUTO
        try {
          const sRes = await fetch('/api/settings');
          if (sRes.ok) {
            const sData = await sRes.json();
            if (!sData.country_scope || sData.country_scope === 'AUTO') {
              sData.country_scope = detectedCountry;
              await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sData)
              });
              if (typeof currentSettings === 'object' && currentSettings) {
                currentSettings.country_scope = detectedCountry;
              }
            }
          }
        } catch (_) {}
      }
    } else {
      const errDetail = data.message || data.error || 'Format or resume is not correct please fill the below master profile from UI.';
      showResumeValidationPrompt(errDetail);
    }
  } catch (err) {
    showResumeValidationPrompt('Failed to process resume: ' + err.message);
  } finally {
    event.target.value = '';
    if (btnLabel) btnLabel.innerText = originalLabel;
    if (btn) btn.disabled = false;
  }
}

// Save Master Profile to Ground Truth
async function saveMasterProfile() {
  try {
    syncFormToJson();

    if (typeof validateFormFields === 'function') {
      const isValid = validateFormFields([
        {
          field: 'prof-name',
          type: 'required',
          message: 'Candidate full name is required.'
        },
        {
          field: 'prof-email',
          type: 'email',
          message: 'A valid email address is required.'
        },
        {
          field: 'prof-target-roles',
          type: 'required',
          message: 'At least one target job title or role is required.'
        }
      ]);
      if (!isValid) {
        showToast('Please complete all required profile fields.', 'error');
        return;
      }
    }

    const btn = document.getElementById('btn-save-profile');
    const originalContent = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = `<span>Saving...</span>`;

    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentProfile)
    });
    const data = await res.json();
    if (btn) btn.innerHTML = originalContent;

    if (data.success) {
      showToast('✅ Detailed Master Profile saved successfully!');
      await loadProfile();
      await loadStatus();
    } else {
      showToast('Save failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (e) {
    showToast('Error saving profile: ' + e.message, 'error');
  }
}

// On-Demand Candidate Profile JSON Modal Controls
function openProfileJsonModal() {
  syncFormToJson();
  const modal = document.getElementById('prof-json-modal');
  if (modal) {
    modal.classList.remove('hidden');
    const textarea = document.getElementById('prof-json');
    if (textarea) textarea.focus();
  }
}

function closeProfileJsonModal() {
  const modal = document.getElementById('prof-json-modal');
  if (modal) modal.classList.add('hidden');
}

function applyProfileJsonModal() {
  try {
    const raw = document.getElementById('prof-json')?.value.trim();
    if (raw) {
      const parsed = JSON.parse(raw);
      populateProfileForm(parsed);
      showToast('✅ Profile JSON changes applied to form.');
    }
    closeProfileJsonModal();
  } catch (err) {
    showToast('Invalid JSON syntax: ' + err.message, 'error');
  }
}

window.openProfileJsonModal = openProfileJsonModal;
window.closeProfileJsonModal = closeProfileJsonModal;
window.applyProfileJsonModal = applyProfileJsonModal;
window.saveMasterProfile = saveMasterProfile;
