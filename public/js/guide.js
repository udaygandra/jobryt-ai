/**
 * public/js/guide.js — Interactive Onboarding & Workflow Guide Controller
 *
 * Walks candidates through the end-to-end Jobryt workflow:
 *  1. Import Resume -> 2. Master Profile -> 3. Search Preferences ->
 *  4. Schedule Cron / Manual Scan -> 5. Opportunities Review -> 6. Application Tracking
 */

async function refreshWorkflowGuide() {
  const guideContainer = document.getElementById('workflow-guide-content');
  if (!guideContainer) return;

  try {
    const [statusRes, profileRes, settingsRes, schedRes] = await Promise.all([
      fetch('/api/status').then(r => r.json()).catch(() => ({})),
      fetch('/api/profile').then(r => r.json()).catch(() => ({})),
      fetch('/api/settings').then(r => r.json()).catch(() => ({})),
      fetch('/api/scheduler').then(r => r.json()).catch(() => ({}))
    ]);

    const candidate = statusRes.candidate || {};
    const counts = statusRes.counts || { seen: 0, pending: 0, applied: 0, rejected: 0 };
    const hasResume = Boolean(candidate.name && candidate.name !== 'Not Configured' && (candidate.experience_count > 0 || candidate.skills_count > 0));
    const targetTitles = candidate.target_titles || [];
    const locations = candidate.locations || [];
    const minScore = settingsRes.score_threshold || 60;
    const cronSchedule = schedRes.schedule || '0 9 * * *';
    const cronDesc = schedRes.description || 'Daily at 9:00 AM';
    const cronEnabled = schedRes.enabled !== false;

    // Update Step 1 Status
    const step1Badge = document.getElementById('guide-step1-status');
    const step1Desc = document.getElementById('guide-step1-desc');
    if (step1Badge) {
      if (hasResume) {
        step1Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        step1Badge.innerHTML = '✓ Resume Imported';
        if (step1Desc) step1Desc.innerText = `Active candidate: ${candidate.name} (${candidate.skills_count} skills, ${candidate.experience_count} roles).`;
      } else {
        step1Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20';
        step1Badge.innerHTML = '⚠ Needs Resume';
        if (step1Desc) step1Desc.innerText = 'Upload your PDF or paste resume text to automatically populate your baseline.';
      }
    }

    // Update Step 2 Status
    const step2Badge = document.getElementById('guide-step2-status');
    const step2Desc = document.getElementById('guide-step2-desc');
    if (step2Badge) {
      if (hasResume && candidate.skills_count > 0) {
        step2Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        step2Badge.innerHTML = '✓ Ground Truth Active';
        if (step2Desc) step2Desc.innerText = `Zero-fabrication baseline ready with ${candidate.skills_count} verifiable skills and timeline.`;
      } else {
        step2Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20';
        step2Badge.innerHTML = 'Pending Profile';
        if (step2Desc) step2Desc.innerText = 'Ensure your roles, bullet points, and skills are accurate.';
      }
    }

    // Update Step 3 Status
    const step3Badge = document.getElementById('guide-step3-status');
    const step3Desc = document.getElementById('guide-step3-desc');
    if (step3Badge) {
      if (targetTitles.length > 0) {
        step3Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        step3Badge.innerHTML = '✓ Rules Configured';
        if (step3Desc) step3Desc.innerText = `Targeting "${targetTitles.slice(0, 2).join(', ')}" in "${locations.slice(0, 2).join(', ')}" (${minScore}+ score).`;
      } else {
        step3Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20';
        step3Badge.innerHTML = '⚠ Needs Preferences';
      }
    }

    // Update Step 4 Status
    const step4Badge = document.getElementById('guide-step4-status');
    const step4Desc = document.getElementById('guide-step4-desc');
    if (step4Badge) {
      if (cronEnabled) {
        step4Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        step4Badge.innerHTML = '✓ Cron Active';
        if (step4Desc) step4Desc.innerText = `Automated scan runs ${cronDesc} (${cronSchedule}) across 6+ multi-board aggregators.`;
      } else {
        step4Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20';
        step4Badge.innerHTML = 'Cron Paused';
        if (step4Desc) step4Desc.innerText = 'Scheduler is paused. You can trigger scans manually or re-enable the cron.';
      }
    }

    // Update Step 5 Status
    const step5Badge = document.getElementById('guide-step5-status');
    const step5Desc = document.getElementById('guide-step5-desc');
    if (step5Badge) {
      step5Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20';
      step5Badge.innerHTML = `${counts.pending} In Discovery Queue`;
      if (step5Desc) step5Desc.innerText = `${counts.pending} pre-scored opportunities waiting for review, 1-click ATS tailoring, and approval.`;
    }

    // Update Step 6 Status
    const step6Badge = document.getElementById('guide-step6-status');
    const step6Desc = document.getElementById('guide-step6-desc');
    if (step6Badge) {
      step6Badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20';
      step6Badge.innerHTML = `${counts.applied} Tracked Applications`;
      if (step6Desc) step6Desc.innerText = `Full LinkedIn-style stage manager tracking: Tailored ➔ Applied ➔ Interviewing ➔ Offer.`;
    }

  } catch (err) {
    console.error('refreshWorkflowGuide error:', err);
  }
}
