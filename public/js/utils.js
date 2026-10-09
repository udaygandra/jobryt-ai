/**
 * Jobryt AI - Core Utilities & UI Helpers
 * Lightweight, zero-dependency helper functions
 */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('jobryt_theme', theme);
  } catch (_) { }
  if (typeof JobrytStore !== 'undefined') {
    JobrytStore.setState({ theme });
  }
  const sun = document.getElementById('theme-icon-sun');
  const moon = document.getElementById('theme-icon-moon');
  const toggleBtn = document.getElementById('theme-toggle');
  const sideThemeLabel = document.getElementById('side-theme-label');
  if (theme === 'light') {
    if (sun) sun.classList.add('hidden');
    if (moon) moon.classList.remove('hidden');
    if (toggleBtn) toggleBtn.setAttribute('title', 'Switch to Dark mode');
    if (sideThemeLabel) sideThemeLabel.innerText = 'Switch to Dark Mode';
  } else {
    if (sun) sun.classList.remove('hidden');
    if (moon) moon.classList.add('hidden');
    if (toggleBtn) toggleBtn.setAttribute('title', 'Switch to Light mode');
    if (sideThemeLabel) sideThemeLabel.innerText = 'Switch to Light Mode';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  showToast(next === 'light' ? 'Switched to Light theme' : 'Switched to Dark theme');
}

function initTheme() {
  let saved = 'dark';
  try {
    saved = localStorage.getItem('jobryt_theme') || 'dark';
  } catch (_) { }
  applyTheme(saved);
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const bg = type === 'error' ? 'bg-rose-950/95 border-rose-700 text-rose-100' : 'bg-slate-900/95 border-slate-700 text-slate-100 shadow-blue-500/10';
  toast.className = `px-4 py-3 rounded-xl border shadow-xl text-xs font-medium flex items-center gap-2 pointer-events-auto transition-all transform duration-300 translate-y-2 opacity-0 ${bg}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  const decoded = str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  return decoded.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function previewLetter(title, company, text) {
  const modalTitle = document.getElementById('letter-modal-title');
  const modalSub = document.getElementById('letter-modal-sub');
  const modalBody = document.getElementById('letter-modal-body');
  const modal = document.getElementById('letter-modal');
  if (modalTitle) modalTitle.innerText = `${title} @ ${company}`;
  if (modalSub) modalSub.innerText = 'Executive Zero-Fabrication Tailored Cover Letter';
  if (modalBody) modalBody.innerText = text || 'No letter content available.';
  if (modal) modal.classList.remove('hidden');
}

function copyCoverLetter() {
  const body = document.getElementById('letter-modal-body');
  if (!body) return;
  const text = body.innerText;
  navigator.clipboard.writeText(text);
  const btnText = document.getElementById('copy-btn-text');
  if (btnText) {
    btnText.innerText = 'Copied to Clipboard!';
    setTimeout(() => btnText.innerText = 'Copy Cover Letter', 2000);
  }
}

function formatJsonEditor() {
  try {
    const raw = document.getElementById('prof-json')?.value.trim();
    if (!raw) return;
    const parsed = JSON.parse(raw);
    document.getElementById('prof-json').value = JSON.stringify(parsed, null, 2);
    showToast('JSON formatted cleanly.');
  } catch (err) {
    showToast('Invalid JSON: ' + err.message, 'error');
  }
}

/**
 * Jobryt AI - Lightweight Micro-Reactive Observable State Store
 * Provides predictable state management, event-driven subscriptions,
 * zero-overhead unidirectional data flow, and instant DevTools inspection.
 */
class ObservableStore {
  constructor(initialState = {}) {
    this._state = {
      activeTab: 'feed',
      countryScope: 'AUTO',
      theme: 'dark',
      pendingJobs: [],
      appliedJobs: [],
      candidate: null,
      settings: null,
      ...initialState
    };
    this._listeners = new Set();
  }

  getState() {
    return { ...this._state };
  }

  setState(patch) {
    if (!patch || typeof patch !== 'object') return;
    const prevState = { ...this._state };
    this._state = { ...this._state, ...patch };

    // Automatic persistence for key state fields
    try {
      if ('theme' in patch && patch.theme) {
        localStorage.setItem('jobryt_theme', patch.theme);
      }
      if ('activeTab' in patch && patch.activeTab) {
        localStorage.setItem('jobryt_active_tab', patch.activeTab);
      }
      if ('pendingJobs' in patch && Array.isArray(patch.pendingJobs)) {
        if (patch.pendingJobs.length > 0) {
          localStorage.setItem('jobryt_cached_pending_jobs', JSON.stringify(patch.pendingJobs));
        } else {
          localStorage.removeItem('jobryt_cached_pending_jobs');
        }
      }
    } catch (_) {}

    // Notify subscribers
    for (const listener of this._listeners) {
      try {
        listener(this._state, prevState);
      } catch (err) {
        console.error('Store listener error:', err);
      }
    }
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
}

// Global Singleton Instance & DevTools Inspector
const JobrytStore = new ObservableStore();
if (typeof window !== 'undefined') {
  window.JobrytStore = JobrytStore;
  window.__JOBRYT_STORE__ = JobrytStore;
  try {
    Object.defineProperty(window, '__JOBRYT_STATE__', {
      get() { return JobrytStore.getState(); },
      configurable: true
    });
  } catch (_) {}
}
