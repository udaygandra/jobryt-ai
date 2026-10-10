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

  const normalizedType = ['error', 'warning', 'info'].includes(type) ? type : 'success';

  let iconSvg = '';
  if (normalizedType === 'success') {
    iconSvg = '<svg class="toast-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>';
  } else if (normalizedType === 'error') {
    iconSvg = '<svg class="toast-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>';
  } else if (normalizedType === 'warning') {
    iconSvg = '<svg class="toast-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>';
  } else {
    iconSvg = '<svg class="toast-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>';
  }

  const toast = document.createElement('div');
  toast.className = `toast-notification toast-${normalizedType} transform transition-all duration-300 translate-y-2 opacity-0`;
  toast.innerHTML = `${iconSvg}<span class="toast-message">${escapeHtml(message)}</span>`;

  // Instant dismiss on user click
  toast.addEventListener('click', () => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 250);
  });

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    if (toast.parentElement) {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 250);
    }
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
  if (modalSub) modalSub.innerText = 'Tailored Cover Letter';
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
 * Action-Button Field Validation Engine
 * Validates fields only when user explicitly clicks an action button.
 * Non-intrusive: attaches one-time event listeners to clear error rings on first correction.
 */
function clearFieldError(el) {
  if (!el) return;
  el.classList.remove('border-rose-500', 'focus:border-rose-500', 'ring-1', 'ring-rose-500/40');
  const parent = el.closest('.form-group') || el.parentElement;
  if (parent) {
    const existingMsg = parent.querySelector('.field-validation-error-msg');
    if (existingMsg) existingMsg.remove();
  }
}

function showFieldError(el, message) {
  if (!el) return;
  el.classList.add('border-rose-500', 'focus:border-rose-500', 'ring-1', 'ring-rose-500/40');
  const parent = el.closest('.form-group') || el.parentElement;
  if (parent) {
    let existingMsg = parent.querySelector('.field-validation-error-msg');
    if (!existingMsg) {
      existingMsg = document.createElement('p');
      existingMsg.className = 'field-validation-error-msg text-[11px] text-rose-400 mt-1 font-medium flex items-center gap-1 transition-all';
      parent.appendChild(existingMsg);
    }
    existingMsg.innerHTML = `<svg class="w-3.5 h-3.5 shrink-0 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg><span>${escapeHtml(message)}</span>`;
  }

  const clearHandler = () => {
    clearFieldError(el);
    el.removeEventListener('input', clearHandler);
    el.removeEventListener('change', clearHandler);
  };
  el.addEventListener('input', clearHandler);
  el.addEventListener('change', clearHandler);
}

function validateFormFields(rules) {
  if (!Array.isArray(rules)) return true;
  let firstInvalidEl = null;
  let allValid = true;

  for (const rule of rules) {
    const el = typeof rule.field === 'string'
      ? (document.getElementById(rule.field) || document.querySelector(rule.field))
      : rule.field;

    let val = rule.getValue ? rule.getValue() : (el ? el.value : '');
    let isInvalid = false;
    let errorMsg = rule.message || 'This field is required.';

    if (rule.type === 'required') {
      if (typeof val === 'string' ? !val.trim() : !val) {
        isInvalid = true;
      }
    } else if (rule.type === 'email') {
      const emailStr = (val || '').trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailStr || !emailRegex.test(emailStr)) {
        isInvalid = true;
        errorMsg = rule.message || 'Please provide a valid email address.';
      }
    } else if (rule.type === 'list_min') {
      const list = Array.isArray(val) ? val : [];
      const min = rule.min || 1;
      if (list.length < min) {
        isInvalid = true;
        errorMsg = rule.message || `Please add at least ${min} item${min > 1 ? 's' : ''}.`;
      }
    } else if (rule.type === 'custom' && typeof rule.test === 'function') {
      if (!rule.test(val)) {
        isInvalid = true;
      }
    }

    if (isInvalid) {
      allValid = false;
      const targetEl = el || (rule.container ? document.querySelector(rule.container) : null);
      if (targetEl) {
        showFieldError(targetEl, errorMsg);
        if (!firstInvalidEl) firstInvalidEl = targetEl;
      }
    } else if (el) {
      clearFieldError(el);
    }
  }

  if (firstInvalidEl && typeof firstInvalidEl.scrollIntoView === 'function') {
    firstInvalidEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof firstInvalidEl.focus === 'function') {
      try { firstInvalidEl.focus(); } catch (_) {}
    }
  }

  return allValid;
}

if (typeof window !== 'undefined') {
  window.clearFieldError = clearFieldError;
  window.showFieldError = showFieldError;
  window.validateFormFields = validateFormFields;
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
