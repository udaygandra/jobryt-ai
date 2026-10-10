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
  const scopeEl = document.getElementById('cfg-scope');
  const scope = scopeEl ? scopeEl.value : 'AUTO';
  if (typeof initGlobalCities === 'function') {
    initGlobalCities(scope);
  }
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

window.targetRolesList = [];
window.targetLocationsList = [];
window.canadaCitiesList = [];
window.globalCitiesList = [];
window.allGlobalCitiesDataset = [];
let activeComboboxIndex = -1;
let comboboxDebounceTimer = null;
let liveGeocodingDebounceTimer = null;
let liveGeocodingAbortController = null;
let currentLiveResults = [];
let previousCountryScope = null;

const COUNTRY_METADATA = {
  US: { name: 'United States', flag: '🇺🇸', sampleCity: 'Austin, TX' },
  CA: { name: 'Canada', flag: '🇨🇦', sampleCity: 'Toronto, ON' },
  GB: { name: 'United Kingdom', flag: '🇬🇧', sampleCity: 'London' },
  DE: { name: 'Germany', flag: '🇩🇪', sampleCity: 'Berlin' },
  AU: { name: 'Australia', flag: '🇦🇺', sampleCity: 'Sydney' },
  FR: { name: 'France', flag: '🇫🇷', sampleCity: 'Paris' },
  IN: { name: 'India', flag: '🇮🇳', sampleCity: 'Bengaluru' },
  NL: { name: 'Netherlands', flag: '🇳🇱', sampleCity: 'Amsterdam' },
  AE: { name: 'UAE & Gulf', flag: '🇦🇪', sampleCity: 'Dubai' },
  SG: { name: 'Singapore', flag: '🇸🇬', sampleCity: 'Singapore' },
  JP: { name: 'Japan', flag: '🇯🇵', sampleCity: 'Tokyo' },
  BR: { name: 'Brazil', flag: '🇧🇷', sampleCity: 'São Paulo' },
  IT: { name: 'Italy', flag: '🇮🇹', sampleCity: 'Milan' },
  PL: { name: 'Poland', flag: '🇵🇱', sampleCity: 'Warsaw' },
  ZA: { name: 'South Africa', flag: '🇿🇦', sampleCity: 'Cape Town' },
  AT: { name: 'Austria', flag: '🇦🇹', sampleCity: 'Vienna' },
  NZ: { name: 'New Zealand', flag: '🇳🇿', sampleCity: 'Auckland' },
  MX: { name: 'Mexico', flag: '🇲🇽', sampleCity: 'Mexico City' },
  US_CA: { name: 'North America (US & Canada)', flag: '🌎', sampleCity: 'New York / Toronto' },
  GLOBAL: { name: 'Worldwide / Global Remote', flag: '🌐', sampleCity: 'Remote' },
  AUTO: { name: 'Auto (Profile Detected)', flag: '🤖', sampleCity: 'Remote' }
};

function getCountryMeta(code) {
  if (!code) return null;
  return COUNTRY_METADATA[code.toUpperCase()] || { name: code, flag: getFlagEmoji(code), sampleCity: 'Capital' };
}

function updateLocationSuggestionsForCountry(scope, hubs) {
  const container = document.getElementById('settings-location-suggestions');
  if (!container) return;

  const defaultHubs = ['Remote', 'New York, NY', 'Toronto, ON', 'London, UK', 'Bengaluru, KA', 'Berlin, Germany'];
  const activeHubs = Array.isArray(hubs) && hubs.length ? hubs : defaultHubs;
  const meta = getCountryMeta(scope);
  const labelScope = meta ? `${meta.flag} ${meta.name}` : ((scope && scope !== 'ALL' && scope !== 'AUTO') ? scope : 'Global');

  container.innerHTML = `
    <span class="text-[11px] text-[#9AA0A6] font-medium">Top Hubs (${escapeHtml(labelScope)}):</span>
    ${activeHubs.slice(0, 6).map(hub => {
      const shortName = hub.split(',')[0].trim();
      return `<button type="button" onclick="addLocationTag('${escapeHtml(hub)}')" class="text-[11px] px-2 py-0.5 rounded bg-[#242830] hover:bg-[#2B3036] text-[#E8E6E1] border border-[#2B3036] hover:border-[#5FA8A0] transition-colors cursor-pointer active:scale-95">+ ${escapeHtml(shortName)}</button>`;
    }).join('')}
  `;
}

async function initGlobalCities(countryCode) {
  try {
    const scope = countryCode || (document.getElementById('cfg-scope') ? document.getElementById('cfg-scope').value : 'AUTO');
    
    // 1. Fetch full cities dataset if not already in memory
    if (!window.allGlobalCitiesDataset || window.allGlobalCitiesDataset.length === 0) {
      try {
        const fullRes = await fetch('/data/global-cities.json');
        if (fullRes.ok) {
          const fullData = await fullRes.json();
          window.rawGlobalCitiesJson = fullData;
          const flatList = [];
          if (fullData.by_country) {
            for (const [cCode, cMeta] of Object.entries(fullData.by_country)) {
              if (Array.isArray(cMeta.cities)) {
                cMeta.cities.forEach(item => {
                  flatList.push(typeof item === 'string' ? {
                    city: item.split(',')[0],
                    formatted: item,
                    country_code: cCode,
                    country_name: cMeta.name,
                    flag: cMeta.flag,
                    tier: 2
                  } : item);
                });
              }
            }
          }
          window.allGlobalCitiesDataset = flatList;
        }
      } catch (err) {
        console.warn('Could not load global cities json directly:', err);
      }
    }

    // 2. Fetch scoped city list for suggestions & hubs
    let url = `/api/settings/cities?country=${encodeURIComponent(scope || 'ALL')}`;
    let res = await fetch(url);
    let data;
    if (res.ok) {
      data = await res.json();
    } else if (window.rawGlobalCitiesJson) {
      const countryEntry = window.rawGlobalCitiesJson.by_country && window.rawGlobalCitiesJson.by_country[scope];
      data = {
        success: true,
        cities: countryEntry ? countryEntry.cities : (window.rawGlobalCitiesJson.all || []),
        popular_hubs: countryEntry ? countryEntry.popular_hubs : ["Remote", "New York, NY", "London, UK", "Toronto, ON", "Bengaluru, KA", "Berlin, Germany"]
      };
    }

    if (data && data.success) {
      window.globalCitiesList = data.cities || [];
      window.canadaCitiesList = window.globalCitiesList;
      updateLocationSuggestionsForCountry(scope, data.popular_hubs);
    }
  } catch (e) {
    console.warn('Could not load global cities:', e);
  }
}

async function initCanadaCities() {
  return initGlobalCities('CA');
}

function isLocationInCountryScope(locStr, countryScope) {
  if (!locStr || !countryScope) return false;
  const lower = locStr.toLowerCase().trim();
  if (lower.includes('remote') || lower.includes('worldwide')) return true;
  if (countryScope === 'GLOBAL' || countryScope === 'ALL') return true;
  if (countryScope === 'US_CA') {
    return isLocationInCountryScope(locStr, 'US') || isLocationInCountryScope(locStr, 'CA');
  }
  if (Array.isArray(window.allGlobalCitiesDataset) && window.allGlobalCitiesDataset.length) {
    const match = window.allGlobalCitiesDataset.find(c =>
      c.formatted.toLowerCase() === lower || c.city.toLowerCase() === lower || lower.includes(c.city.toLowerCase())
    );
    if (match) return match.country_code === countryScope;
  }
  if (countryScope === 'CA') return lower.includes('canada') || /,\s*(on|bc|qc|ab|mb|sk|ns|nb|nl|pe|nt|nu|yt)\b/i.test(lower);
  if (countryScope === 'US') return lower.includes('usa') || lower.includes('united states') || /,\s*(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc)\b/i.test(lower);
  if (countryScope === 'GB') return lower.includes('uk') || lower.includes('united kingdom') || lower.includes('london');
  if (countryScope === 'DE') return lower.includes('germany') || lower.includes('deutschland') || lower.includes('berlin');
  if (countryScope === 'IN') return lower.includes('india') || lower.includes('bengaluru') || lower.includes('delhi');
  if (countryScope === 'AU') return lower.includes('australia') || lower.includes('sydney');
  if (countryScope === 'FR') return lower.includes('france') || lower.includes('paris');
  return false;
}
window.isLocationInCountryScope = isLocationInCountryScope;

function onCountryScopeChange() {
  const scopeSelect = document.getElementById('cfg-scope');
  const locInput = document.getElementById('input-add-location');
  const countryStatus = document.getElementById('settings-country-status');
  const citiesBadge = document.getElementById('settings-cities-badge');
  const suggestionsContainer = document.getElementById('settings-location-suggestions');

  const scope = scopeSelect ? scopeSelect.value.trim() : '';
  const effectiveScope = (scope === 'AUTO' && window.detectedProfileCountry) ? window.detectedProfileCountry : scope;
  const meta = getCountryMeta(effectiveScope || scope);

  if (!scope) {
    // Disabled state until country selected
    if (locInput) {
      locInput.disabled = true;
      locInput.value = '';
      locInput.placeholder = 'Select a country above to enable city search...';
    }
    if (countryStatus) {
      countryStatus.innerText = 'Select country first';
      countryStatus.className = 'text-[10px] text-[#D9A441] font-mono';
    }
    if (citiesBadge) {
      citiesBadge.innerText = 'Waiting for country selection';
      citiesBadge.className = 'text-[10px] text-[#9AA0A6] font-mono';
    }
    if (suggestionsContainer) suggestionsContainer.innerHTML = '';
    closeComboboxDropdown();
    previousCountryScope = scope;
    return;
  }

  // Reset previously selected cities if country changed to avoid lingering out-of-scope locations
  if (previousCountryScope !== null && previousCountryScope !== scope && Array.isArray(window.targetLocationsList) && window.targetLocationsList.length > 0) {
    const targetCheckScope = (effectiveScope && effectiveScope !== 'AUTO') ? effectiveScope : scope;
    if (targetCheckScope && targetCheckScope !== 'GLOBAL' && targetCheckScope !== 'AUTO') {
      const keptLocations = window.targetLocationsList.filter(loc => isLocationInCountryScope(loc, targetCheckScope));
      if (keptLocations.length !== window.targetLocationsList.length) {
        const removedCount = window.targetLocationsList.length - keptLocations.length;
        window.targetLocationsList = keptLocations;
        renderLocationTags();
        const newCountryName = meta ? meta.name : scope;
        if (typeof showToast === 'function') {
          showToast(`Target country changed to ${newCountryName}. ${removedCount} previous cities cleared — please select cities in ${newCountryName}.`, 'warning');
        }
      }
    }
  }
  previousCountryScope = scope;

  // Country selected: Enable city input and restrict scope
  if (locInput) {
    locInput.disabled = false;
    locInput.placeholder = `Search cities in ${meta ? meta.name : (effectiveScope || scope)} (e.g. ${meta ? meta.sampleCity : 'Remote'})...`;
  }

  // Count available cities in selected country
  let availableCount = 0;
  if (Array.isArray(window.allGlobalCitiesDataset)) {
    if (effectiveScope === 'GLOBAL' || (effectiveScope === 'AUTO' && !window.detectedProfileCountry)) {
      availableCount = window.allGlobalCitiesDataset.length;
    } else if (effectiveScope === 'US_CA') {
      availableCount = window.allGlobalCitiesDataset.filter(c => c.country_code === 'US' || c.country_code === 'CA').length;
    } else {
      availableCount = window.allGlobalCitiesDataset.filter(c => c.country_code === effectiveScope).length;
    }
  }

  if (countryStatus && meta) {
    if (scope === 'AUTO' && window.detectedProfileCountry) {
      countryStatus.innerHTML = `<span class="text-emerald-400 font-semibold">✓ 🤖 Auto (${meta.flag} ${meta.name})</span>`;
    } else {
      countryStatus.innerHTML = `<span class="text-emerald-400 font-semibold">✓ ${meta.flag} ${meta.name}</span>`;
    }
  }
  if (citiesBadge && meta) {
    citiesBadge.innerText = `${meta.flag} ${availableCount} Cities Available`;
    citiesBadge.className = 'text-[10px] text-[#5FA8A0] font-mono font-medium';
  }

  initGlobalCities(effectiveScope || scope);

  if (typeof renderSettingsBoards === 'function') {
    renderSettingsBoards();
  }
}
window.onCountryScopeChange = onCountryScopeChange;

// Google Maps-Grade Hybrid Combobox with Live Edge Geocoding & Custom Fallback
function filterAndRenderLocationSuggestions(query, liveResults = null, isSearchingLive = false) {
  const dropdown = document.getElementById('location-combobox-dropdown');
  const input = document.getElementById('input-add-location');
  if (!dropdown || !input || input.disabled) return;

  const rawQuery = (query || '').trim();
  const trimmed = rawQuery.toLowerCase();
  const scopeSelect = document.getElementById('cfg-scope');
  const scope = (scopeSelect ? scopeSelect.value.trim() : '').toUpperCase();

  if (!scope) {
    dropdown.innerHTML = `
      <div class="combobox-header text-amber-400">Step 1 Required</div>
      <div class="p-3 text-xs text-[#9AA0A6]">Please select a target country above before choosing cities.</div>
    `;
    dropdown.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
    return;
  }

  const meta = getCountryMeta(scope);
  const countryName = meta ? meta.name : scope;
  const flag = meta ? meta.flag : '📍';

  let results = [];

  // Scoped presets for the selected country
  if (scope === 'GLOBAL') {
    results.push(
      { formatted: 'Remote / Anywhere (Worldwide)', flag: '🌐', country_code: 'GLOBAL', tierLabel: 'Universal' },
      { formatted: 'Remote', flag: '🌐', country_code: 'GLOBAL', tierLabel: 'Workplace' },
      { formatted: 'Hybrid / Flexible', flag: '🏢', country_code: 'GLOBAL', tierLabel: 'Workplace' }
    );
  } else {
    results.push(
      { formatted: `Remote (${countryName})`, flag: flag, country_code: scope, tierLabel: 'Country Remote' },
      { formatted: `Hybrid (${countryName})`, flag: '🏢', country_code: scope, tierLabel: 'Flexible' }
    );
  }

  if (trimmed) {
    results = results.filter(p => p.formatted.toLowerCase().includes(trimmed));
  }

  // Tier 1 (Instant 0ms): Local major cities dataset
  if (Array.isArray(window.allGlobalCitiesDataset) && window.allGlobalCitiesDataset.length > 0) {
    const scopedPool = window.allGlobalCitiesDataset.filter(c => {
      if (scope === 'GLOBAL' || scope === 'AUTO') return true;
      if (scope === 'US_CA') return c.country_code === 'US' || c.country_code === 'CA';
      return c.country_code === scope;
    });

    const scored = [];
    for (const c of scopedPool) {
      const fmt = (c.formatted || c.city || '').toLowerCase();
      const city = (c.city || '').toLowerCase();
      const region = (c.region || '').toLowerCase();

      let matchScore = 0;
      if (city === trimmed) matchScore = 100;
      else if (city.startsWith(trimmed)) matchScore = 80;
      else if (fmt.startsWith(trimmed)) matchScore = 70;
      else if (fmt.includes(trimmed)) matchScore = 50;
      else if (region === trimmed) matchScore = 40;

      if (matchScore > 0 || !trimmed) {
        scored.push({ city: c, score: matchScore });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const topCities = scored.slice(0, trimmed ? 10 : 8).map(s => s.city);
    results.push(...topCities);
  }

  // Tier 2: Merge live geocoding results if available
  const activeLiveList = Array.isArray(liveResults) ? liveResults : currentLiveResults;
  if (Array.isArray(activeLiveList) && activeLiveList.length > 0) {
    for (const item of activeLiveList) {
      if (!results.some(r => (r.city || '').toLowerCase() === (item.city || '').toLowerCase() && (r.region || '').toLowerCase() === (item.region || '').toLowerCase())) {
        results.push(item);
      }
    }
  }

  // Deduplicate results
  const seen = new Set();
  results = results.filter(item => {
    const key = (item.formatted || item.city || '').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Tier 3: Guaranteed custom fallback if user typed something
  if (trimmed.length > 0) {
    const hasExactCity = results.some(r => (r.city || '').toLowerCase() === trimmed);
    if (!hasExactCity) {
      results.push({
        city: rawQuery,
        formatted: `${rawQuery}, ${countryName}`,
        country_code: scope,
        isCustomAdd: true
      });
    }
  }

  if (results.length === 0) {
    dropdown.classList.add('hidden');
    input.setAttribute('aria-expanded', 'false');
    activeComboboxIndex = -1;
    return;
  }

  // Build header with live status indication
  const liveIndicator = isSearchingLive
    ? `<span class="text-[9px] text-[#5FA8A0] font-mono animate-pulse">🌐 searching live cities...</span>`
    : `<span class="font-mono text-[9px] lowercase text-[#D9A441]">↑↓ arrows · enter to select</span>`;

  let html = `<div class="combobox-header flex items-center justify-between">
    <span>${trimmed ? `Cities in ${escapeHtml(countryName)}` : `Top Cities & Presets (${escapeHtml(countryName)})`}</span>
    ${liveIndicator}
  </div>`;

  results.forEach((item, idx) => {
    if (item.isCustomAdd) {
      html += `
        <div class="combobox-item add-custom-option" data-index="${idx}" onclick="selectComboboxLocation('${escapeHtml(item.formatted)}', '${escapeHtml(item.country_code)}')">
          <div class="flex items-center gap-2 text-[#D9A441]">
            <span class="text-sm">➕</span>
            <span class="text-xs font-semibold">Add custom location: "<b>${escapeHtml(item.city)}</b>" (${escapeHtml(countryName)})</span>
          </div>
          <span class="text-[10px] text-[#9AA0A6] font-mono">Press Enter to add</span>
        </div>
      `;
      return;
    }

    const fmt = item.formatted || item.city || '';
    const itemFlag = item.flag || (item.country_code ? getFlagEmoji(item.country_code) : flag);
    const itemCountryCode = item.country_code || scope;
    let badgeHtml = '';

    if (item.source === 'live_geocoding') {
      badgeHtml = '<span class="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/25">📍 Live Geocoding</span>';
    } else if (item.tier === 1) {
      badgeHtml = '<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Hub</span>';
    } else if (item.tierLabel) {
      badgeHtml = `<span class="text-[9px] font-medium px-1.5 py-0.2 rounded bg-[#242830] text-[#9AA0A6]">${escapeHtml(item.tierLabel)}</span>`;
    }

    html += `
      <div class="combobox-item" data-index="${idx}" onclick="selectComboboxLocation('${escapeHtml(fmt)}', '${escapeHtml(itemCountryCode)}')">
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="text-base shrink-0">${itemFlag}</span>
          <div class="truncate">
            <span class="font-medium text-xs text-[#E8E6E1]">${highlightComboboxMatch(fmt, trimmed)}</span>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0 ml-2">
          ${itemCountryCode ? `<span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#242830] text-[#9AA0A6] border border-[#2B3036]">${escapeHtml(itemCountryCode)}</span>` : ''}
          ${badgeHtml}
        </div>
      </div>
    `;
  });

  dropdown.innerHTML = html;
  dropdown.classList.remove('hidden');
  input.setAttribute('aria-expanded', 'true');
  activeComboboxIndex = -1;

  // Trigger debounced live search if query >= 2 and not already rendered with live results
  if (trimmed.length >= 2 && liveResults === null) {
    triggerLiveGeocodingSearch(trimmed, scope);
  }
}

function triggerLiveGeocodingSearch(trimmedQuery, scope) {
  clearTimeout(liveGeocodingDebounceTimer);
  if (liveGeocodingAbortController) {
    liveGeocodingAbortController.abort();
  }
  liveGeocodingAbortController = new AbortController();

  liveGeocodingDebounceTimer = setTimeout(async () => {
    try {
      const input = document.getElementById('input-add-location');
      if (!input || input.value.trim().toLowerCase() !== trimmedQuery) return;

      // Update header with micro-loader
      filterAndRenderLocationSuggestions(input.value, currentLiveResults, true);

      const url = `/api/settings/cities/live-search?q=${encodeURIComponent(trimmedQuery)}&country=${encodeURIComponent(scope)}`;
      const res = await fetch(url, { signal: liveGeocodingAbortController.signal });
      if (!res.ok) return;
      const data = await res.json();

      if (input.value.trim().toLowerCase() === trimmedQuery && Array.isArray(data.cities)) {
        currentLiveResults = data.cities;
        filterAndRenderLocationSuggestions(input.value, currentLiveResults, false);
      }
    } catch (err) {
      // Abort or network failure — keep current suggestions
    }
  }, 220);
}

function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode === 'GLOBAL') return '🌐';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function highlightComboboxMatch(text, query) {
  if (!query) return escapeHtml(text);
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escapeHtml(text).replace(regex, '<span class="text-[#D9A441] font-semibold underline">$1</span>');
}

function selectComboboxLocation(locationString, countryCode) {
  if (locationString) {
    addLocationTag(locationString);
  }
  closeComboboxDropdown();

  // Smart country-scope alignment hint:
  if (countryCode && countryCode !== 'GLOBAL') {
    const scopeSelect = document.getElementById('cfg-scope');
    if (scopeSelect && scopeSelect.value === 'AUTO') {
      scopeSelect.value = countryCode;
      onCountryScopeChange();
    }
  }
}

function closeComboboxDropdown() {
  const dropdown = document.getElementById('location-combobox-dropdown');
  const input = document.getElementById('input-add-location');
  if (dropdown) dropdown.classList.add('hidden');
  if (input) {
    input.value = '';
    input.setAttribute('aria-expanded', 'false');
  }
  activeComboboxIndex = -1;
  currentLiveResults = [];
  clearTimeout(liveGeocodingDebounceTimer);
  if (liveGeocodingAbortController) {
    liveGeocodingAbortController.abort();
    liveGeocodingAbortController = null;
  }
}

const MAX_ROLES = 10;

function renderRoleTags() {
  const container = document.getElementById('roles-badges-list');
  const hiddenInput = document.getElementById('cfg-roles');
  const countLabel = document.getElementById('settings-roles-count-label');
  const roleCount = (window.targetRolesList || []).length;

  if (countLabel) {
    countLabel.innerText = `(${roleCount}/${MAX_ROLES})`;
    countLabel.className = roleCount >= MAX_ROLES ? 'text-amber-400 font-mono text-[10px] font-bold' : 'text-[#5FA8A0] font-mono text-[10px]';
  }

  const roleInput = document.getElementById('input-add-role');
  if (roleInput) {
    if (roleCount >= MAX_ROLES) {
      roleInput.placeholder = 'Maximum 10 roles reached';
    } else {
      roleInput.placeholder = 'e.g. Data Analyst, Python Developer...';
    }
  }

  if (hiddenInput) hiddenInput.value = (window.targetRolesList || []).join(', ');
  if (!container) return;
  container.innerHTML = (window.targetRolesList || []).map((role, idx) => `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#242830] text-[#D9A441] border border-[#2B3036] shadow-xs">
      <span>${escapeHtml(role)}</span>
      <button type="button" onclick="removeRoleTag(${idx})" class="text-[#9AA0A6] hover:text-rose-400 focus:outline-none cursor-pointer" title="Remove role">✕</button>
    </span>
  `).join('');
}

function addRoleTag(rawRole) {
  const role = (rawRole || '').trim().replace(/^,+|,+$/g, '');
  if (!role) return;
  if (!window.targetRolesList) window.targetRolesList = [];
  if (window.targetRolesList.length >= MAX_ROLES) {
    if (typeof showToast === 'function') {
      showToast(`Maximum ${MAX_ROLES} job roles allowed to maintain optimal search relevance.`, 'warning');
    }
    return;
  }
  if (!window.targetRolesList.some(r => r.toLowerCase() === role.toLowerCase())) {
    window.targetRolesList.push(role);
    renderRoleTags();
  }
}

function removeRoleTag(idx) {
  if (window.targetRolesList) {
    window.targetRolesList.splice(idx, 1);
    renderRoleTags();
  }
}

const MAX_LOCATIONS = 5;

function detectLocationFlag(locStr) {
  const lower = (locStr || '').toLowerCase();
  if (lower.includes('remote') || lower.includes('worldwide')) return '🌐';
  if (Array.isArray(window.allGlobalCitiesDataset)) {
    const match = window.allGlobalCitiesDataset.find(c =>
      c.formatted.toLowerCase() === lower || c.city.toLowerCase() === lower || lower.includes(c.city.toLowerCase())
    );
    if (match && match.flag) return match.flag;
  }
  if (lower.includes('canada') || /,\s*(on|bc|qc|ab|mb|sk|ns|nb|nl|pe|nt|nu|yt)\b/i.test(lower)) return '🇨🇦';
  if (lower.includes('usa') || lower.includes('united states') || /,\s*(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc)\b/i.test(lower)) return '🇺🇸';
  if (lower.includes('uk') || lower.includes('united kingdom') || lower.includes('london')) return '🇬🇧';
  if (lower.includes('germany') || lower.includes('deutschland') || lower.includes('berlin')) return '🇩🇪';
  if (lower.includes('india') || lower.includes('bengaluru') || lower.includes('delhi')) return '🇮🇳';
  if (lower.includes('australia') || lower.includes('sydney')) return '🇦🇺';
  if (lower.includes('france') || lower.includes('paris')) return '🇫🇷';
  return '📍';
}

function renderLocationTags() {
  const container = document.getElementById('locations-badges-list');
  const hiddenInput = document.getElementById('cfg-locations');
  const countLabel = document.getElementById('settings-cities-count-label');
  const locCount = (window.targetLocationsList || []).length;

  if (countLabel) {
    countLabel.innerText = `(${locCount}/${MAX_LOCATIONS})`;
    countLabel.className = locCount >= MAX_LOCATIONS ? 'text-amber-400 font-mono text-[10px] font-bold' : 'text-[#5FA8A0] font-mono text-[10px]';
  }

  const locInput = document.getElementById('input-add-location');
  if (locInput && locCount >= MAX_LOCATIONS) {
    locInput.placeholder = 'Maximum 5 cities reached';
  }

  if (hiddenInput) hiddenInput.value = (window.targetLocationsList || []).join(', ');
  if (!container) return;
  container.innerHTML = (window.targetLocationsList || []).map((loc, idx) => {
    const flag = detectLocationFlag(loc);
    return `
      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#242830] text-[#5FA8A0] border border-[#2B3036] shadow-xs">
        <span class="text-xs">${flag}</span>
        <span>${escapeHtml(loc)}</span>
        <button type="button" onclick="removeLocationTag(${idx})" class="text-[#9AA0A6] hover:text-rose-400 focus:outline-none cursor-pointer" title="Remove location">✕</button>
      </span>
    `;
  }).join('');
}

function addLocationTag(rawLoc) {
  const loc = (rawLoc || '').trim().replace(/^,+|,+$/g, '');
  if (!loc) return;
  if (!window.targetLocationsList) window.targetLocationsList = [];
  if (window.targetLocationsList.length >= MAX_LOCATIONS) {
    if (typeof showToast === 'function') {
      showToast(`Maximum ${MAX_LOCATIONS} cities allowed to prevent exceeding free API scoring limits.`, 'warning');
    }
    return;
  }
  if (!window.targetLocationsList.some(l => l.toLowerCase() === loc.toLowerCase())) {
    window.targetLocationsList.push(loc);
    renderLocationTags();
  }
}

function removeLocationTag(idx) {
  if (window.targetLocationsList) {
    window.targetLocationsList.splice(idx, 1);
    renderLocationTags();
    const locInput = document.getElementById('input-add-location');
    if (locInput && (window.targetLocationsList.length < MAX_LOCATIONS)) {
      onCountryScopeChange();
    }
  }
}

function setupTagInputListeners() {
  const roleInput = document.getElementById('input-add-role');
  if (roleInput && !roleInput.dataset.listenerAttached) {
    roleInput.dataset.listenerAttached = 'true';
    roleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addRoleTag(roleInput.value);
        roleInput.value = '';
      }
    });
    roleInput.addEventListener('blur', () => {
      if (roleInput.value.trim()) {
        addRoleTag(roleInput.value);
        roleInput.value = '';
      }
    });
  }

  const locInput = document.getElementById('input-add-location');
  const dropdown = document.getElementById('location-combobox-dropdown');

  if (locInput && !locInput.dataset.listenerAttached) {
    locInput.dataset.listenerAttached = 'true';

    // Focus opens top suggestions
    locInput.addEventListener('focus', () => {
      filterAndRenderLocationSuggestions(locInput.value);
    });

    // Input with debouncing
    locInput.addEventListener('input', () => {
      clearTimeout(comboboxDebounceTimer);
      comboboxDebounceTimer = setTimeout(() => {
        filterAndRenderLocationSuggestions(locInput.value);
      }, 100);
    });

    // Keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)
    locInput.addEventListener('keydown', (e) => {
      const items = dropdown ? dropdown.querySelectorAll('.combobox-item') : [];
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (dropdown.classList.contains('hidden')) {
          filterAndRenderLocationSuggestions(locInput.value);
          return;
        }
        activeComboboxIndex = (activeComboboxIndex + 1) % items.length;
        items.forEach((it, i) => it.classList.toggle('combobox-item-active', i === activeComboboxIndex));
        if (items[activeComboboxIndex]) items[activeComboboxIndex].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (dropdown.classList.contains('hidden')) return;
        activeComboboxIndex = (activeComboboxIndex - 1 + items.length) % items.length;
        items.forEach((it, i) => it.classList.toggle('combobox-item-active', i === activeComboboxIndex));
        if (items[activeComboboxIndex]) items[activeComboboxIndex].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        if (!dropdown.classList.contains('hidden') && activeComboboxIndex >= 0 && items[activeComboboxIndex]) {
          items[activeComboboxIndex].click();
        } else if (locInput.value.trim()) {
          addLocationTag(locInput.value);
          closeComboboxDropdown();
        }
      } else if (e.key === 'Escape') {
        closeComboboxDropdown();
      }
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      const wrapper = document.getElementById('location-combobox-wrapper');
      if (wrapper && !wrapper.contains(e.target)) {
        closeComboboxDropdown();
      }
    });
  }
}

window.addRoleTag = addRoleTag;
window.removeRoleTag = removeRoleTag;
window.addLocationTag = addLocationTag;
window.removeLocationTag = removeLocationTag;
window.renderRoleTags = renderRoleTags;
window.renderLocationTags = renderLocationTags;
window.initGlobalCities = initGlobalCities;
window.initCanadaCities = initCanadaCities;
window.updateLocationSuggestionsForCountry = updateLocationSuggestionsForCountry;
window.onCountryScopeChange = onCountryScopeChange;
window.selectComboboxLocation = selectComboboxLocation;
window.filterAndRenderLocationSuggestions = filterAndRenderLocationSuggestions;
window.closeComboboxDropdown = closeComboboxDropdown;

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
    const cfgWorktype = document.getElementById('cfg-worktype');
    if (cfgWorktype) cfgWorktype.value = currentSettings.work_type || 'Open to All';

    try {
      const envRes = await fetch('/api/env');
      const envData = await envRes.json();
      if (envData.success && envData.env) {
        window.currentEnv = envData.env;
      }
    } catch (_) {}

    setupTagInputListeners();

    // Initialize tags and country detection from current master profile
    let detectedProfileCountry = null;
    try {
      const profRes = await fetch('/api/profile');
      const profData = await profRes.json();
      window.targetRolesList = Array.isArray(profData.target_titles) && profData.target_titles.length
        ? [...profData.target_titles]
        : (Array.isArray(profData.target_roles) && profData.target_roles.length ? [...profData.target_roles] : ['Data Analyst']);
      window.targetLocationsList = Array.isArray(profData.locations) && profData.locations.length
        ? [...profData.locations]
        : ['Remote', 'Toronto, ON'];
      renderRoleTags();
      renderLocationTags();

      // Detect candidate country from master profile
      detectedProfileCountry = profData.country_code || null;
      if (!detectedProfileCountry) {
        const locStr = [profData.contact?.location, ...(window.targetLocationsList || [])].filter(Boolean).join(' ').toLowerCase();
        if (/\b(canada|toronto|vancouver|montreal|calgary|ottawa|edmonton|ontario|quebec|alberta|british columbia|\bon\b|\bbc\b|\bab\b|\bqc\b)\b/i.test(locStr)) detectedProfileCountry = 'CA';
        else if (/\b(usa|united states|new york|california|texas|san francisco|austin|seattle|chicago|los angeles|boston|\bny\b|\btx\b|\bwa\b|\bil\b)\b/i.test(locStr)) detectedProfileCountry = 'US';
        else if (/\b(uk|united kingdom|great britain|london|manchester|birmingham|scotland|england)\b/i.test(locStr)) detectedProfileCountry = 'GB';
        else if (/\b(germany|deutschland|berlin|munich|frankfurt|hamburg)\b/i.test(locStr)) detectedProfileCountry = 'DE';
        else if (/\b(india|delhi|mumbai|bangalore|bengaluru|hyderabad|pune|chennai)\b/i.test(locStr)) detectedProfileCountry = 'IN';
        else if (/\b(australia|sydney|melbourne|brisbane|perth)\b/i.test(locStr)) detectedProfileCountry = 'AU';
      }
      window.detectedProfileCountry = detectedProfileCountry;
    } catch (_) {}

    // Populate country scope dropdown
    let targetScope = currentSettings.country_scope;
    if ((!targetScope || targetScope === 'AUTO') && detectedProfileCountry) {
      targetScope = detectedProfileCountry;
    } else if (!targetScope) {
      targetScope = 'AUTO';
    }

    if (cfgScope) {
      cfgScope.value = targetScope;
      previousCountryScope = targetScope;
    }

    // Trigger onCountryScopeChange to automatically unlock city input, update badge & placeholders
    onCountryScopeChange();

    await renderSettingsBoards();
    await loadSchedulerSettings();
  } catch (e) {
    console.error('loadSettings error:', e);
  }
}

async function runManualScanWithOverrides() {
  const targetTitles = (window.targetRolesList && window.targetRolesList.length)
    ? [...window.targetRolesList]
    : (document.getElementById('cfg-roles')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
  const targetLocations = (window.targetLocationsList && window.targetLocationsList.length)
    ? [...window.targetLocationsList]
    : (document.getElementById('cfg-locations')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
  const minScore = parseInt(document.getElementById('cfg-score')?.value || '60', 10);
  const freshness = parseInt(document.getElementById('cfg-freshness')?.value || '24', 10);
  const scope = document.getElementById('cfg-scope')?.value || 'AUTO';

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
  if (typeof validateFormFields === 'function') {
    const isValid = validateFormFields([
      {
        field: 'input-add-role',
        container: '#roles-tags-container',
        type: 'list_min',
        min: 1,
        getValue: () => window.targetRolesList || [],
        message: 'Please specify at least 1 target job title.'
      },
      {
        field: 'cfg-scope',
        type: 'required',
        message: 'Please select a target country scope.'
      },
      {
        field: 'input-add-location',
        container: '#locations-tags-container',
        type: 'list_min',
        min: 1,
        getValue: () => window.targetLocationsList || [],
        message: 'Please add at least 1 target city or location.'
      }
    ]);
    if (!isValid) {
      showToast('Please complete the required settings fields.', 'error');
      return;
    }
  }

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
        boards_enabled: boards,
        target_titles: window.targetRolesList || [],
        locations: window.targetLocationsList || []
      })
    });
    showToast('✅ Preferences & settings saved successfully!');
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
const SCHEDULER_PRESETS = {
  DAILY: { cron: '0 9 * * *', label: 'Once a Day (9:00 AM)', desc: '⏰ Scanning: Once daily every morning at 9:00 AM' },
  TWICE: { cron: '0 9,17 * * *', label: 'Twice a Day (9 AM & 5 PM)', desc: '⏰ Scanning: Twice daily at 9:00 AM & 5:00 PM' },
  '4H': { cron: '0 */4 * * *', label: 'Every 4 Hours', desc: '⏰ Scanning: Active search mode, every 4 hours' },
  MANUAL: { cron: '0 9 * * *', label: 'Manual Only', desc: '⏸️ Automatic scanning paused (on-demand only)' }
};

let currentSchedulerData = null;

function selectSchedulerPreset(preset) {
  const cfg = SCHEDULER_PRESETS[preset] || SCHEDULER_PRESETS.DAILY;
  const cronInput = document.getElementById('sched-cron-input');
  const hiddenPreset = document.getElementById('sched-preset-select');
  const humanSummary = document.getElementById('sched-human-summary');
  const toggle = document.getElementById('sched-enabled');

  if (hiddenPreset) hiddenPreset.value = preset;
  if (cronInput) cronInput.value = cfg.cron;
  if (humanSummary) humanSummary.innerText = cfg.desc;

  if (preset === 'MANUAL') {
    if (toggle) toggle.checked = false;
    onSchedulerToggleChange();
  } else {
    if (toggle && !toggle.checked) {
      toggle.checked = true;
      onSchedulerToggleChange();
    }
  }

  // Highlight active preset card
  document.querySelectorAll('.sched-preset-card').forEach(card => {
    card.classList.remove('border-[#D9A441]', 'ring-1', 'ring-[#D9A441]/30');
    card.classList.add('border-[#2B3036]');
  });
  const activeCard = document.getElementById(`sched-card-${preset}`);
  if (activeCard) {
    activeCard.classList.remove('border-[#2B3036]');
    activeCard.classList.add('border-[#D9A441]', 'ring-1', 'ring-[#D9A441]/30');
  }
}
window.selectSchedulerPreset = selectSchedulerPreset;

async function loadSchedulerSettings() {
  try {
    const res = await fetch('/api/scheduler');
    const data = await res.json();
    currentSchedulerData = data;

    const toggle = document.getElementById('sched-enabled');
    const badge = document.getElementById('sched-badge-status');
    const label = document.getElementById('sched-enabled-label');
    const cronInput = document.getElementById('sched-cron-input');
    const lastRunLabel = document.getElementById('sched-last-run-label');
    const foundLabel = document.getElementById('sched-found-label');

    if (toggle) toggle.checked = Boolean(data.enabled);
    if (label) label.innerText = data.enabled ? 'Automatic Scanning' : 'Scanning Paused';

    if (badge) {
      if (data.isRunning) {
        badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/25 flex items-center gap-1';
        badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span> Scanning Now';
      } else if (data.enabled) {
        badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/25';
        badge.innerHTML = '● Active';
      } else {
        badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase bg-slate-500/10 text-slate-400 border border-slate-500/25';
        badge.innerHTML = '○ Paused';
      }
    }

    if (cronInput && data.schedule) {
      cronInput.value = data.schedule;
    }

    let activePreset = data.preset || 'DAILY';
    if (!data.enabled) {
      activePreset = 'MANUAL';
    } else if (data.schedule === '0 9,17 * * *') {
      activePreset = 'TWICE';
    } else if (data.schedule === '0 */4 * * *') {
      activePreset = '4H';
    } else if (data.schedule === '0 9 * * *') {
      activePreset = 'DAILY';
    }
    selectSchedulerPreset(activePreset);

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
  if (presetSelect) {
    selectSchedulerPreset(presetSelect.value);
  }
}

function onSchedulerToggleChange() {
  const toggle = document.getElementById('sched-enabled');
  const badge = document.getElementById('sched-badge-status');
  const label = document.getElementById('sched-enabled-label');
  if (!toggle) return;

  const isEnabled = toggle.checked;
  if (label) label.innerText = isEnabled ? 'Automatic Scanning' : 'Scanning Paused';
  if (badge) {
    if (isEnabled) {
      badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/25';
      badge.innerHTML = '● Active';
    } else {
      badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase bg-slate-500/10 text-slate-400 border border-slate-500/25';
      badge.innerHTML = '○ Paused';
    }
  }
}

async function saveSchedulerSettings() {
  const btn = document.getElementById('btn-save-scheduler');
  const toggle = document.getElementById('sched-enabled');
  const presetSelect = document.getElementById('sched-preset-select');
  const cronInput = document.getElementById('sched-cron-input');
  const presetKey = presetSelect ? presetSelect.value : 'DAILY';
  const presetInfo = SCHEDULER_PRESETS[presetKey] || SCHEDULER_PRESETS.DAILY;

  const payload = {
    enabled: toggle ? toggle.checked : true,
    preset: presetKey,
    schedule: cronInput ? cronInput.value.trim() : presetInfo.cron,
    description: presetInfo.label
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
