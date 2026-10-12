/**
 * Jobryt AI - Custom Job Tailor
 * Evaluates individual job links/JDs with LLM alignment
 */

async function evaluateCustomJob() {
  if (typeof validateFormFields === 'function') {
    const isValid = validateFormFields([
      { field: 'cust-title', type: 'required', message: 'Job title is required.' },
      { field: 'cust-desc', type: 'required', message: 'Job description text is required.' }
    ]);
    if (!isValid) {
      showToast('Please enter both Job Title and Job Description.', 'error');
      return;
    }
  }

  const title = document.getElementById('cust-title')?.value.trim();
  const company = document.getElementById('cust-company')?.value.trim();
  const location = document.getElementById('cust-location')?.value.trim();
  const url = document.getElementById('cust-url')?.value.trim();
  const description = document.getElementById('cust-desc')?.value.trim();

  const resBox = document.getElementById('cust-result-box');
  if (resBox) {
    resBox.innerHTML = `
      <div class="py-8 flex flex-col items-center">
        <svg class="w-8 h-8 text-blue-500 animate-spin mb-3" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
        <p class="text-sm font-semibold text-white">Analyzing Job Requirements with Gemini...</p>
        <p class="text-xs text-slate-400 mt-1">Comparing seniority, required tools, and duties with your verified profile...</p>
      </div>
    `;
  }

  try {
    const res = await fetch('/api/pipeline/evaluate-custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, company, location, url, description })
    });
    const data = await res.json();
    if (data.success && data.evaluatedJob && resBox) {
      const job = data.evaluatedJob;
      const score = job.score || 80;
      const isHighMatch = score >= 85;
      const scoreColor = isHighMatch
        ? 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10'
        : (score >= 75 ? 'text-[#5FA8A0] border-[#5FA8A0]/25 bg-[#5FA8A0]/10' : 'text-[#D9A441] border-[#D9A441]/25 bg-[#D9A441]/10');
      const companyInitial = (job.company || 'J').trim().charAt(0).toUpperCase();
      const jdSummary = formatJobDescriptionSummary(job.description);
      const jdFullHtml = formatFullJobDescription(job.description);
      const hasFullJd = Boolean(job.description && job.description.trim().length > 50);
      const resumeInsight = job.why_this_fits || job.reasoning || 'Evaluated against candidate profile';
      const matchedSkills = (job.key_matched_skills || []).slice(0, 8);

      resBox.className = "app-card rounded-xl p-5 sm:p-6 border border-[#2B3036] bg-[#16191E] text-left flex flex-col gap-4";
      resBox.innerHTML = `
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-3.5 min-w-0 flex-1">
            <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-[#242830] to-[#1A1D23] border border-[#2B3036] text-[#D9A441] font-bold text-base flex items-center justify-center shrink-0 shadow-xs select-none">
              ${escapeHtml(companyInitial)}
            </div>
            <div class="min-w-0 flex-1">
              <h3 class="text-base sm:text-lg font-bold text-[#E8E6E1] tracking-tight leading-snug">
                ${escapeHtml(job.title)}
              </h3>
              <div class="flex items-center gap-2 flex-wrap text-xs mt-1 text-[#9AA0A6]">
                <span class="font-semibold text-[#E8E6E1]">${escapeHtml(job.company)}</span>
                <span class="text-[#3D444D]" aria-hidden="true">•</span>
                <span class="inline-flex items-center gap-1 text-[#CBD5E1]">
                  <svg class="w-3.5 h-3.5 text-[#9AA0A6] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  <span>${escapeHtml(job.location || 'Remote / Hybrid')}</span>
                </span>
              </div>
            </div>
          </div>
          <div class="shrink-0">
            <div class="px-3 py-1 text-xs font-bold rounded-lg border ${scoreColor} font-mono tabular-nums flex items-center gap-1.5 shadow-xs">
              <span class="w-1.5 h-1.5 rounded-full ${isHighMatch ? 'bg-emerald-400' : 'bg-[#5FA8A0]'}"></span>
              <span>${score}% Match</span>
            </div>
          </div>
        </div>

        <div class="p-4 rounded-xl bg-[#111317] border border-[#2B3036] flex flex-col justify-between gap-3">
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-[#D9A441] font-semibold uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 text-[#D9A441]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                <span>Role Overview & Description</span>
              </span>
              <span class="text-[10px] text-[#5F6B76] font-mono">Custom Posting</span>
            </div>
            <p class="text-xs text-[#CBD5E1] leading-relaxed line-clamp-3">
              ${escapeHtml(jdSummary)}
            </p>
          </div>
          ${hasFullJd ? `
            <div class="pt-1">
              <button onclick="toggleJobDescription('custom-eval')" id="btn-toggle-jd-custom-eval" class="text-[11px] font-semibold text-[#D9A441] hover:text-[#F59E0B] inline-flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95">
                <span>Read full description</span>
                <svg id="icon-toggle-jd-custom-eval" class="w-3.5 h-3.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
              </button>
            </div>
          ` : ''}
        </div>

        <div id="jd-full-custom-eval" class="hidden p-4 rounded-lg bg-[#111317] border border-[#2B3036] text-xs text-[#CBD5E1] leading-relaxed max-h-96 overflow-y-auto">
          <div class="flex items-center justify-between pb-2 mb-3 border-b border-[#2B3036]">
            <h4 class="font-bold text-[#E8E6E1] text-xs uppercase tracking-wider">Full Job Specification & Requirements</h4>
            <button onclick="toggleJobDescription('custom-eval')" class="text-[11px] font-medium text-[#9AA0A6] hover:text-[#E8E6E1] cursor-pointer">Close ✕</button>
          </div>
          <div class="prose prose-invert max-w-none text-xs text-[#CBD5E1] leading-relaxed space-y-2">
            ${jdFullHtml}
          </div>
        </div>

        ${matchedSkills.length ? `
          <div class="pt-1 flex items-center gap-2 flex-wrap">
            <span class="text-[10px] text-[#9AA0A6] uppercase tracking-wider font-semibold shrink-0">Matched Skills:</span>
            ${matchedSkills.map(s => `
              <span class="px-2 py-0.5 text-[11px] font-mono rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                <svg class="w-3 h-3 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                <span>${escapeHtml(s)}</span>
              </span>
            `).join('')}
          </div>
        ` : ''}

        <div class="pt-2 border-t border-[#2B3036]/60 flex items-center gap-3">
          <button onclick='applyToCustomEvaluated(${JSON.stringify(job)})' class="w-full py-2.5 px-4 rounded-md text-xs font-semibold bg-[#D9A441] hover:bg-[#C59132] text-[#14161A] transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer shadow-xs">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <span>Generate Tailored ATS PDF Resume & Cover Letter</span>
          </button>
        </div>
      `;
      await loadStatus();
    } else if (resBox) {
      resBox.innerHTML = `<p class="text-rose-400 text-sm font-mono">Evaluation failed: ${data.error}</p>`;
    }
  } catch (e) {
    if (resBox) resBox.innerHTML = `<p class="text-rose-400 text-sm font-mono">Network error: ${e.message}</p>`;
  }
}

async function applyToCustomEvaluated(job) {
  try {
    const res = await fetch('/api/jobs/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Application & ATS PDF Resume generated successfully!');
      await loadStatus();
      await loadAppliedJobs();
      if (typeof showApplicationPrompt === 'function') {
        showApplicationPrompt(data.appliedJob);
      } else {
        switchTab('applied');
        previewLetter(data.appliedJob.title, data.appliedJob.company, data.appliedJob.cover_letter);
      }
    } else {
      showToast('Could not apply: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}
