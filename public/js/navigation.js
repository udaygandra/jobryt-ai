/**
 * Jobryt AI - Navigation & Mobile Drawer Controller
 * Handles tabs switching, dropdowns, and responsive drawer
 */

// ── Dropdown Navigation Controls (Desktop) ───────────
function toggleDropdown(group) {
  const groupEl = document.querySelector(`.nav-dropdown-group[data-group="${group}"]`);
  if (!groupEl) return;
  const isOpen = groupEl.classList.contains('is-open');
  closeAllDropdowns();
  if (!isOpen) {
    groupEl.classList.add('is-open');
    currentOpenDropdown = group;
    const btn = groupEl.querySelector('.nav-group-btn');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }
}

function closeAllDropdowns() {
  document.querySelectorAll('.nav-dropdown-group').forEach(el => {
    el.classList.remove('is-open');
    const btn = el.querySelector('.nav-group-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
  currentOpenDropdown = null;
}

// ── Mobile Side Navigation Drawer Controls ───────────
function openMobileDrawer() {
  closeAllDropdowns();
  const backdrop = document.getElementById('mobile-drawer-backdrop');
  const panel = document.getElementById('mobile-drawer-panel');
  const toggleBtn = document.getElementById('mobile-drawer-toggle');
  if (!panel || !backdrop) return;

  panel.classList.remove('-translate-x-full');
  panel.classList.add('translate-x-0');
  backdrop.classList.remove('opacity-0', 'pointer-events-none');
  backdrop.classList.add('opacity-100', 'pointer-events-auto');

  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}

function closeMobileDrawer() {
  const backdrop = document.getElementById('mobile-drawer-backdrop');
  const panel = document.getElementById('mobile-drawer-panel');
  const toggleBtn = document.getElementById('mobile-drawer-toggle');
  if (!panel || !backdrop) return;

  panel.classList.remove('translate-x-0');
  panel.classList.add('-translate-x-full');
  backdrop.classList.remove('opacity-100', 'pointer-events-auto');
  backdrop.classList.add('opacity-0', 'pointer-events-none');

  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

function toggleMobileDrawer() {
  const panel = document.getElementById('mobile-drawer-panel');
  if (panel && panel.classList.contains('translate-x-0')) {
    closeMobileDrawer();
  } else {
    openMobileDrawer();
  }
}

function selectSideTab(tab) {
  switchTab(tab);
  closeMobileDrawer();
}

function selectNavTab(tab) {
  closeAllDropdowns();
  switchTab(tab);
}

function switchTab(tab) {
  activeTab = tab;
  closeAllDropdowns();
  document.querySelectorAll('.tab-view').forEach(v => v.classList.add('hidden'));

  // 5-Pillar category association map
  const catMap = {
    guide: 'guide',
    feed: 'opportunities',
    custom: 'opportunities',
    recruiters: 'opportunities',
    applied: 'applications',
    profile: 'dossier',
    config: 'settings'
  };
  const activeCat = catMap[tab] || 'opportunities';

  // Update desktop parent category buttons
  document.querySelectorAll('.nav-group-btn').forEach(b => {
    b.classList.remove('group-active');
  });
  const activeCatBtn = document.getElementById(`group-btn-${activeCat}`);
  if (activeCatBtn) {
    activeCatBtn.classList.add('group-active');
  }

  // Update desktop direct nav-tabs
  document.querySelectorAll('.nav-tab').forEach(b => {
    b.classList.remove('tab-active');
  });
  const activeDesktop = document.getElementById(`tab-${tab}`);
  if (activeDesktop) {
    activeDesktop.classList.add('tab-active');
    if (tab === 'profile' || tab === 'guide') {
      activeDesktop.classList.add('group-active');
    }
  }

  // Update dropdown item active highlight
  document.querySelectorAll('.nav-dropdown-item').forEach(b => {
    b.classList.remove('item-active');
  });
  const activeDropdownItem = document.getElementById(`tab-${tab}`) || document.getElementById(`subtab-${tab}`);
  if (activeDropdownItem) {
    activeDropdownItem.classList.add('item-active');
  }

  // Update mobile side menu items
  document.querySelectorAll('.side-nav-item').forEach(b => {
    b.classList.remove('side-active');
  });
  const activeSide = document.getElementById(`side-tab-${tab}`);
  if (activeSide) {
    activeSide.classList.add('side-active');
  }

  // Update mobile top bar chip
  const sectionLabels = {
    guide: 'Getting Started Guide',
    feed: 'Find Jobs · Job Matches',
    custom: 'Find Jobs · Tailor Any Job',
    recruiters: 'Find Jobs · Find Recruiters',
    applied: 'My Applications',
    profile: 'My Resume & Profile',
    config: 'Job Search Settings'
  };
  const mobHeaderName = document.getElementById('mobile-active-section-name');
  if (mobHeaderName) {
    mobHeaderName.innerText = sectionLabels[tab] || 'Getting Started';
  }

  // Update mobile count indicator based on view
  const mobHeaderCount = document.getElementById('mobile-active-section-count');
  if (mobHeaderCount) {
    const pendingCount = document.getElementById('tab-count-pending')?.innerText || '0';
    const appliedCount = document.getElementById('tab-count-applied')?.innerText || '0';
    if (tab === 'applied') {
      mobHeaderCount.innerText = appliedCount;
      mobHeaderCount.className = 'font-mono text-[10px] text-[#5FA8A0] font-bold';
    } else if (tab === 'feed') {
      mobHeaderCount.innerText = pendingCount;
      mobHeaderCount.className = 'font-mono text-[10px] text-[#D9A441] font-bold';
    } else if (tab === 'guide') {
      mobHeaderCount.innerText = '6 Steps';
      mobHeaderCount.className = 'font-mono text-[10px] text-amber-400 font-bold';
    } else {
      mobHeaderCount.innerText = '·';
      mobHeaderCount.className = 'font-mono text-[10px] text-[#9AA0A6] font-bold';
    }
  }

  const targetView = document.getElementById(`view-${tab}`);
  if (targetView) targetView.classList.remove('hidden');

  if (tab === 'guide' && typeof refreshWorkflowGuide === 'function') refreshWorkflowGuide();
  if (tab === 'feed') loadPendingJobs();
  if (tab === 'applied') loadAppliedJobs();
  if (tab === 'config') loadSettings();
}

// Global Event Listeners for Navigation
document.addEventListener('click', (e) => {
  if (!e.target.closest('.nav-dropdown-group')) {
    closeAllDropdowns();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllDropdowns();
    closeMobileDrawer();
  }
});

const desktopMedia = window.matchMedia('(min-width: 768px)');
desktopMedia.addEventListener('change', (e) => {
  if (e.matches) {
    closeMobileDrawer();
    closeAllDropdowns();
  }
});
