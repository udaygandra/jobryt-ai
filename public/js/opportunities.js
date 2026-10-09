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

async function loadPendingJobs() {
  const container = document.getElementById('pending-jobs-list');
  if (container) {
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
          <div class="w-16 h-6 rounded-full skeleton-box"></div>
        </div>
        <div class="flex gap-2">
          <div class="w-20 h-5 skeleton-box"></div>
          <div class="w-24 h-5 skeleton-box"></div>
        </div>
        <div class="w-full h-12 skeleton-box rounded-md"></div>
      </div>
      <div class="skeleton-card skeleton-shimmer space-y-3.5 mb-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg skeleton-box"></div>
            <div class="space-y-1.5">
              <div class="w-40 h-4 skeleton-box"></div>
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
      <div class="skeleton-card skeleton-shimmer space-y-3.5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg skeleton-box"></div>
            <div class="space-y-1.5">
              <div class="w-44 h-4 skeleton-box"></div>
              <div class="w-36 h-3 skeleton-box"></div>
            </div>
          </div>
          <div class="w-16 h-6 rounded-full skeleton-box"></div>
        </div>
        <div class="flex gap-2">
          <div class="w-24 h-5 skeleton-box"></div>
          <div class="w-16 h-5 skeleton-box"></div>
        </div>
        <div class="w-full h-12 skeleton-box rounded-md"></div>
      </div>
    `;
  }
  try {
    const res = await fetch('/api/jobs/pending');
    const data = await res.json();
    const jobs = data.jobs || [];
    
    const countPending = document.getElementById('tab-count-pending');
    if (countPending) countPending.innerText = jobs.length;
    const metricPending = document.getElementById('metric-pending');
    if (metricPending) metricPending.innerText = jobs.length;
    const pBadge = document.getElementById('tab-count-pending-badge');
    if (pBadge) pBadge.innerText = jobs.length;
    const feedChip = document.getElementById('feed-pending-chip');
    if (feedChip) feedChip.innerText = `${jobs.length} pending`;
    const sidePending = document.getElementById('side-count-pending');
    if (sidePending) sidePending.innerText = jobs.length;
    const sideQueueMetric = document.getElementById('side-metric-queue');
    if (sideQueueMetric) sideQueueMetric.innerText = jobs.length;
    if (activeTab === 'feed') {
      const mobHeaderCount = document.getElementById('mobile-active-section-count');
      if (mobHeaderCount) mobHeaderCount.innerText = jobs.length;
    }

    if (jobs.length === 0) {
      container.innerHTML = `
        <div class="text-center py-16 text-slate-400 glass-card rounded-2xl">
          <svg class="w-12 h-12 mx-auto text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
          <p class="font-medium text-slate-300">Approval queue is clear</p>
          <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">No pending jobs waiting. Click <b>"Run Scan"</b> to discover new postings or use <b>"Tailor Job"</b> to evaluate any link manually.</p>
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

            <!-- Match Score Badge Gauge -->
            <div class="shrink-0 flex flex-col items-end">
              <div class="px-3 py-1 text-xs font-bold rounded-lg border ${scoreBadgeClass} font-mono tabular-nums flex items-center gap-1.5 shadow-xs">
                <span class="w-1.5 h-1.5 rounded-full ${isHighMatch ? 'bg-emerald-400' : 'bg-[#5FA8A0]'}"></span>
                <span>${score}% Match</span>
              </div>
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
    console.error('loadPendingJobs error:', e);
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
    await loadStatus();
  } catch (e) {
    console.error('rejectJob error:', e);
  }
}

async function triggerPipelineScan() {
  const modal = document.getElementById('scan-modal');
  const logs = document.getElementById('scan-logs');
  if (modal) modal.classList.remove('hidden');
  if (logs) {
    logs.innerHTML = `
      <div class="text-blue-400">> Initializing Jobryt AI autonomous agent pipeline...</div>
      <div class="text-slate-400">> Fetching multi-board job feeds (Adzuna, Canada Job Bank, USAJobs, Remotive, LinkedIn)...</div>
    `;
  }

  try {
    const res = await fetch('/api/pipeline/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const data = await res.json();
    if (data.success && logs) {
      logs.innerHTML += `
        <div class="text-emerald-400">> Multi-board ingestion complete: ${data.stats.totalFetched} listings examined.</div>
        <div class="text-emerald-400">> Freshness & Geo filtering passed: ${data.stats.freshCount} jobs.</div>
        <div class="text-blue-300">> Deduplication check passed: ${data.stats.unseenCount} new listings.</div>
        <div class="text-purple-300">> LLM & Heuristic scoring: ${data.stats.scoredCount} evaluated.</div>
        <div class="text-emerald-400 font-bold">> Scan finished: ${data.stats.qualifiedCount} qualified opportunities added to approval queue!</div>
      `;
      const stepElem = document.getElementById('scan-modal-step');
      if (stepElem) stepElem.innerText = 'Scan Complete!';
      await loadStatus();
      await loadPendingJobs();
    } else if (logs) {
      logs.innerHTML += `<div class="text-rose-400">> Scan failed: ${data.error}</div>`;
    }
  } catch (e) {
    if (logs) logs.innerHTML += `<div class="text-rose-400">> Network error: ${e.message}</div>`;
  }
}
