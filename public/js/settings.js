/**
 * Jobryt AI - Search Engine Settings, Recruiter Intel & Multi-Country Board Gateway
 */

let showAllBoardsState = false;

function toggleShowAllBoards() {
  showAllBoardsState = !showAllBoardsState;
  const btn = document.getElementById('btn-toggle-all-boards');
  if (btn) btn.innerText = showAllBoardsState ? 'Show Only Market Boards' : 'Show All Global Sources';
  renderSettingsBoards();
}

function onCountryScopeChange() {
  renderSettingsBoards();
}

function isBoardKeyConfigured(boardId) {
  const env = window.currentEnv || {};
  if (boardId === 'adzuna') {
    return Boolean(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY);
  }
  if (boardId === 'usajobs') {
    return Boolean(env.USAJOBS_API_KEY);
  }
  return true;
}

let activeKeyModalBoardId = null;
let activeKeyModalCheckbox = null;
let wasBoardEnabledBeforeModal = false;

function toggleInputVisibility(inputId) {
  const el = document.getElementById(inputId);
  if (el) el.type = el.type === 'password' ? 'text' : 'password';
}
window.toggleInputVisibility = toggleInputVisibility;

function handleBoardCheckboxChange(event, boardId) {
  const checkbox = event.target;
  const boardMeta = (window.allBoardsRegistryMap || {})[boardId];

  // If user unchecks, allow disabling freely
  if (!checkbox.checked) {
    if (currentSettings && currentSettings.boards_enabled) {
      currentSettings.boards_enabled[boardId] = false;
    }
    return;
  }

  // If checking and board requires an API key:
  if (boardMeta && boardMeta.requires_api_key) {
    // Keep unchecked until tested & validated in popup
    checkbox.checked = false;
    openApiKeyPromptModal(boardId, checkbox);
    return;
  }

  // If not requiring API key, mark enabled
  if (currentSettings && currentSettings.boards_enabled) {
    currentSettings.boards_enabled[boardId] = true;
  }
}

function openApiKeyPromptModal(boardId, checkboxEl) {
  const boardMeta = (window.allBoardsRegistryMap || {})[boardId] || { id: boardId, name: boardId };
  activeKeyModalBoardId = boardId;
  activeKeyModalCheckbox = checkboxEl || document.getElementById(`board-${boardId}`);
  wasBoardEnabledBeforeModal = Boolean(currentSettings?.boards_enabled?.[boardId]);

  const modal = document.getElementById('api-key-prompt-modal');
  if (!modal) return;

  const titleEl = document.getElementById('api-key-modal-title');
  const subEl = document.getElementById('api-key-modal-subtitle');
  const helpLink = document.getElementById('api-key-help-link');
  const helpText = document.getElementById('api-key-help-text');
  const fieldsContainer = document.getElementById('api-key-fields-container');
  const feedbackEl = document.getElementById('api-key-feedback');

  if (titleEl) titleEl.innerText = `${boardMeta.name || 'Job Board'} — API Key Required`;
  if (subEl) subEl.innerText = `Enter and validate your credentials to activate ${boardMeta.name}`;

  if (helpLink) {
    if (boardMeta.key_help_url) {
      helpLink.href = boardMeta.key_help_url;
      helpLink.classList.remove('hidden');
    } else {
      helpLink.classList.add('hidden');
    }
  }

  if (helpText) {
    helpText.innerText = boardMeta.key_help_text || 'Enter your API credentials to search this job board. Keys are stored locally in your secure .env file.';
  }

  if (feedbackEl) {
    feedbackEl.className = 'hidden p-3 rounded-md text-xs font-medium border';
    feedbackEl.innerHTML = '';
  }

  const fields = boardMeta.key_fields || [
    { id: `${boardId.toUpperCase()}_API_KEY`, label: 'API Key / Token', placeholder: 'Enter API key...' }
  ];

  const env = window.currentEnv || {};

  fieldsContainer.innerHTML = fields.map(f => {
    const existingVal = env[f.id] || '';
    const isMasked = existingVal.includes('••') || existingVal.includes('...');
    const isSecret = /key|token|secret|password/i.test(f.id);

    return `
      <div>
        <div class="flex items-center justify-between mb-1">
          <label for="input-${f.id}" class="text-xs font-medium text-[#CBD5E1]">
            ${f.label} <span class="text-rose-400">*</span>
          </label>
          ${isSecret ? `<button type="button" onclick="toggleInputVisibility('input-${f.id}')" class="text-[10px] text-[#9AA0A6] hover:text-[#E8E6E1] font-mono cursor-pointer transition">Show / Hide</button>` : ''}
        </div>
        <div class="relative">
          <input
            type="${isSecret ? 'password' : 'text'}"
            id="input-${f.id}"
            data-key="${f.id}"
            value="${isMasked ? '' : existingVal}"
            placeholder="${isMasked ? 'Current key configured (' + existingVal + ')' : f.placeholder}"
            class="w-full px-3 py-2 rounded-md bg-[#111317] border border-[#2B3036] focus:border-[#D9A441] focus:outline-none text-[#E8E6E1] text-xs font-mono placeholder-[#64748B]"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
      </div>
    `;
  }).join('');

  modal.classList.remove('hidden');
  setTimeout(() => {
    const firstInput = fieldsContainer.querySelector('input');
    if (firstInput) firstInput.focus();
  }, 100);
}

function closeApiKeyPromptModal(keepChecked = false) {
  const modal = document.getElementById('api-key-prompt-modal');
  if (modal) modal.classList.add('hidden');

  if (!keepChecked) {
    if (activeKeyModalCheckbox) {
      activeKeyModalCheckbox.checked = false;
    }
    if (activeKeyModalBoardId && currentSettings?.boards_enabled) {
      currentSettings.boards_enabled[activeKeyModalBoardId] = false;
    }
  }
  activeKeyModalBoardId = null;
  activeKeyModalCheckbox = null;
}

async function validateAndSaveApiKey() {
  if (!activeKeyModalBoardId) return;

  const boardId = activeKeyModalBoardId;
  const boardMeta = (window.allBoardsRegistryMap || {})[boardId] || { id: boardId };
  const fields = boardMeta.key_fields || [{ id: `${boardId.toUpperCase()}_API_KEY` }];

  const credentials = {};
  let hasMissing = false;

  for (const f of fields) {
    const input = document.getElementById(`input-${f.id}`);
    const val = input ? input.value.trim() : '';
    if (!val) {
      if (window.currentEnv && window.currentEnv[f.id]) {
        credentials[f.id] = window.currentEnv[f.id];
      } else {
        hasMissing = true;
      }
    } else {
      credentials[f.id] = val;
    }
  }

  const feedbackEl = document.getElementById('api-key-feedback');
  const btn = document.getElementById('btn-validate-key');
  const btnText = document.getElementById('btn-validate-text');
  const spinner = document.getElementById('api-key-spinner');

  if (hasMissing) {
    if (feedbackEl) {
      feedbackEl.className = 'p-3 rounded-md text-xs font-medium border bg-rose-500/10 text-rose-300 border-rose-500/20';
      feedbackEl.innerText = '❌ Please enter all required API credentials to test and validate.';
    }
    if (activeKeyModalCheckbox) activeKeyModalCheckbox.checked = false;
    return;
  }

  if (btn) btn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');
  if (btnText) btnText.innerText = 'Testing & Validating API Key...';
  if (feedbackEl) {
    feedbackEl.className = 'p-3 rounded-md text-xs font-medium border bg-amber-500/10 text-amber-300 border-amber-500/20 flex items-center gap-2';
    feedbackEl.innerHTML = `<svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> <span>Testing credentials against live endpoint...</span>`;
  }

  try {
    const res = await fetch('/api/settings/validate-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board: boardId, credentials })
    });
    const data = await res.json();

    if (data.success) {
      window.currentEnv = window.currentEnv || {};
      Object.assign(window.currentEnv, credentials);

      if (feedbackEl) {
        feedbackEl.className = 'p-3 rounded-md text-xs font-medium border bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
        feedbackEl.innerText = `✓ ${data.message || 'API key tested & validated successfully!'}`;
      }

      if (activeKeyModalCheckbox) activeKeyModalCheckbox.checked = true;
      const cb = document.getElementById(`board-${boardId}`);
      if (cb) cb.checked = true;

      currentSettings = currentSettings || {};
      currentSettings.boards_enabled = currentSettings.boards_enabled || {};
      currentSettings.boards_enabled[boardId] = true;

      showToast(`🔑 ${boardMeta.name || boardId} validated and activated!`);

      await renderSettingsBoards();

      setTimeout(() => {
        closeApiKeyPromptModal(true);
      }, 750);
    } else {
      if (feedbackEl) {
        feedbackEl.className = 'p-3 rounded-md text-xs font-medium border bg-rose-500/10 text-rose-300 border-rose-500/20';
        feedbackEl.innerText = `❌ Error: ${data.error || 'API validation failed. Check your credentials.'}`;
      }
      if (activeKeyModalCheckbox) activeKeyModalCheckbox.checked = false;
      if (currentSettings && currentSettings.boards_enabled) {
        currentSettings.boards_enabled[boardId] = false;
      }
    }
  } catch (err) {
    if (feedbackEl) {
      feedbackEl.className = 'p-3 rounded-md text-xs font-medium border bg-rose-500/10 text-rose-300 border-rose-500/20';
      feedbackEl.innerText = `❌ Network Error: ${err.message}`;
    }
    if (activeKeyModalCheckbox) activeKeyModalCheckbox.checked = false;
    if (currentSettings && currentSettings.boards_enabled) {
      currentSettings.boards_enabled[boardId] = false;
    }
  } finally {
    if (btn) btn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
    if (btnText) btnText.innerText = 'Test & Validate API Key';
  }
}

window.isBoardKeyConfigured = isBoardKeyConfigured;
window.handleBoardCheckboxChange = handleBoardCheckboxChange;
window.openApiKeyPromptModal = openApiKeyPromptModal;
window.closeApiKeyPromptModal = closeApiKeyPromptModal;
window.validateAndSaveApiKey = validateAndSaveApiKey;

async function renderSettingsBoards() {
  const container = document.getElementById('boards-toggles');
  if (!container) return;
  const scopeEl = document.getElementById('cfg-scope');
  const scope = (scopeEl ? scopeEl.value : 'AUTO');
  const filterBadge = document.getElementById('boards-filter-badge');

  try {
    const url = showAllBoardsState ? '/api/settings/boards?country=GLOBAL' : `/api/settings/boards?country=${encodeURIComponent(scope)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.success) return;

    window.allBoardsRegistryMap = window.allBoardsRegistryMap || {};
    if (data.all_boards) {
      data.all_boards.forEach(b => { window.allBoardsRegistryMap[b.id] = b; });
    }
    if (data.boards) {
      data.boards.forEach(b => { window.allBoardsRegistryMap[b.id] = b; });
    }

    if (filterBadge) {
      filterBadge.innerText = showAllBoardsState
        ? 'Displaying all 18+ worldwide sources'
        : `Showing verified sources for: ${scope}`;
    }

    const boards = showAllBoardsState ? data.all_boards : data.boards;
    const currentEnabled = currentSettings?.boards_enabled || {};

    container.innerHTML = boards.map(b => {
      const isKeySet = isBoardKeyConfigured(b.id);
      const isChecked = b.requires_api_key
        ? (isKeySet && currentEnabled[b.id] === true)
        : (currentEnabled[b.id] !== false);

      const tierBadge = b.tier === 'primary'
        ? '<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Market Leader</span>'
        : (b.official_gov
          ? '<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Gov Verified</span>'
          : (b.tier === 'tech_specialist'
            ? '<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">Tech Specialist</span>'
            : '<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Worldwide Remote</span>'));

      const apiBadge = b.requires_api_key
        ? `<button type="button" onclick="event.preventDefault(); event.stopPropagation(); openApiKeyPromptModal('${b.id}');" class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${isKeySet ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'} hover:opacity-80 transition cursor-pointer flex items-center gap-1" title="${isKeySet ? 'API Key Configured — Click to update/test' : 'API Key Required — Click to configure and validate'}">
            <span>🔑 API Required</span>
            ${isKeySet ? '<span class="text-[8px] text-emerald-400 font-bold">✓ Active</span>' : ''}
          </button>`
        : '';

      const fakeBadge = b.fake_risk
        ? `<span class="text-[9px] text-[#9AA0A6] font-mono">🛡️ ${b.fake_risk}</span>`
        : '';

      return `
        <label class="flex items-start gap-2.5 p-3 rounded-md bg-[#111317] border border-[#2B3036] hover:border-[#3D444D] cursor-pointer transition-colors group">
          <input type="checkbox" id="board-${b.id}" ${isChecked ? 'checked' : ''}
            onchange="handleBoardCheckboxChange(event, '${b.id}')"
            class="w-4 h-4 mt-0.5 rounded bg-[#1C1F24] border-[#2B3036] accent-[#D9A441] shrink-0 cursor-pointer">
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-1.5 flex-wrap">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-xs font-semibold text-[#E8E6E1] group-hover:text-[#D9A441] transition-colors">${b.name}</span>
                ${apiBadge}
              </div>
              ${tierBadge}
            </div>
            <p class="text-[10px] text-[#9AA0A6] mt-0.5 line-clamp-2">${b.description || ''}</p>
            <div class="mt-1 flex items-center gap-2">
              ${fakeBadge}
            </div>
          </div>
        </label>
      `;
    }).join('');
  } catch (err) {
    console.error('renderSettingsBoards error:', err);
  }
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    currentSettings = await res.json();
    const cfgScore = document.getElementById('cfg-score');
    if (cfgScore) cfgScore.value = currentSettings.score_threshold || 60;
    const lblScore = document.getElementById('lbl-score');
    if (lblScore) lblScore.innerText = currentSettings.score_threshold || 60;
    const cfgFreshness = document.getElementById('cfg-freshness');
    if (cfgFreshness) cfgFreshness.value = currentSettings.freshness_hours !== undefined ? currentSettings.freshness_hours : 24;
    const cfgScope = document.getElementById('cfg-scope');
    if (cfgScope) cfgScope.value = currentSettings.country_scope || 'AUTO';
    const cfgWorktype = document.getElementById('cfg-worktype');
    if (cfgWorktype) cfgWorktype.value = currentSettings.work_type || 'Open to All';

    try {
      const envRes = await fetch('/api/env');
      const envData = await envRes.json();
      if (envData.success && envData.env) {
        window.currentEnv = envData.env;
      }
    } catch (_) {}

    await renderSettingsBoards();
    await loadSchedulerSettings();
  } catch (e) {
    console.error('loadSettings error:', e);
  }
}

async function runManualScanWithOverrides() {
  const rolesStr = document.getElementById('cfg-roles')?.value || '';
  const locsStr = document.getElementById('cfg-locations')?.value || '';
  const minScore = parseInt(document.getElementById('cfg-score')?.value || '60', 10);
  const freshness = parseInt(document.getElementById('cfg-freshness')?.value || '24', 10);
  const scope = document.getElementById('cfg-scope')?.value || 'AUTO';

  const targetTitles = rolesStr.split(',').map(s => s.trim()).filter(Boolean);
  const targetLocations = locsStr.split(',').map(s => s.trim()).filter(Boolean);

  const modal = document.getElementById('scan-modal');
  const logs = document.getElementById('scan-logs');
  if (modal) modal.classList.remove('hidden');
  if (logs) {
    logs.innerHTML = `
      <div class="text-indigo-400">> Launching MANUAL SCAN with custom parameters...</div>
      <div class="text-slate-300">> Target Roles: ${targetTitles.join(' | ')}</div>
      <div class="text-slate-300">> Target Locations: ${targetLocations.join(' | ')}</div>
      <div class="text-slate-300">> Target Country Scope: ${scope}</div>
      <div class="text-slate-300">> Minimum Score Threshold: ${minScore}+ | Freshness: ${freshness}h</div>
    `;
  }

  try {
    const res = await fetch('/api/pipeline/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetTitles, targetLocations, countryScope: scope, minScore, freshnessHours: freshness })
    });
    const data = await res.json();
    if (data.success && logs) {
      logs.innerHTML += `
        <div class="text-emerald-400">> Query evaluated ${data.stats.totalFetched} raw listings.</div>
        <div class="text-blue-300">> Gated and evaluated ${data.stats.scoredCount} positions.</div>
        <div class="text-emerald-400 font-bold">> Success: Found ${data.stats.qualifiedCount} matching jobs!</div>
      `;
      const stepElem = document.getElementById('scan-modal-step');
      if (stepElem) stepElem.innerText = 'Manual Scan Complete!';
      await loadStatus();
      switchTab('feed');
    } else if (logs) {
      logs.innerHTML += `<div class="text-rose-400">> Error: ${data.error}</div>`;
    }
  } catch (e) {
    if (logs) logs.innerHTML += `<div class="text-rose-400">> Network error: ${e.message}</div>`;
  }
}

async function saveAllSettings() {
  const minScore = parseInt(document.getElementById('cfg-score')?.value || '60', 10);
  const freshness = parseInt(document.getElementById('cfg-freshness')?.value || '24', 10);
  const scope = document.getElementById('cfg-scope')?.value || 'AUTO';
  const worktype = document.getElementById('cfg-worktype')?.value || 'Open to All';

  const boards = { ...(currentSettings?.boards_enabled || {}) };
  const boardInputs = document.querySelectorAll('#boards-toggles input[type="checkbox"]');
  boardInputs.forEach(input => {
    const boardKey = input.id.replace(/^board-/, '');
    boards[boardKey] = input.checked;
  });

  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        score_threshold: minScore,
        freshness_hours: freshness,
        country_scope: scope,
        work_type: worktype,
        boards_enabled: boards
      })
    });
    showToast('✅ Settings saved successfully!');
    await loadStatus();
  } catch (e) {
    showToast('Could not save settings: ' + e.message, 'error');
  }
}

async function searchRecruiters() {
  const company = document.getElementById('rec-company')?.value.trim();
  const city = document.getElementById('rec-city')?.value.trim();
  if (!company) {
    showToast('Please enter a company name.', 'error');
    return;
  }

  const resDiv = document.getElementById('rec-results');
  if (!resDiv) return;
  resDiv.classList.remove('hidden');
  resDiv.innerHTML = `<p class="text-xs text-slate-400 font-mono">Searching recruiter intelligence for ${company}...</p>`;

  try {
    const res = await fetch(`/api/recruiters/search?company=${encodeURIComponent(company)}&city=${encodeURIComponent(city || '')}`);
    const data = await res.json();
    if (data.success) {
      resDiv.innerHTML = `
        <div class="app-card p-6 space-y-4">
          <h3 class="text-sm font-bold text-[#E8E6E1] tracking-tight flex items-center gap-2">
            <span>Direct Search Links for ${escapeHtml(company)}</span>
          </h3>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <a href="${data.xRaySearchUrl}" target="_blank" rel="noopener noreferrer" class="p-3.5 rounded-md bg-[#111317] border border-[#2B3036] hover:border-[#3D444D] flex items-center justify-between text-xs text-[#E8E6E1] transition-all active:scale-[0.98]">
              <div class="flex items-center gap-2">
                <span class="text-[#D9A441] font-bold">1-Tap Google X-Ray</span>
                <span>Hiring Team & Recruiters</span>
              </div>
              <svg class="w-4 h-4 text-[#9AA0A6] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            </a>
            <a href="${data.linkedInSearchUrl}" target="_blank" rel="noopener noreferrer" class="p-3.5 rounded-md bg-[#111317] border border-[#2B3036] hover:border-[#3D444D] flex items-center justify-between text-xs text-[#E8E6E1] transition-all active:scale-[0.98]">
              <div class="flex items-center gap-2">
                <span class="text-[#5FA8A0] font-bold">LinkedIn People</span>
                <span>Internal Talent Acquisition</span>
              </div>
              <svg class="w-4 h-4 text-[#9AA0A6] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            </a>
          </div>

          <div>
            <p class="text-xs font-semibold uppercase tracking-wider text-[#9AA0A6] mb-1.5">Tailored LinkedIn Connection Note (≤300 chars):</p>
            <div class="p-3.5 rounded-md bg-[#111317] border border-[#2B3036] text-xs text-[#E8E6E1] font-mono select-all leading-relaxed">
              ${escapeHtml(data.draftLinkedInNote)}
            </div>
          </div>
        </div>
      `;
    }
  } catch (e) {
    resDiv.innerHTML = `<p class="text-xs text-rose-400 font-mono">Search error: ${e.message}</p>`;
  }
}

async function loadTelegramStatus() {
  try {
    const res = await fetch('/api/telegram/status');
    const data = await res.json();
    if (data.bot) {
      const userElem = document.getElementById('tg-info-username');
      if (userElem) userElem.innerText = `@${data.bot.username}`;
      const headerMetric = document.getElementById('metric-telegram');
      if (headerMetric) headerMetric.innerText = `@${data.bot.username}`;
    }
    if (data.targetChatId) {
      const chatElem = document.getElementById('tg-info-chat');
      if (chatElem) chatElem.innerText = data.targetChatId;
      const customChatDisplay = document.getElementById('tg-custom-chat-display');
      if (customChatDisplay) customChatDisplay.innerText = `Recipient: Chat ${data.targetChatId}`;
    }
    const badge = document.getElementById('tg-bridge-badge');
    const pidElem = document.getElementById('tg-info-pid');
    const tabBadge = document.getElementById('tab-tg-status');
    const sideBadge = document.getElementById('side-tg-status');
    const tabDot = document.getElementById('tab-tg-status-dot');

    if (data.bridge?.running) {
      if (badge) {
        badge.className = 'px-2.5 py-0.5 rounded-md text-[10px] font-semibold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 font-mono';
        badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Bridge Active';
      }
      if (pidElem) pidElem.innerText = `PID: ${data.bridge.pid}`;
      if (tabBadge) {
        tabBadge.innerText = 'Active';
        tabBadge.className = 'text-emerald-400 font-mono';
      }
      if (sideBadge) {
        sideBadge.innerText = 'Active';
        sideBadge.className = 'text-[10px] font-mono text-emerald-400 font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10';
      }
      if (tabDot) {
        tabDot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400';
      }
    } else {
      if (badge) {
        badge.className = 'px-2.5 py-0.5 rounded-md text-[10px] font-semibold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1.5 font-mono';
        badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Bridge Standby';
      }
      if (pidElem) pidElem.innerText = 'Offline';
      if (tabBadge) {
        tabBadge.innerText = 'Standby';
        tabBadge.className = 'text-amber-400 font-mono';
      }
      if (sideBadge) {
        sideBadge.innerText = 'Standby';
        sideBadge.className = 'text-[10px] font-mono text-amber-400 font-semibold px-1.5 py-0.5 rounded bg-amber-500/10';
      }
      if (tabDot) {
        tabDot.className = 'w-1.5 h-1.5 rounded-full bg-amber-400';
      }
    }
  } catch (err) {
    console.error('loadTelegramStatus error:', err);
  }
}

async function sendTelegramTestPing() {
  const btn1 = document.getElementById('btn-tg-ping');
  const btn2 = document.getElementById('btn-tg-custom-ping');
  const customMsg = document.getElementById('tg-custom-msg')?.value.trim();
  const resBox = document.getElementById('tg-ping-result');

  const setButtonsLoading = (loading) => {
    if (btn1) {
      btn1.disabled = loading;
      btn1.innerHTML = loading
        ? `<svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> Dispatching...`
        : `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> <span>Send Test Ping</span>`;
    }
    if (btn2) {
      btn2.disabled = loading;
      btn2.innerHTML = loading
        ? `<svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> Dispatching...`
        : `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg> <span>Send Ping Now</span>`;
    }
  };

  setButtonsLoading(true);

  try {
    const payload = {};
    if (customMsg) payload.message = customMsg;
    const res = await fetch('/api/telegram/test-ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Telegram message delivered to @${data.bot?.username || 'bot'} (Chat ${data.targetChatId})!`);
      if (resBox) {
        resBox.classList.remove('hidden');
        resBox.className = 'p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2';
        resBox.innerHTML = `<span>✓ Sent successfully! Check your Telegram app for the instant alert.</span>`;
      }
    } else {
      showToast(`⚠️ Telegram error: ${data.error}`, 'error');
      if (resBox) {
        resBox.classList.remove('hidden');
        resBox.className = 'p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs';
        resBox.innerHTML = `<span>Failed: ${escapeHtml(data.error)}</span>`;
      }
    }
  } catch (err) {
    showToast(`⚠️ Connection error: ${err.message}`, 'error');
  } finally {
    setButtonsLoading(false);
  }
}

async function restartTelegramBridge() {
  const btn = document.getElementById('btn-tg-restart');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> Restarting...`;
  }
  try {
    await fetch('/api/telegram/bridge/stop', { method: 'POST' });
    await new Promise(r => setTimeout(r, 1000));
    await fetch('/api/telegram/bridge/start', { method: 'POST' });
    await new Promise(r => setTimeout(r, 1500));
    await loadTelegramStatus();
    showToast('🔄 Telegram Bridge restarted successfully!');
  } catch (err) {
    showToast(`Restart failed: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> <span>Restart Bridge</span>`;
    }
  }
}

// ── Autonomous Background Cron Scheduler UI Handlers ───────────────────────
const PRESET_CRON_MAP = {
  DAILY: '0 9 * * *',
  TWICE: '0 9,17 * * *',
  '3X': '0 8,13,18 * * *',
  '5X': '30 8,11,14,17,20 * * *',
  '2H': '0 */2 * * *',
  '4H': '0 */4 * * *',
  HOURLY: '0 * * * *',
  WEEKDAYS: '0 9 * * 1-5'
};

let currentSchedulerData = null;

async function loadSchedulerSettings() {
  try {
    const res = await fetch('/api/scheduler');
    const data = await res.json();
    currentSchedulerData = data;

    const toggle = document.getElementById('sched-enabled');
    const badge = document.getElementById('sched-badge-status');
    const label = document.getElementById('sched-enabled-label');
    const presetSelect = document.getElementById('sched-preset-select');
    const cronInput = document.getElementById('sched-cron-input');
    const lastRunLabel = document.getElementById('sched-last-run-label');
    const foundLabel = document.getElementById('sched-found-label');

    if (toggle) toggle.checked = Boolean(data.enabled);
    if (label) label.innerText = data.enabled ? 'Auto-Scan Enabled' : 'Auto-Scan Disabled';

    if (badge) {
      if (data.isRunning) {
        badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/25 flex items-center gap-1';
        badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span> Scanning Now';
      } else if (data.enabled) {
        badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/25';
        badge.innerHTML = '● Active';
      } else {
        badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase bg-slate-500/10 text-slate-400 border border-slate-500/25';
        badge.innerHTML = '○ Standby';
      }
    }

    if (presetSelect && data.preset) {
      presetSelect.value = data.preset;
    }
    if (cronInput && data.schedule) {
      cronInput.value = data.schedule;
    }

    if (lastRunLabel) {
      if (data.lastRun) {
        const d = new Date(data.lastRun);
        lastRunLabel.innerText = `Last scan: ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } else {
        lastRunLabel.innerText = 'Last scan: Idle';
      }
    }

    if (foundLabel) {
      foundLabel.innerText = `${data.lastRunQualifiedCount || 0} qualified found`;
    }
  } catch (err) {
    console.error('Failed to load scheduler settings:', err);
  }
}

function onSchedulePresetChange() {
  const presetSelect = document.getElementById('sched-preset-select');
  const cronInput = document.getElementById('sched-cron-input');
  if (!presetSelect || !cronInput) return;

  const val = presetSelect.value;
  if (PRESET_CRON_MAP[val]) {
    cronInput.value = PRESET_CRON_MAP[val];
    cronInput.disabled = false;
  } else if (val === 'CUSTOM') {
    cronInput.focus();
    cronInput.select();
  }
}

function onSchedulerToggleChange() {
  const toggle = document.getElementById('sched-enabled');
  const badge = document.getElementById('sched-badge-status');
  const label = document.getElementById('sched-enabled-label');
  if (!toggle) return;

  const isEnabled = toggle.checked;
  if (label) label.innerText = isEnabled ? 'Auto-Scan Enabled' : 'Auto-Scan Disabled';
  if (badge) {
    if (isEnabled) {
      badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/25';
      badge.innerHTML = '● Active';
    } else {
      badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase bg-slate-500/10 text-slate-400 border border-slate-500/25';
      badge.innerHTML = '○ Standby';
    }
  }
}

async function saveSchedulerSettings() {
  const btn = document.getElementById('btn-save-scheduler');
  const toggle = document.getElementById('sched-enabled');
  const presetSelect = document.getElementById('sched-preset-select');
  const cronInput = document.getElementById('sched-cron-input');

  const payload = {
    enabled: toggle ? toggle.checked : true,
    preset: presetSelect ? presetSelect.value : 'DAILY',
    schedule: cronInput ? cronInput.value.trim() : '0 9 * * *',
    description: presetSelect ? presetSelect.options[presetSelect.selectedIndex].text : 'Daily at 9:00 AM'
  };

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span>Saving...</span>`;
  }

  try {
    const res = await fetch('/api/scheduler', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('⏰ Background Cron schedule saved & activated!');
      await loadSchedulerSettings();
    } else {
      showToast(`⚠️ Error: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast(`Failed to save scheduler: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg> <span>Save Schedule</span>`;
    }
  }
}

async function triggerBackgroundScanNow() {
  const btn = document.getElementById('btn-trigger-scheduler');
  const badge = document.getElementById('sched-badge-status');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<svg class="w-3.5 h-3.5 animate-spin text-[#D9A441]" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> <span>Scanning...</span>`;
  }
  if (badge) {
    badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/25 flex items-center gap-1';
    badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span> Scanning Now';
  }

  showToast('🔍 Triggering autonomous background sweep...');

  try {
    const res = await fetch('/api/scheduler/trigger', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      const count = data.result?.stats?.qualifiedCount || 0;
      showToast(`✅ Scan finished: ${count} qualified opportunities discovered!`);
      await loadSchedulerSettings();
      if (typeof loadPendingJobs === 'function') loadPendingJobs();
    } else {
      showToast(`⚠️ ${data.error}`, 'error');
    }
  } catch (err) {
    showToast(`Scan error: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg class="w-3.5 h-3.5 text-[#5FA8A0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> <span>Trigger Now</span>`;
    }
    await loadSchedulerSettings();
  }
}
