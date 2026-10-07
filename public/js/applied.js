/**
 * Jobryt AI - Applications Pipeline
 * Manages tailored ATS resumes, cover letters, and export links
 */

async function loadAppliedJobs() {
  const container = document.getElementById('applied-jobs-list');
  if (!container) return;
  try {
    const res = await fetch('/api/jobs/applied');
    const data = await res.json();
    const applied = data.jobs || [];

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

    if (applied.length === 0) {
      container.innerHTML = `
        <div class="text-center py-16 text-slate-400 glass-card rounded-2xl border border-white/[0.07]">
          <svg class="w-12 h-12 mx-auto text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          <p class="font-semibold text-slate-300">No applications generated yet</p>
          <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">When you click "Apply & Tailor PDF" on any qualified job, the generated zero-fabrication ATS PDF resume and tailored cover letter will be archived here.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = applied.map(app => {
      const appliedDate = app.applied_at ? new Date(app.applied_at).toLocaleDateString() : 'Recent';
      const pdfFilename = app.pdf_filename;
      const pdfDownloadUrl = pdfFilename ? `/api/resume/download/${encodeURIComponent(pdfFilename)}` : null;

      return `
        <div class="glass-card glass-card-hover rounded-2xl p-5 border border-white/[0.07] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 transition-all">
          <div class="space-y-2 flex-1 min-w-0">
            <div class="flex items-center gap-2.5 flex-wrap">
              <span class="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md font-mono">Applied</span>
              <span class="text-xs font-mono text-slate-300 tabular-nums">Score: <b>${app.match_score}/100</b></span>
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

          <div class="flex items-center gap-2 shrink-0 w-full lg:w-auto pt-2 lg:pt-0">
            <button onclick="previewLetter(${JSON.stringify(escapeHtml(app.title))}, ${JSON.stringify(escapeHtml(app.company))}, ${JSON.stringify(app.cover_letter || '')})" class="px-3.5 py-2 rounded-md text-xs font-semibold bg-[#242830] hover:bg-[#2B3036] text-[#E8E6E1] border border-[#2B3036] transition-all flex items-center gap-1.5 active:scale-[0.98]">
              <svg class="w-4 h-4 text-[#D9A441]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              <span>Cover Letter</span>
            </button>
            ${pdfDownloadUrl ? `
              <a href="${pdfDownloadUrl}" target="_blank" download class="px-4 py-2 rounded-md text-xs font-semibold bg-[#D9A441] hover:bg-[#C59132] text-[#14161A] transition-all flex items-center gap-1.5 active:scale-[0.98]">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                <span>Download PDF</span>
              </a>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('loadAppliedJobs error:', e);
  }
}
