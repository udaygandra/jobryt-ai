/**
 * Jobryt AI - Search Engine Settings, Recruiter Intel & Telegram Bridge
 */

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

    if (currentSettings.boards_enabled) {
      for (const [board, val] of Object.entries(currentSettings.boards_enabled)) {
        const el = document.getElementById(`board-${board}`);
        if (el) el.checked = Boolean(val);
      }
    }
  } catch (e) {
    console.error('loadSettings error:', e);
  }
}

async function runManualScanWithOverrides() {
  const rolesStr = document.getElementById('cfg-roles')?.value || '';
  const locsStr = document.getElementById('cfg-locations')?.value || '';
  const minScore = parseInt(document.getElementById('cfg-score')?.value || '60', 10);
  const freshness = parseInt(document.getElementById('cfg-freshness')?.value || '24', 10);

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
      <div class="text-slate-300">> Minimum Score Threshold: ${minScore}+ | Freshness: ${freshness}h</div>
    `;
  }

  try {
    const res = await fetch('/api/pipeline/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetTitles, targetLocations, minScore, freshnessHours: freshness })
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

  const boards = {
    adzuna: Boolean(document.getElementById('board-adzuna')?.checked),
    canada_job_bank: Boolean(document.getElementById('board-canada_job_bank')?.checked),
    linkedin: Boolean(document.getElementById('board-linkedin')?.checked),
    usajobs: Boolean(document.getElementById('board-usajobs')?.checked),
    jobicy: Boolean(document.getElementById('board-jobicy')?.checked),
    remotive: Boolean(document.getElementById('board-remotive')?.checked)
  };

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

    const llmModel = document.getElementById('env-llm-model')?.value?.trim() || '';
    const tgToken = document.getElementById('env-telegram-token')?.value?.trim() || '';
    const tgChat = document.getElementById('env-telegram-chat')?.value?.trim() || '';
    const envUpdates = {};
    if (llmModel) envUpdates.LLM_MODEL = llmModel;
    if (tgToken) envUpdates.TELEGRAM_BOT_TOKEN = tgToken;
    if (tgChat) envUpdates.TELEGRAM_CHAT_ID = tgChat;

    if (Object.keys(envUpdates).length > 0) {
      await fetch('/api/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envUpdates)
      });
    }

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
