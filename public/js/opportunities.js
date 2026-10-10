/**
 * Jobryt AI - Opportunities Discovery Queue & Pipeline Actions
 */

function formatJobDescriptionSummary(rawDesc) {
  if (!rawDesc || typeof rawDesc !== 'string') return 'No description provided by the job board.';
  let clean = rawDesc.replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= 190) return clean;
  const truncated = clean.substring(0, 190);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 140 ? truncated.substring(0, lastSpace) : truncated) + '...';
}

function formatFullJobDescription(rawDesc) {
  if (!rawDesc || typeof rawDesc !== 'string') {
    return '<p class="text-[#9AA0A6] italic">No detailed description was returned from this job board listing.</p>';
  }
  if (/<(p|ul|ol|li|br|h[1-6]|div)[\s>]/i.test(rawDesc)) {
    return rawDesc
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<a\b([^>]*)>/gi, '<a $1 class="text-[#D9A441] underline" target="_blank" rel="noopener noreferrer">')
      .replace(/<ul\b[^>]*>/gi, '<ul class="list-disc pl-5 space-y-1 my-2">')
      .replace(/<ol\b[^>]*>/gi, '<ol class="list-decimal pl-5 space-y-1 my-2">')
      .replace(/<li\b[^>]*>/gi, '<li class="text-[#CBD5E1] my-0.5">')
      .replace(/<p\b[^>]*>/gi, '<p class="my-2 leading-relaxed text-[#CBD5E1]">')
      .replace(/<h[1-6]\b[^>]*>/gi, '<h4 class="font-bold text-[#E8E6E1] text-xs uppercase tracking-wider mt-3 mb-1">');
  } else {
    const lines = rawDesc.split(/\r?\n/);
    let html = '';
    let inList = false;
    for (let line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (inList) { html += '</ul>'; inList = false; }
        continue;
      }
      if (/^[\*\-•–]\s+(.+)/.test(trimmed)) {
        if (!inList) { html += '<ul class="list-disc pl-5 space-y-1 my-2">'; inList = true; }
        const item = trimmed.replace(/^[\*\-•–]\s+/, '');
        html += `<li class="text-[#CBD5E1] my-0.5">${escapeHtml(item)}</li>`;
      } else if (/(requirements|responsibilities|qualifications|about the role|what you will do|who you are|benefits):?$/i.test(trimmed)) {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<h4 class="font-bold text-[#E8E6E1] text-xs uppercase tracking-wider mt-3 mb-1">${escapeHtml(trimmed)}</h4>`;
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<p class="my-2 leading-relaxed text-[#CBD5E1]">${escapeHtml(trimmed)}</p>`;
      }
    }
    if (inList) html += '</ul>';
    return html;
  }
}

function toggleJobDescription(jobId) {
  const panel = document.getElementById(`jd-full-${jobId}`);
  const btn = document.getElementById(`btn-toggle-jd-${jobId}`);
  const icon = document.getElementById(`icon-toggle-jd-${jobId}`);
  if (!panel || !btn) return;
  const isHidden = panel.classList.contains('hidden');
  if (isHidden) {
    panel.classList.remove('hidden');
    const textSpan = btn.querySelector('span');
    if (textSpan) textSpan.innerText = 'Show less';
    if (icon) icon.classList.add('rotate-180');
  } else {
    panel.classList.add('hidden');
    const textSpan = btn.querySelector('span');
    if (textSpan) textSpan.innerText = 'Read full description';
    if (icon) icon.classList.remove('rotate-180');
  }
}

function updatePendingBadges(count) {
  const c = Math.max(0, parseInt(count, 10) || 0);
  const countPending = document.getElementById('tab-count-pending');
  if (countPending) countPending.innerText = c;
  const metricPending = document.getElementById('metric-pending');
  if (metricPending) metricPending.innerText = c;
  const pBadge = document.getElementById('tab-count-pending-badge');
  if (pBadge) pBadge.innerText = c;
  const feedChip = document.getElementById('feed-pending-chip');
  if (feedChip) feedChip.innerText = `${c} pending`;
  const sidePending = document.getElementById('side-count-pending');
  if (sidePending) sidePending.innerText = c;
  const sideQueueMetric = document.getElementById('side-metric-queue');
  if (sideQueueMetric) sideQueueMetric.innerText = c;
  if (typeof activeTab !== 'undefined' && activeTab === 'feed') {
    const mobHeaderCount = document.getElementById('mobile-active-section-count');
    if (mobHeaderCount) mobHeaderCount.innerText = c;
  }
}

function renderPendingSkeletons(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="skeleton-card skeleton-shimmer space-y-3.5 mb-4 p-5 sm:p-6 rounded-xl border border-[#2B3036] bg-[#16191E]">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-xl skeleton-box"></div>
          <div class="space-y-1.5">
            <div class="w-48 sm:w-64 h-4 skeleton-box"></div>
            <div class="w-32 h-3 skeleton-box"></div>
          </div>
        </div>
        <div class="w-16 h-6 rounded-full skeleton-box"></div>
      </div>
      <div class="flex gap-2">
        <div class="w-20 h-5 skeleton-box"></div>
        <div class="w-24 h-5 skeleton-box"></div>
        <div class="w-16 h-5 skeleton-box"></div>
      </div>
      <div class="w-full h-12 skeleton-box rounded-md"></div>
    </div>
    <div class="skeleton-card skeleton-shimmer space-y-3.5 mb-4 p-5 sm:p-6 rounded-xl border border-[#2B3036] bg-[#16191E]">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-xl skeleton-box"></div>
          <div class="space-y-1.5">
            <div class="w-40 sm:w-56 h-4 skeleton-box"></div>
            <div class="w-28 h-3 skeleton-box"></div>
          </div>
        </div>
        <div class="w-16 h-6 rounded-full skeleton-box"></div>
      </div>
      <div class="flex gap-2">
        <div class="w-16 h-5 skeleton-box"></div>
        <div class="w-20 h-5 skeleton-box"></div>
      </div>
      <div class="w-full h-12 skeleton-box rounded-md"></div>
    </div>
  `;
}

function removeJobFromLocalCache(jobId) {
  try {
    if (window.allLoadedPendingJobs) {
      window.allLoadedPendingJobs = window.allLoadedPendingJobs.filter(j => String(j.id) !== String(jobId));
    }
    const raw = localStorage.getItem('jobryt_cached_pending_jobs');
    if (!raw) return;
    const jobs = JSON.parse(raw);
    if (Array.isArray(jobs)) {
      const filtered = jobs.filter(j => String(j.id) !== String(jobId));
      if (filtered.length > 0) {
        localStorage.setItem('jobryt_cached_pending_jobs', JSON.stringify(filtered));
      } else {
        localStorage.removeItem('jobryt_cached_pending_jobs');
      }
      updatePendingBadges(filtered.length);
    }
  } catch (_) {}
}

function hydrateFromCachedJobs() {
  try {
    const raw = localStorage.getItem('jobryt_cached_pending_jobs');
    if (!raw) return false;
    const jobs = JSON.parse(raw);
    if (Array.isArray(jobs) && jobs.length > 0) {
      window.allLoadedPendingJobs = jobs;
      filterOpportunities();
      return true;
    }
  } catch (e) {
    console.warn('hydrateFromCachedJobs parse error:', e);
  }
  return false;
}

function renderPendingJobs(jobs, isFilterZero = false) {
  const container = document.getElementById('pending-jobs-list');
  if (!container) return;

  try {
    const jobList = Array.isArray(jobs) ? jobs : [];
    updatePendingBadges(window.allLoadedPendingJobs ? window.allLoadedPendingJobs.length : jobList.length);
    if (typeof JobrytStore !== 'undefined') {
      JobrytStore.setState({ pendingJobs: window.allLoadedPendingJobs || jobList });
    }

    if (isFilterZero) {
      container.innerHTML = `
        <div class="glass-card rounded-2xl p-8 sm:p-10 text-center max-w-xl mx-auto space-y-4 my-4 border border-[#2B3036] shadow-xl">
          <div class="w-12 h-12 rounded-xl bg-[#242830] border border-[#2B3036] flex items-center justify-center mx-auto text-[#9AA0A6]">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </div>
          <div class="space-y-1">
            <h3 class="text-base font-bold text-[#E8E6E1]">No opportunities match your current filter</h3>
            <p class="text-xs text-[#9AA0A6]">Try adjusting your search query, score threshold, or workplace mode filter.</p>
          </div>
          <button onclick="resetOppFilters()"
            class="px-4 py-2 rounded-lg text-xs font-semibold bg-[#D9A441] hover:bg-[#C59132] text-[#14161A] active:scale-95 cursor-pointer">
            Reset Filters
          </button>
        </div>
      `;
      return;
    }

    if (jobList.length === 0) {
      const activeTitles = (window.targetRolesList && window.targetRolesList.length)
        ? window.targetRolesList.slice(0, 4).join(', ')
        : 'Configured in Settings';
      const activeLocs = (window.targetLocationsList && window.targetLocationsList.length)
        ? window.targetLocationsList.slice(0, 3).join(', ')
        : 'Global / Remote';

      container.innerHTML = `
        <div class="glass-card rounded-2xl p-6 sm:p-10 text-center max-w-2xl mx-auto space-y-6 my-4 border border-[#2B3036]/80 shadow-xl transition-all">
          <div class="w-14 h-14 rounded-2xl bg-[#D9A441]/10 border border-[#D9A441]/25 flex items-center justify-center mx-auto text-[#D9A441] shadow-lg shadow-[#D9A441]/5">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          
          <div class="space-y-2">
            <h3 class="text-lg sm:text-xl font-bold text-[#E8E6E1] tracking-tight">
              Ready to Discover High-Match Opportunities
            </h3>
            <p class="text-xs sm:text-sm text-[#9AA0A6] max-w-md mx-auto leading-relaxed">
              Your profile is synchronized with autonomous crawler adapters across 16 major job boards. Click Run Scan to ingest, score, and rank opportunities in real time.
            </p>
          </div>

          <!-- Quick Setup Status Pills -->
          <div class="p-3.5 rounded-xl bg-[#111317] border border-[#2B3036] flex flex-col sm:flex-row items-center justify-around gap-3 text-left text-xs">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-amber-400 font-mono">🎯 Roles:</span>
              <span class="font-medium text-[#E8E6E1] truncate">${escapeHtml(activeTitles)}</span>
            </div>
            <div class="h-4 w-px bg-[#2B3036] hidden sm:block"></div>
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-[#5FA8A0] font-mono">📍 Locations:</span>
              <span class="font-medium text-[#E8E6E1] truncate">${escapeHtml(activeLocs)}</span>
            </div>
          </div>

          <!-- Action CTA Buttons -->
          <div class="flex items-center justify-center gap-3 flex-wrap pt-1">
            <button onclick="triggerPipelineScan()" id="btn-empty-scan"
              class="px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold bg-[#D9A441] hover:bg-[#C59132] text-[#14161A] flex items-center gap-2 active:scale-95 shadow-md shadow-[#D9A441]/20 cursor-pointer">
              <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Run Discovery Scan</span>
            </button>
            <button onclick="openScanModal()"
              class="px-4 py-2.5 rounded-lg text-xs sm:text-sm font-medium bg-[#242830] hover:bg-[#2B3036] text-[#E8E6E1] border border-[#2B3036] flex items-center gap-2 active:scale-95 cursor-pointer">
              <span>View Scan Insights</span>
            </button>
          </div>

          <!-- Quick Context Banner -->
          <div class="pt-2 border-t border-[#2B3036]/60 flex items-center justify-center gap-4 text-[11px] text-[#9AA0A6] flex-wrap font-mono">
            <span class="flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>Autonomous Multi-Board Ingestion Active</span>
            </span>
            <span class="hidden sm:inline text-[#3D444D]">•</span>
            <span class="flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              <span>Scoring Threshold: 70+ Match</span>
            </span>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = jobs.map(job => {
      const score = job.score || job.match_score || 80;
      const isHighMatch = score >= 85;
      const scoreBadgeClass = isHighMatch
        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
        : (score >= 75 ? 'text-[#5FA8A0] bg-[#5FA8A0]/10 border-[#5FA8A0]/25' : 'text-[#D9A441] bg-[#D9A441]/10 border-[#D9A441]/25');
      const jobUrl = job.job_url || job.redirect_url || job.apply_url || job.url || '';

      const companyInitial = (job.company || 'J').trim().charAt(0).toUpperCase();
      const location = job.location || 'Remote / Hybrid';
      const contractType = job.contract_type || '';

      const matchedSkills = (job.key_matched_skills || []).slice(0, 8);
      const boardSkills = job.skills || job.required_skills || [];
      const otherSkills = (boardSkills.filter(s => !matchedSkills.map(m => m.toLowerCase()).includes(String(s).toLowerCase()))).slice(0, 5);
      const missingSkills = (job.missing_skills || []).slice(0, 3);

      const rawDesc = job.description || job.snippet || job.details || job.summary || '';
      const jdSummary = formatJobDescriptionSummary(rawDesc);
      const jdFullHtml = formatFullJobDescription(rawDesc);
      const hasFullJd = Boolean(rawDesc && rawDesc.trim().length > 190);

      return `
        <div class="app-card app-card-hover rounded-xl p-5 sm:p-6 transition-all border border-[#2B3036] hover:border-[#3D444D] bg-[#16191E] flex flex-col gap-4 group" id="job-card-${job.id}">
          
          <!-- 1. Header: Avatar + Title & Meta (Left) | Match Score Badge (Right) -->
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3.5 min-w-0 flex-1">
              <!-- Company Avatar Initial Badge -->
              <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-[#242830] to-[#1A1D23] border border-[#2B3036] text-[#D9A441] font-bold text-base flex items-center justify-center shrink-0 shadow-xs select-none">
                ${escapeHtml(companyInitial)}
              </div>

              <!-- Title, Company & Essential Meta Pills -->
              <div class="min-w-0 flex-1">
                <h3 class="text-base sm:text-lg font-bold text-[#E8E6E1] group-hover:text-[#D9A441] transition-colors tracking-tight leading-snug">
                  ${escapeHtml(job.title)}
                </h3>

                <div class="flex items-center gap-2 flex-wrap text-xs mt-1 text-[#9AA0A6]">
                  <span class="font-semibold text-[#E8E6E1]">${escapeHtml(job.company)}</span>
                  <span class="text-[#3D444D]" aria-hidden="true">•</span>
                  
                  <!-- Location Pill -->
                  <span class="inline-flex items-center gap-1 text-[#CBD5E1]">
                    <svg class="w-3.5 h-3.5 text-[#9AA0A6] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    <span>${escapeHtml(location)}</span>
                  </span>

                  <!-- Contract Type -->
                  ${contractType ? `
                    <span class="text-[#3D444D]" aria-hidden="true">•</span>
                    <span class="px-2 py-0.5 text-[10px] font-medium rounded bg-[#242830] text-[#9AA0A6] border border-[#2B3036]">${escapeHtml(contractType)}</span>
                  ` : ''}

                  <!-- Job Board Source Badge -->
                  <span class="text-[#3D444D]" aria-hidden="true">•</span>
                  <span class="job-source-badge px-2 py-0.5 text-[10px] font-semibold bg-[#242830] text-[#D9A441] rounded border border-[#2B3036] uppercase tracking-wider font-mono">
                    ${escapeHtml(job.source || 'Direct')}
                  </span>
                </div>
              </div>
            </div>

            <!-- Match Score Badge Gauge & Breakdown Pills -->
            <div class="shrink-0 flex flex-col items-end gap-1.5">
              <div class="px-3 py-1 text-xs font-bold rounded-lg border ${scoreBadgeClass} font-mono tabular-nums flex items-center gap-1.5 shadow-xs">
                <span class="w-1.5 h-1.5 rounded-full ${isHighMatch ? 'bg-emerald-400' : 'bg-[#5FA8A0]'}"></span>
                <span>${score}% Match</span>
              </div>
              ${job.breakdown ? `
                <div class="flex items-center gap-1.5 text-[10px] font-mono text-[#9AA0A6] flex-wrap justify-end">
                  <span class="px-1.5 py-0.5 rounded bg-[#20242B] border border-[#2B3036]" title="Skills Match (45% Weight)">🎯 Skills: <strong class="text-[#CBD5E1]">${job.breakdown.skills_fit_score || 85}%</strong></span>
                  <span class="px-1.5 py-0.5 rounded bg-[#20242B] border border-[#2B3036]" title="Seniority Match (30% Weight)">⚡ Seniority: <strong class="text-[#CBD5E1]">${job.breakdown.seniority_fit_score || 80}%</strong></span>
                  <span class="px-1.5 py-0.5 rounded bg-[#20242B] border border-[#2B3036]" title="Role Function Fit (10% Weight)">💼 Role: <strong class="text-[#CBD5E1]">${job.breakdown.function_fit_score != null ? job.breakdown.function_fit_score : (job.breakdown.seniority_fit_score || 80)}%</strong></span>
                  <span class="px-1.5 py-0.5 rounded bg-[#20242B] border border-[#2B3036]" title="Location Fit & Hard Gate (15% Weight)">📍 Loc: <strong class="${job.breakdown.location_gate_passed === false ? 'text-red-400' : 'text-[#CBD5E1]'}">${job.breakdown.location_fit_score || 90}%</strong></span>
                </div>
              ` : ''}
              ${(job.skills_unstated_default || (job.notes_concerns && job.notes_concerns.includes('90% default applied'))) ? `
                <span class="text-[9px] text-[#D9A441] italic font-mono">⚡ 90% skills baseline (verbal screen)</span>
              ` : ''}
            </div>
          </div>

          <!-- 2. Mid Content Area: Role Overview & Description Summary -->
          <div class="p-4 rounded-xl bg-[#111317] border border-[#2B3036] flex flex-col justify-between gap-3">
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-[#D9A441] font-semibold uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                  <svg class="w-3.5 h-3.5 text-[#D9A441]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  <span>Role Overview & Description</span>
                </span>
                <span class="text-[10px] text-[#5F6B76] font-mono">Job Board Posting</span>
              </div>
              <p class="text-xs text-[#CBD5E1] leading-relaxed line-clamp-3">
                ${escapeHtml(jdSummary)}
              </p>
            </div>

            <!-- Expand Toggle Button -->
            ${hasFullJd ? `
              <div class="pt-1">
                <button onclick="toggleJobDescription('${job.id}')" id="btn-toggle-jd-${job.id}" class="text-[11px] font-semibold text-[#D9A441] hover:text-[#F59E0B] inline-flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95">
                  <span>Read full description</span>
                  <svg id="icon-toggle-jd-${job.id}" class="w-3.5 h-3.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                </button>
              </div>
            ` : ''}
          </div>

          <!-- Full Job Description Drawer (Toggled by Read full description) -->
          <div id="jd-full-${job.id}" class="hidden p-4 rounded-lg bg-[#111317] border border-[#2B3036] text-xs text-[#CBD5E1] leading-relaxed max-h-96 overflow-y-auto">
            <div class="flex items-center justify-between pb-2 mb-3 border-b border-[#2B3036]">
              <h4 class="font-bold text-[#E8E6E1] text-xs uppercase tracking-wider flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 text-[#D9A441]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                <span>Full Job Specification & Requirements</span>
              </h4>
              <button onclick="toggleJobDescription('${job.id}')" class="text-[11px] font-medium text-[#9AA0A6] hover:text-[#E8E6E1] cursor-pointer">Close ✕</button>
            </div>
            <div class="prose prose-invert max-w-none text-xs text-[#CBD5E1] leading-relaxed space-y-2">
              ${jdFullHtml}
            </div>
          </div>

          <!-- 3. Skill Stack Section (Matched Skills + Required Board Stack) -->
          <div class="pt-1 flex items-center gap-2 flex-wrap">
            <span class="text-[10px] text-[#9AA0A6] uppercase tracking-wider font-semibold shrink-0">Required Stack:</span>
            
            <!-- Matched Skills (Green) -->
            ${matchedSkills.map(s => `
              <span class="px-2 py-0.5 text-[11px] font-mono rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                <svg class="w-3 h-3 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                <span>${escapeHtml(s)}</span>
              </span>
            `).join('')}

            <!-- Other Required Board Skills -->
            ${otherSkills.map(s => `
              <span class="px-2 py-0.5 text-[11px] font-mono rounded-md bg-[#242830] text-[#CBD5E1] border border-[#2B3036]">
                ${escapeHtml(s)}
              </span>
            `).join('')}

            <!-- Missing Skills (if any) -->
            ${missingSkills.map(s => `
              <span class="px-2 py-0.5 text-[10px] font-mono rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Needs: ${escapeHtml(s)}
              </span>
            `).join('')}
          </div>

          <!-- 4. Action Bar (Apply & Tailor PDF, Link, Pass) -->
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-[#2B3036]/60">
            <div class="text-[11px] text-[#9AA0A6] font-mono flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-[#D9A441]"></span>
              <span>ATS-Tailored PDF & Cover Letter Pipeline</span>
            </div>

            <div class="flex items-center gap-2 w-full sm:w-auto shrink-0 flex-wrap justify-end">
              <button onclick="rejectJob('${job.id}')" class="py-2 px-3 rounded-md text-xs font-medium bg-[#242830] hover:bg-[#2B3036] text-[#9AA0A6] hover:text-[#E5786D] border border-[#2B3036] hover:border-[#E5786D]/30 transition-all active:scale-[0.98] cursor-pointer">
                Pass
              </button>

              ${jobUrl ? `
                <a href="${jobUrl}" target="_blank" rel="noopener noreferrer" class="py-2 px-3.5 rounded-md text-xs font-medium bg-[#242830] hover:bg-[#2B3036] text-[#E8E6E1] border border-[#2B3036] flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]">
                  <svg class="w-3.5 h-3.5 shrink-0 text-[#9AA0A6]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  <span>View Posting</span>
                </a>
              ` : ''}

              <button onclick="applyToJob('${job.id}')" id="btn-apply-${job.id}" class="py-2 px-4 rounded-md text-xs font-semibold bg-[#D9A441] hover:bg-[#C59132] text-[#14161A] transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer shadow-xs">
                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                <span>Apply & Tailor PDF</span>
              </button>
            </div>
          </div>

        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('renderPendingJobs error:', e);
  }
}

async function loadPendingJobs() {
  const container = document.getElementById('pending-jobs-list');
  // If container is empty or only has skeleton cards, ensure skeletons are showing
  if (container && (!container.children.length || container.querySelector('.skeleton-card'))) {
    renderPendingSkeletons(container);
  }

  try {
    const res = await fetch('/api/jobs/pending');
    const data = await res.json();
    const jobs = data.jobs || [];

    window.allLoadedPendingJobs = jobs;

    // Cache updated jobs
    try {
      if (jobs.length > 0) {
        localStorage.setItem('jobryt_cached_pending_jobs', JSON.stringify(jobs));
      } else {
        localStorage.removeItem('jobryt_cached_pending_jobs');
      }
    } catch (_) {}

    filterOpportunities();
  } catch (e) {
    console.error('loadPendingJobs error:', e);
  }
}

// ── Search & Filter State & Handlers ───────────────────────────────────────────
window.currentScoreFilter = 'all';
window.currentWorktypeFilter = 'all';

function setScoreFilter(score) {
  window.currentScoreFilter = score;
  document.querySelectorAll('.opp-score-btn').forEach(btn => {
    const isMatch = btn.getAttribute('data-score') === String(score);
    btn.className = isMatch
      ? 'opp-score-btn px-2.5 py-1 rounded text-[11px] font-medium bg-[#242830] text-[#E8E6E1] transition-all'
      : 'opp-score-btn px-2.5 py-1 rounded text-[11px] font-medium text-[#9AA0A6] hover:text-[#E8E6E1] transition-all';
  });
  filterOpportunities();
}

function setWorktypeFilter(mode) {
  window.currentWorktypeFilter = mode;
  document.querySelectorAll('.opp-work-btn').forEach(btn => {
    const isMatch = btn.getAttribute('data-worktype') === String(mode);
    btn.className = isMatch
      ? 'opp-work-btn px-2 py-1 rounded text-[11px] font-medium bg-[#242830] text-[#E8E6E1] transition-all'
      : 'opp-work-btn px-2 py-1 rounded text-[11px] font-medium text-[#9AA0A6] hover:text-[#E8E6E1] transition-all';
  });
  filterOpportunities();
}

function resetOppFilters() {
  const input = document.getElementById('opp-search-input');
  if (input) input.value = '';
  setScoreFilter('all');
  setWorktypeFilter('all');
}

function filterOpportunities() {
  const jobs = window.allLoadedPendingJobs || [];
  const searchInput = document.getElementById('opp-search-input');
  const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
  const scoreMin = window.currentScoreFilter === 'all' ? 0 : Number(window.currentScoreFilter);
  const worktype = window.currentWorktypeFilter || 'all';

  const filtered = jobs.filter(job => {
    // Search query match
    if (query) {
      const title = (job.title || '').toLowerCase();
      const company = (job.company || '').toLowerCase();
      const location = (job.location || '').toLowerCase();
      const skills = Array.isArray(job.matched_skills) ? job.matched_skills.join(' ').toLowerCase() : '';
      if (!title.includes(query) && !company.includes(query) && !location.includes(query) && !skills.includes(query)) {
        return false;
      }
    }
    // Score threshold match
    const score = Number(job.match_score) || 0;
    if (score < scoreMin) return false;

    // Worktype filter match
    if (worktype !== 'all') {
      const mode = (job.workplace_type || job.remote_status || '').toLowerCase();
      if (worktype === 'remote') {
        if (!mode.includes('remote') && !job.is_remote) return false;
      } else if (worktype === 'hybrid') {
        if (!mode.includes('hybrid')) return false;
      }
    }

    return true;
  });

  const badge = document.getElementById('opp-filtered-count');
  if (badge) {
    if (query || scoreMin > 0 || worktype !== 'all') {
      badge.textContent = `Showing ${filtered.length} of ${jobs.length}`;
    } else {
      badge.textContent = `Showing all (${jobs.length})`;
    }
  }

  const isFilterZero = filtered.length === 0 && jobs.length > 0;
  renderPendingJobs(filtered, isFilterZero);
}

// ── Scan Diagnostics & Polling Controller ──────────────────────────────────────
let scanPollTimer = null;

function openScanModal() {
  const modal = document.getElementById('scan-modal');
  if (modal) modal.classList.remove('hidden');
  checkScanStatus();
}

function closeScanModal() {
  const modal = document.getElementById('scan-modal');
  if (modal) modal.classList.add('hidden');
  if (scanPollTimer) {
    clearTimeout(scanPollTimer);
    scanPollTimer = null;
  }
}

async function stopScan() {
  const btn = document.getElementById('btn-stop-scan');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> <span>Stopping...</span>`;
  }
  try {
    await fetch('/api/pipeline/stop', { method: 'POST' });
    await checkScanStatus();
  } catch (e) {
    console.error('stopScan error:', e);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function checkScanStatus() {
  try {
    const res = await fetch('/api/pipeline/status');
    const data = await res.json();
    renderScanDiagnostics(data);

    if (data.status === 'running') {
      if (scanPollTimer) clearTimeout(scanPollTimer);
      scanPollTimer = setTimeout(checkScanStatus, 1500);
    }
  } catch (e) {
    console.error('checkScanStatus error:', e);
  }
}

function renderScanDiagnostics(data) {
  const isRunning = data.status === 'running';
  const badge = document.getElementById('scan-modal-status-badge');
  const stepEl = document.getElementById('scan-modal-step');
  const spinner = document.getElementById('scan-modal-spinner');
  const doneIcon = document.getElementById('scan-modal-done-icon');
  const stopBtn = document.getElementById('btn-stop-scan');
  const logsEl = document.getElementById('scan-logs');
  const breakdownEl = document.getElementById('scan-board-breakdown');
  const totalExaminedEl = document.getElementById('scan-total-examined');
  const footerMeta = document.getElementById('scan-footer-meta');
  const navDot = document.getElementById('scan-status-dot');
  const navText = document.getElementById('scan-insights-btn-text');

  // Nav indicator
  if (navDot) {
    navDot.className = isRunning
      ? 'w-2 h-2 rounded-full bg-amber-400 animate-ping'
      : 'w-2 h-2 rounded-full bg-emerald-400';
  }
  if (navText) {
    navText.textContent = isRunning ? 'Scanning Feeds (Live)...' : 'Scan Insights & Logs';
  }

  // Modal header status badge
  if (badge) {
    if (isRunning) {
      badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20';
      badge.textContent = 'Scanning Live';
    } else if (data.status === 'aborted') {
      badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20';
      badge.textContent = 'Stopped';
    } else {
      badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      badge.textContent = 'Idle / Ready';
    }
  }

  if (stepEl) {
    stepEl.textContent = data.currentStep || (isRunning ? 'Processing job feeds...' : 'Scan idle. Last scan details available.');
  }

  if (spinner && doneIcon) {
    if (isRunning) {
      spinner.classList.remove('hidden');
      doneIcon.classList.add('hidden');
    } else {
      spinner.classList.add('hidden');
      doneIcon.classList.remove('hidden');
    }
  }

  if (stopBtn) {
    if (isRunning) {
      stopBtn.classList.remove('hidden');
      stopBtn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg> <span>Stop Scan</span>`;
    } else {
      stopBtn.classList.add('hidden');
    }
  }

  // Stepper / Funnel highlights
  const stats = data.stats || {};
  const stepSub1 = document.getElementById('step-sub-1');
  const stepSub2 = document.getElementById('step-sub-2');
  const stepSub3 = document.getElementById('step-sub-3');
  const stepSub4 = document.getElementById('step-sub-4');
  if (stepSub1) stepSub1.textContent = stats.totalFetched ? `${stats.totalFetched} listings` : '16 Boards';
  if (stepSub2) stepSub2.textContent = stats.freshCount ? `${stats.freshCount} passed` : 'Geo & Fresh';
  if (stepSub3) stepSub3.textContent = stats.scoredCount ? `${stats.scoredCount} evaluated` : 'AI & Heuristic';
  if (stepSub4) stepSub4.textContent = stats.qualifiedCount ? `${stats.qualifiedCount} qualified` : 'Yield';

  // Board breakdown badges
  const breakdown = data.boardBreakdown || {};
  const boardNames = Object.keys(breakdown);
  if (breakdownEl) {
    if (boardNames.length > 0) {
      breakdownEl.innerHTML = boardNames.map(board => `
        <span class="px-2 py-0.5 text-[11px] font-mono rounded bg-[#181B20] text-[#CBD5E1] border border-[#2B3036] flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>${escapeHtml(board)}:</span>
          <strong class="text-white">${breakdown[board]}</strong>
        </span>
      `).join('');
    } else {
      breakdownEl.innerHTML = `<span class="text-xs text-[#5F6B76] italic">No board data available</span>`;
    }
  }

  if (totalExaminedEl) {
    totalExaminedEl.textContent = stats.totalFetched ? `${stats.totalFetched} listings examined` : '0 listings';
  }

  // Live or persisted logs
  if (logsEl && Array.isArray(data.logs)) {
    logsEl.innerHTML = data.logs.map(log => {
      let colorClass = 'text-[#CBD5E1]';
      if (log.includes('complete') || log.includes('qualified') || log.includes('passed') || log.includes('finished')) colorClass = 'text-emerald-400';
      else if (log.includes('Stop') || log.includes('aborted') || log.includes('failed')) colorClass = 'text-rose-400';
      else if (log.includes('Scanning') || log.includes('Evaluating') || log.includes('Scoring')) colorClass = 'text-blue-300';
      else if (log.includes('Initializing') || log.includes('Ingestion')) colorClass = 'text-[#D9A441]';
      return `<div class="${colorClass}">${escapeHtml(log)}</div>`;
    }).join('');
    logsEl.scrollTop = logsEl.scrollHeight;
  }

  if (footerMeta) {
    if (data.lastScanTimestamp) {
      const d = new Date(data.lastScanTimestamp);
      footerMeta.textContent = `Last scan: ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      footerMeta.textContent = isRunning ? 'Scan in progress...' : 'Ready';
    }
  }
}

async function triggerPipelineScan() {
  openScanModal();

  try {
    const res = await fetch('/api/pipeline/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();

    if (res.status === 409 || data.status === 'already_running') {
      // Scan already running concurrently - attach to stream
      checkScanStatus();
      return;
    }

    if (data.success) {
      await checkScanStatus();
      await loadStatus();
      await loadPendingJobs();
    } else {
      await checkScanStatus();
    }
  } catch (e) {
    console.error('triggerPipelineScan error:', e);
    await checkScanStatus();
  }
}

async function applyToJob(jobId) {
  const btn = document.getElementById(`btn-apply-${jobId}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> Tailoring...`;
  }

  try {
    const res = await fetch('/api/jobs/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId })
    });
    const data = await res.json();
    if (data.success) {
      const card = document.getElementById(`job-card-${jobId}`);
      if (card) {
        card.classList.add('opacity-40', 'scale-95');
        setTimeout(() => card.remove(), 400);
      }
      removeJobFromLocalCache(jobId);
      await loadStatus();
      await loadAppliedJobs();
      showApplicationPrompt(data.appliedJob);
    } else {
      showToast('Could not apply: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (e) {
    showToast('Application error: ' + e.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function showApplicationPrompt(appliedJob) {
  const modal = document.getElementById('applied-confirm-modal');
  if (!modal) {
    previewLetter(appliedJob.title, appliedJob.company, appliedJob.cover_letter);
    return;
  }
  const titleEl = document.getElementById('confirm-modal-title');
  const subEl = document.getElementById('confirm-modal-subtitle');
  if (titleEl) titleEl.innerText = `Tailored Package Ready!`;
  if (subEl) subEl.innerText = `${appliedJob.title} • ${appliedJob.company}`;

  const btnApplied = document.getElementById('btn-confirm-applied');
  const btnTailored = document.getElementById('btn-confirm-tailored');
  const pdfLink = document.getElementById('confirm-modal-pdf-link');
  const jobLink = document.getElementById('confirm-modal-job-link');

  if (pdfLink && appliedJob.pdf_filename) {
    pdfLink.href = `/api/resume/download/${encodeURIComponent(appliedJob.pdf_filename)}`;
    pdfLink.classList.remove('hidden');
  } else if (pdfLink) {
    pdfLink.classList.add('hidden');
  }

  const externalUrl = appliedJob.job_url || appliedJob.redirect_url;
  if (jobLink && externalUrl) {
    jobLink.href = externalUrl;
    jobLink.classList.remove('hidden');
  } else if (jobLink) {
    jobLink.classList.add('hidden');
  }

  modal.classList.remove('hidden');

  if (btnApplied) {
    btnApplied.onclick = async () => {
      modal.classList.add('hidden');
      await updateApplicationStatus(appliedJob.id, 'Applied');
      previewLetter(appliedJob.title, appliedJob.company, appliedJob.cover_letter);
    };
  }

  if (btnTailored) {
    btnTailored.onclick = async () => {
      modal.classList.add('hidden');
      await updateApplicationStatus(appliedJob.id, 'Tailored');
      previewLetter(appliedJob.title, appliedJob.company, appliedJob.cover_letter);
    };
  }
}

async function rejectJob(jobId) {
  try {
    await fetch('/api/jobs/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId })
    });
    const card = document.getElementById(`job-card-${jobId}`);
    if (card) {
      card.classList.add('opacity-0', 'scale-90');
      setTimeout(() => card.remove(), 300);
    }
    removeJobFromLocalCache(jobId);
    await loadStatus();
  } catch (e) {
    console.error('rejectJob error:', e);
  }
}

// Background status check on startup to set header dot/meta
if (typeof window !== 'undefined') {
  setTimeout(() => { checkScanStatus(); }, 1000);
}

// Window exports
window.hydrateFromCachedJobs = hydrateFromCachedJobs;
window.renderPendingJobs = renderPendingJobs;
window.loadPendingJobs = loadPendingJobs;
window.rejectJob = rejectJob;
window.applyToJob = applyToJob;
window.triggerPipelineScan = triggerPipelineScan;
window.filterOpportunities = filterOpportunities;
window.setScoreFilter = setScoreFilter;
window.setWorktypeFilter = setWorktypeFilter;
window.resetOppFilters = resetOppFilters;
window.openScanModal = openScanModal;
window.closeScanModal = closeScanModal;
window.stopScan = stopScan;
window.checkScanStatus = checkScanStatus;
window.renderScanDiagnostics = renderScanDiagnostics;
