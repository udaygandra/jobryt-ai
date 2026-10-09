/**
 * Jobryt AI - Engine Status & Metric Aggregates with SWR Caching
 */

function applyStatusData(data) {
  if (!data) return;
  const pendingCount = data.counts?.pending ?? 0;
  const appliedCount = data.counts?.applied ?? 0;
  const seenCount = data.counts?.seen ?? 0;

  const elSeen = document.getElementById('metric-seen');
  const elPending = document.getElementById('metric-pending');
  const elApplied = document.getElementById('metric-applied');
  if (elSeen) elSeen.innerText = seenCount;
  if (elPending) elPending.innerText = pendingCount;
  if (elApplied) elApplied.innerText = appliedCount;

  // Update all pending badges & labels
  const tabPending = document.getElementById('tab-count-pending');
  if (tabPending) tabPending.innerText = pendingCount;
  const tabPendingBadge = document.getElementById('tab-count-pending-badge');
  if (tabPendingBadge) tabPendingBadge.innerText = pendingCount;
  const feedPendingChip = document.getElementById('feed-pending-chip');
  if (feedPendingChip) feedPendingChip.innerText = `${pendingCount} pending`;

  // Side drawer pending counts
  const sidePending = document.getElementById('side-count-pending');
  if (sidePending) sidePending.innerText = pendingCount;
  const sideQueueMetric = document.getElementById('side-metric-queue');
  if (sideQueueMetric) sideQueueMetric.innerText = pendingCount;

  // Update all applied badges & labels
  const tabApplied = document.getElementById('tab-count-applied');
  if (tabApplied) tabApplied.innerText = appliedCount;
  const tabAppliedBadge = document.getElementById('tab-count-applied-badge');
  if (tabAppliedBadge) tabAppliedBadge.innerText = appliedCount;
  const appliedBadgeElem = document.getElementById('applied-count-badge');
  if (appliedBadgeElem) appliedBadgeElem.innerText = `${appliedCount} applications`;

  // Side drawer applied counts
  const sideApplied = document.getElementById('side-count-applied');
  if (sideApplied) sideApplied.innerText = appliedCount;
  const sideAppliedMetric = document.getElementById('side-metric-applied');
  if (sideAppliedMetric) sideAppliedMetric.innerText = appliedCount;

  // Mobile header count
  const mobHeaderCount = document.getElementById('mobile-active-section-count');
  if (mobHeaderCount) {
    mobHeaderCount.innerText = (typeof activeTab !== 'undefined' && activeTab === 'applied') ? appliedCount : pendingCount;
  }

  const modelElem = document.getElementById('metric-model');
  if (modelElem) modelElem.innerText = data.llm?.model || 'gemini-3.8-flash';

  if (data.integrations?.bridgeRunning) {
    const badge = document.getElementById('tab-tg-status');
    if (badge) {
      badge.innerText = 'Online';
      badge.className = 'text-[10px] font-mono text-emerald-400 font-semibold px-1.5 py-0.2 rounded bg-emerald-500/10';
    }
    const sideTgBadge = document.getElementById('side-tg-status');
    if (sideTgBadge) {
      sideTgBadge.innerText = 'Online';
      sideTgBadge.className = 'text-[10px] font-mono text-emerald-400 font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10';
    }
  }
}

function hydrateFromCachedStatus() {
  try {
    const raw = localStorage.getItem('jobryt_cached_status');
    if (raw) {
      const cached = JSON.parse(raw);
      applyStatusData(cached);
    }
  } catch (_) {}
}

async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    applyStatusData(data);
    try {
      localStorage.setItem('jobryt_cached_status', JSON.stringify(data));
    } catch (_) {}
  } catch (e) {
    console.error('loadStatus error:', e);
  }
}

window.applyStatusData = applyStatusData;
window.hydrateFromCachedStatus = hydrateFromCachedStatus;
