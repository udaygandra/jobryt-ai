/**
 * Jobryt AI - Applications Pipeline & Real-World Application Tracker
 * Implements the LinkedIn / Indeed style application lifecycle:
 *   [Tailored / Ready] -> [Applied] -> [Interviewing] -> [Offer] -> [Rejected / Archived]
 */

let currentAppliedFilter = 'all';

async function loadAppliedJobs(filterStatus = null) {
  const container = document.getElementById('applied-jobs-list');
  if (!container) return;

  if (filterStatus) {
    currentAppliedFilter = filterStatus;
  }

  container.innerHTML = `
    <div class="skeleton-card skeleton-shimmer space-y-3.5 mb-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg skeleton-box"></div>
          <div class="space-y-1.5">
            <div class="w-48 h-4 skeleton-box"></div>
            <div class="w-32 h-3 skeleton-box"></div>
          </div>
        </div>
        <div class="w-24 h-6 rounded-full skeleton-box"></div>
      </div>
      <div class="w-full h-10 skeleton-box rounded-md"></div>
    </div>
    <div class="skeleton-card skeleton-shimmer space-y-3.5">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg skeleton-box"></div>
          <div class="space-y-1.5">
            <div class="w-40 h-4 skeleton-box"></div>
            <div class="w-28 h-3 skeleton-box"></div>
          </div>
        </div>
        <div class="w-24 h-6 rounded-full skeleton-box"></div>
      </div>
      <div class="w-full h-10 skeleton-box rounded-md"></div>
    </div>
  `;

  try {
    const res = await fetch('/api/jobs/applied');
    const data = await res.json();
    let applied = data.jobs || [];

    const tabCount = document.getElementById('tab-count-applied');
    if (tabCount) tabCount.innerText = applied.length;
    const metricApplied = document.getElementById('metric-applied');
    if (metricApplied) metricApplied.innerText = applied.length;
    const appliedBadge = document.getElementById('applied-count-badge');
    if (appliedBadge) appliedBadge.innerText = `${applied.length} applications`;
    const aBadge = document.getElementById('tab-count-applied-badge');
    if (aBadge) aBadge.innerText = applied.length;
    const sideApplied = document.getElementById('side-count-applied');
    if (sideApplied) sideApplied.innerText = applied.length;
    const sideAppliedMetric = document.getElementById('side-metric-applied');
    if (sideAppliedMetric) sideAppliedMetric.innerText = applied.length;
    if (activeTab === 'applied') {
      const mobHeaderCount = document.getElementById('mobile-active-section-count');
      if (mobHeaderCount) mobHeaderCount.innerText = applied.length;
    }

    // Filter by stage if not 'all'
    if (currentAppliedFilter && currentAppliedFilter !== 'all') {
      applied = applied.filter(a => {
        const s = (a.status || 'applied').toLowerCase();
        return s === currentAppliedFilter.toLowerCase() || s.startsWith(currentAppliedFilter.toLowerCase());
      });
    }

    if (applied.length === 0) {
      container.innerHTML = `
        <div class="text-center py-16 text-slate-400 glass-card rounded-2xl border border-white/[0.07]">
          <svg class="w-12 h-12 mx-auto text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          <p class="font-semibold text-slate-300">No applications in "${currentAppliedFilter}" stage</p>
          <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">When you click "Apply & Tailor PDF" on any qualified job, the generated zero-fabrication ATS PDF resume and tailored cover letter will be archived here.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = applied.map(app => {
      const appliedDate = app.applied_at ? new Date(app.applied_at).toLocaleDateString() : 'Recent';
      const pdfFilename = app.pdf_filename;
      const pdfDownloadUrl = pdfFilename ? `/api/resume/download/${encodeURIComponent(pdfFilename)}` : null;
      const jobUrl = app.job_url || app.redirect_url || '';
      const currentStatus = app.status || 'Applied';
      const notes = app.notes || '';

      // Stage Badge Color mapping
      let badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      if (/tailored|draft/i.test(currentStatus)) {
        badgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      } else if (/interview/i.test(currentStatus)) {
        badgeColor = 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      } else if (/offer/i.test(currentStatus)) {
        badgeColor = 'bg-teal-500/10 text-teal-300 border-teal-500/20';
      } else if (/reject|archived/i.test(currentStatus)) {
        badgeColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      }

      return `
        <div id="applied-card-${app.id}" class="glass-card glass-card-hover rounded-xl p-4 border border-white/[0.07] space-y-2.5 transition-all">
          <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3.5">
            <div class="space-y-1 flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <!-- Status Badge -->
                <span class="px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${badgeColor} border rounded-md font-mono">
                  ${escapeHtml(currentStatus === 'Tailored' ? 'Tailored (Ready to Submit)' : currentStatus)}
                </span>
                <span class="text-xs font-mono text-slate-300 tabular-nums">Match: <b>${app.match_score}/100</b></span>
                <span class="text-xs font-mono text-blue-400 tabular-nums">ATS Fit: <b>${app.ats_keyword_fit || 90}%</b></span>
                <span class="text-xs text-slate-500 tabular-nums font-mono">• ${appliedDate}</span>
              </div>
              <div>
                <h3 class="text-base font-bold text-white tracking-tight leading-snug">${escapeHtml(app.title)}</h3>
                <p class="text-xs font-medium text-slate-300 mt-0.5">${escapeHtml(app.company)} • ${escapeHtml(app.location || 'Remote')}</p>
              </div>
              ${app.tailored_summary ? `
                <div class="pitch-summary-card mt-2 p-2 sm:p-2.5 rounded-lg border space-y-1 transition-all">
                  <div class="flex items-center justify-between text-[10.5px] font-mono">
                    <span class="flex items-center gap-1.5 font-bold tracking-wider text-[#D9A441] uppercase text-[10px]">
                      <svg class="w-3 h-3 text-[#D9A441]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>Tailored Pitch & Executive Summary</span>
                    </span>
                    <span class="text-[9.5px] text-slate-400 font-sans hidden sm:inline">Role Alignment</span>
                  </div>
                  <p id="pitch-text-${app.id}" class="text-[11.5px] text-slate-300 leading-relaxed font-normal line-clamp-2 transition-all select-text">
                    "${escapeHtml(app.tailored_summary)}"
                  </p>
                  ${app.tailored_summary.length > 130 ? `
                    <div class="flex items-center justify-end pt-0.5">
                      <button type="button" onclick="togglePitchExpand('${app.id}')" id="pitch-btn-${app.id}" class="text-[10.5px] font-semibold text-[#D9A441] hover:text-[#E8BD65] flex items-center gap-1 cursor-pointer transition-colors focus:outline-none">
                        <span id="pitch-label-${app.id}">Read full pitch</span>
                        <svg id="pitch-icon-${app.id}" class="w-3 h-3 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    </div>
                  ` : ''}
                </div>
              ` : ''}
            </div>

            <!-- Multi-Row Structured Action Toolbar -->
            <div class="flex flex-col gap-2 shrink-0 w-full lg:w-auto items-stretch lg:items-end justify-center pt-1 lg:pt-0">
              <!-- Row 1: Lifecycle & Primary Application Access -->
              <div class="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-start sm:justify-end">
                <!-- LinkedIn-style Stage Selector -->
                <div class="flex items-center gap-1.5 bg-[#111317] px-2.5 py-1.5 rounded-md border border-[#2B3036] shrink-0">
                  <span class="text-[10px] uppercase font-bold text-[#9AA0A6] tracking-wider">Stage:</span>
                  <select onchange="updateApplicationStatus('${app.id}', this.value)" class="bg-transparent text-xs text-[#E8E6E1] font-semibold focus:outline-none cursor-pointer">
                    <option value="Applied" ${currentStatus === 'Applied' ? 'selected' : ''} class="bg-[#1C1F24] text-emerald-400">Applied (Submitted)</option>
                    <option value="Tailored" ${/tailored/i.test(currentStatus) ? 'selected' : ''} class="bg-[#1C1F24] text-amber-400">Tailored (Ready to Submit)</option>
                    <option value="Interviewing" ${/interview/i.test(currentStatus) ? 'selected' : ''} class="bg-[#1C1F24] text-purple-400">Interviewing</option>
                    <option value="Offer" ${/offer/i.test(currentStatus) ? 'selected' : ''} class="bg-[#1C1F24] text-teal-400">Offer Received 🎉</option>
                    <option value="Rejected" ${/reject/i.test(currentStatus) ? 'selected' : ''} class="bg-[#1C1F24] text-rose-400">Archived / Rejected</option>
                  </select>
                </div>

                <!-- External Posting Link or Search Job Google Fallback -->
                ${jobUrl ? `
                  <a href="${jobUrl}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1.5 rounded-md text-xs font-medium text-[#9AA0A6] hover:text-[#E8E6E1] bg-[#111317] hover:bg-[#242830] border border-[#2B3036] flex items-center gap-1.5 shrink-0 transition-colors" title="Open Original Posting">
                    <svg class="w-3.5 h-3.5 text-[#D9A441]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                    <span>Job Link</span>
                  </a>
                ` : `
                  <a href="https://www.google.com/search?q=${encodeURIComponent((app.title || '') + ' ' + (app.company || '') + ' job')}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1.5 rounded-md text-xs font-medium text-blue-400 hover:text-blue-300 bg-[#111317] hover:bg-[#242830] border border-blue-500/30 flex items-center gap-1.5 shrink-0 transition-colors" title="Find job posting on Google">
                    <svg class="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    <span>Search Job</span>
                  </a>
                `}

                <!-- Download PDF -->
                ${pdfDownloadUrl ? `
                  <a href="${pdfDownloadUrl}" target="_blank" download class="px-3 py-1.5 rounded-md text-xs font-semibold bg-[#D9A441] hover:bg-[#C59132] text-[#14161A] transition-all flex items-center gap-1 active:scale-95 shadow-xs cursor-pointer shrink-0">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    <span>PDF</span>
                  </a>
                ` : ''}
              </div>

              <!-- Row 2: Intelligence, Notes & Outreach Assets -->
              <div class="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-start sm:justify-end">
                <!-- Cover Letter Preview -->
                <button onclick="previewLetter(${JSON.stringify(escapeHtml(app.title))}, ${JSON.stringify(escapeHtml(app.company))}, ${JSON.stringify(app.cover_letter || '')})" class="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-[#242830] hover:bg-[#2B3036] text-[#E8E6E1] border border-[#2B3036] transition-all flex items-center gap-1 active:scale-95 cursor-pointer shrink-0" title="View & Copy Cover Letter">
                  <svg class="w-3.5 h-3.5 text-[#D9A441]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                  <span>Cover Letter</span>
                </button>

                <!-- Notes Toggle Button -->
                <button onclick="toggleCardNotes('${app.id}')" class="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-[#242830] hover:bg-[#2B3036] text-[#E8E6E1] border border-[#2B3036] flex items-center gap-1 active:scale-95 cursor-pointer shrink-0">
                  <svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  <span>Notes ${notes ? '●' : ''}</span>
                </button>

                <!-- Recruiter Finder Button -->
                <button onclick="toggleCardRecruiters('${app.id}', ${JSON.stringify(escapeHtml(app.company || ''))}, ${JSON.stringify(escapeHtml(app.location || ''))}, ${JSON.stringify(escapeHtml(app.title || ''))})" class="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-sky-950/40 hover:bg-sky-900/50 text-sky-300 hover:text-sky-200 border border-sky-500/30 transition-all flex items-center gap-1 active:scale-95 cursor-pointer shrink-0" title="Find Recruiters & Hiring Managers on LinkedIn">
                  <svg class="w-3.5 h-3.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                  <span>Find Recruiters</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Inline Notes Editor Drawer -->
          <div id="notes-drawer-${app.id}" class="hidden pt-3 border-t border-[#2B3036]/60">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-[11px] font-semibold text-[#9AA0A6] uppercase tracking-wider">Application & Interview Notes</span>
              <span class="text-[10px] text-slate-500 font-mono">Saved in SQLite</span>
            </div>
            <div class="flex gap-2">
              <textarea id="notes-input-${app.id}" rows="2" class="flex-1 px-3 py-1.5 rounded-md bg-[#111317] border border-[#2B3036] text-xs text-[#E8E6E1] placeholder:text-[#5F6B76] focus:border-[#D9A441] outline-none" placeholder="Add recruiter contact, screening date, questions asked, or referral notes...">${escapeHtml(notes)}</textarea>
              <button onclick="saveApplicationNotes('${app.id}')" class="px-3 py-1.5 rounded-md text-xs font-semibold bg-[#D9A441] hover:bg-[#C59132] text-[#14161A] shrink-0 self-end">Save Note</button>
            </div>
          </div>

          <!-- Inline Recruiter Intelligence Drawer -->
          <div id="recruiter-drawer-${app.id}" class="hidden pt-3 border-t border-[#2B3036]/60 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-sky-400"></span>
                <span class="text-[11px] font-semibold text-sky-300 uppercase tracking-wider">Recruiter & Hiring Intelligence — ${escapeHtml(app.company || '')}</span>
              </div>
              <span class="text-[10px] text-slate-400 font-mono">100% Free • Direct LinkedIn & Google X-Ray</span>
            </div>
            <div id="recruiter-content-${app.id}" class="p-3.5 rounded-xl bg-[#111317] border border-[#2B3036] text-xs text-[#9AA0A6]">
              <div class="flex items-center gap-2 text-slate-400">
                <svg class="w-4 h-4 animate-spin text-sky-400" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
                <span>Loading recruiter search links and drafting outreach message...</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('loadAppliedJobs error:', e);
  }
}

async function updateApplicationStatus(jobId, newStatus) {
  try {
    const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Status updated to "${newStatus}"`, 'success');
      await loadAppliedJobs();
    } else {
      showToast(data.error || 'Failed to update status', 'error');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  }
}

function toggleCardNotes(jobId) {
  const drawer = document.getElementById(`notes-drawer-${jobId}`);
  if (drawer) {
    drawer.classList.toggle('hidden');
  }
}

async function saveApplicationNotes(jobId) {
  const input = document.getElementById(`notes-input-${jobId}`);
  if (!input) return;
  const notes = input.value.trim();

  try {
    const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Note saved successfully', 'success');
      await loadAppliedJobs();
    } else {
      showToast(data.error || 'Failed to save note', 'error');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  }
}

function filterAppliedJobs(status) {
  currentAppliedFilter = status;
  // Update button highlights
  document.querySelectorAll('.btn-applied-filter').forEach(btn => {
    if (btn.dataset.filter === status) {
      btn.className = 'btn-applied-filter px-3 py-1 rounded-md text-xs font-semibold bg-[#D9A441] text-[#14161A] shadow-xs';
    } else {
      btn.className = 'btn-applied-filter px-3 py-1 rounded-md text-xs font-medium bg-[#1C1F24] text-[#9AA0A6] hover:text-[#E8E6E1] border border-[#2B3036]';
    }
  });
  loadAppliedJobs(status);
}

function togglePitchExpand(appId) {
  const textEl = document.getElementById(`pitch-text-${appId}`);
  const labelEl = document.getElementById(`pitch-label-${appId}`);
  const iconEl = document.getElementById(`pitch-icon-${appId}`);
  if (!textEl) return;
  const isClamped = textEl.classList.contains('line-clamp-2');
  if (isClamped) {
    textEl.classList.remove('line-clamp-2');
    if (labelEl) labelEl.textContent = 'Collapse pitch';
    if (iconEl) iconEl.classList.add('rotate-180');
  } else {
    textEl.classList.add('line-clamp-2');
    if (labelEl) labelEl.textContent = 'Read full pitch';
    if (iconEl) iconEl.classList.remove('rotate-180');
  }
}

// In-Card Recruiter Intelligence
const recruiterCardCache = {};

async function toggleCardRecruiters(appId, company, location, title) {
  const drawer = document.getElementById(`recruiter-drawer-${appId}`);
  if (!drawer) return;

  const isHidden = drawer.classList.contains('hidden');
  if (!isHidden) {
    drawer.classList.add('hidden');
    return;
  }

  drawer.classList.remove('hidden');

  const contentEl = document.getElementById(`recruiter-content-${appId}`);
  if (!contentEl) return;

  if (recruiterCardCache[appId]) {
    renderRecruiterContent(appId, recruiterCardCache[appId], company, title);
    return;
  }

  try {
    const res = await fetch(`/api/recruiters/search?company=${encodeURIComponent(company)}&city=${encodeURIComponent(location || '')}`);
    const data = await res.json();
    if (data.success) {
      recruiterCardCache[appId] = data;
      renderRecruiterContent(appId, data, company, title);
    } else {
      contentEl.innerHTML = `<p class="text-rose-400 text-xs">${escapeHtml(data.error || 'Failed to fetch recruiter info')}</p>`;
    }
  } catch (err) {
    contentEl.innerHTML = `<p class="text-rose-400 text-xs">Error connecting to recruiter service: ${escapeHtml(err.message)}</p>`;
  }
}

function renderRecruiterContent(appId, data, company, title) {
  const contentEl = document.getElementById(`recruiter-content-${appId}`);
  if (!contentEl) return;

  const roleText = title ? title : 'open';
  const customNote = data.draftLinkedInNote || `Hi there! I noticed your talent leadership at ${company} and recently applied for the ${roleText} position. My background aligns strongly with your team's mission. Would love to connect!`;

  contentEl.innerHTML = `
    <div class="space-y-3">
      <!-- Search Chips -->
      <div class="flex items-center gap-2 flex-wrap">
        <a href="${data.xRaySearchUrl}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 flex items-center gap-1.5 transition-all active:scale-95" title="Google X-Ray targeting technical recruiters & talent acquisition on LinkedIn">
          <svg class="w-3.5 h-3.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <span>Find Recruiters (Google X-Ray)</span>
        </a>
        <a href="${data.leadershipSearchUrl}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 flex items-center gap-1.5 transition-all active:scale-95" title="Google X-Ray targeting Engineering Managers & Department Heads">
          <svg class="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
          <span>Find Engineering Managers</span>
        </a>
        <a href="${data.linkedInSearchUrl}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#242830] hover:bg-[#2B3036] text-[#E8E6E1] border border-[#2B3036] flex items-center gap-1.5 transition-all active:scale-95" title="LinkedIn Direct People Search">
          <svg class="w-3.5 h-3.5 text-[#0A66C2]" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>
          <span>LinkedIn People</span>
        </a>
      </div>

      <!-- Pre-drafted Outreach Message Box -->
      <div class="space-y-1.5 pt-1">
        <div class="flex items-center justify-between text-[11px]">
          <span class="font-medium text-slate-300">Tailored LinkedIn Connection Note (${customNote.length}/300 chars):</span>
          <button onclick="copyRecruiterNote('${appId}')" class="px-2.5 py-1 rounded bg-[#D9A441] hover:bg-[#C59132] text-[#14161A] font-semibold text-[11px] flex items-center gap-1 active:scale-95 transition-all">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
            <span>Copy Note</span>
          </button>
        </div>
        <div id="recruiter-note-${appId}" class="p-2.5 rounded-lg bg-[#0D0F12] border border-[#2B3036] text-xs text-slate-200 leading-relaxed font-sans select-all font-mono text-[11px]">
          ${escapeHtml(customNote)}
        </div>
      </div>
    </div>
  `;
}

async function copyRecruiterNote(appId) {
  const noteEl = document.getElementById(`recruiter-note-${appId}`);
  if (!noteEl) return;
  const noteText = noteEl.textContent.trim();
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(noteText);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = noteText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    showToast('LinkedIn outreach note copied to clipboard!', 'success');
  } catch (err) {
    showToast('Failed to copy note: ' + err.message, 'error');
  }
}


