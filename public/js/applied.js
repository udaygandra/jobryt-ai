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
        <div id="applied-card-${app.id}" class="glass-card glass-card-hover rounded-2xl p-5 border border-white/[0.07] space-y-3 transition-all">
          <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div class="space-y-1.5 flex-1 min-w-0">
              <div class="flex items-center gap-2.5 flex-wrap">
                <!-- Status Badge -->
                <span class="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeColor} border rounded-md font-mono">
                  ${escapeHtml(currentStatus)}
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
                <p class="text-xs text-[#9AA0A6] line-clamp-1 italic bg-[#111317] p-2 rounded-md border border-[#2B3036]">"${escapeHtml(app.tailored_summary)}"</p>
              ` : ''}
            </div>

            <!-- Stage & Action Buttons -->
            <div class="flex items-center gap-2 shrink-0 w-full lg:w-auto pt-2 lg:pt-0 flex-wrap justify-end">
              <!-- LinkedIn-style Stage Selector -->
              <div class="flex items-center gap-1.5 bg-[#111317] px-2.5 py-1 rounded-md border border-[#2B3036]">
                <span class="text-[10px] uppercase font-bold text-[#9AA0A6] tracking-wider">Stage:</span>
                <select onchange="updateApplicationStatus('${app.id}', this.value)" class="bg-transparent text-xs text-[#E8E6E1] font-semibold focus:outline-none cursor-pointer">
                  <option value="Applied" ${currentStatus === 'Applied' ? 'selected' : ''} class="bg-[#1C1F24] text-emerald-400">Applied (Submitted)</option>
                  <option value="Tailored" ${/tailored/i.test(currentStatus) ? 'selected' : ''} class="bg-[#1C1F24] text-amber-400">Tailored (Ready to Submit)</option>
                  <option value="Interviewing" ${/interview/i.test(currentStatus) ? 'selected' : ''} class="bg-[#1C1F24] text-purple-400">Interviewing</option>
                  <option value="Offer" ${/offer/i.test(currentStatus) ? 'selected' : ''} class="bg-[#1C1F24] text-teal-400">Offer Received 🎉</option>
                  <option value="Rejected" ${/reject/i.test(currentStatus) ? 'selected' : ''} class="bg-[#1C1F24] text-rose-400">Archived / Rejected</option>
                </select>
              </div>

              <!-- Notes Toggle Button -->
              <button onclick="toggleCardNotes('${app.id}')" class="px-3 py-1.5 rounded-md text-xs font-semibold bg-[#242830] hover:bg-[#2B3036] text-[#E8E6E1] border border-[#2B3036] flex items-center gap-1 active:scale-95">
                <svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                <span>Notes ${notes ? '●' : ''}</span>
              </button>

              <!-- Cover Letter Preview -->
              <button onclick="previewLetter(${JSON.stringify(escapeHtml(app.title))}, ${JSON.stringify(escapeHtml(app.company))}, ${JSON.stringify(app.cover_letter || '')})" class="px-3 py-1.5 rounded-md text-xs font-semibold bg-[#242830] hover:bg-[#2B3036] text-[#E8E6E1] border border-[#2B3036] transition-all flex items-center gap-1 active:scale-95">
                <svg class="w-3.5 h-3.5 text-[#D9A441]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                <span>Cover Letter</span>
              </button>

              <!-- Download PDF -->
              ${pdfDownloadUrl ? `
                <a href="${pdfDownloadUrl}" target="_blank" download class="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-[#D9A441] hover:bg-[#C59132] text-[#14161A] transition-all flex items-center gap-1 active:scale-95 shadow-xs">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  <span>PDF</span>
                </a>
              ` : ''}

              <!-- External Posting Link -->
              ${jobUrl ? `
                <a href="${jobUrl}" target="_blank" rel="noopener noreferrer" class="p-1.5 rounded-md text-[#9AA0A6] hover:text-[#E8E6E1] hover:bg-[#242830] border border-transparent hover:border-[#2B3036]" title="Open Posting">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                </a>
              ` : ''}
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
