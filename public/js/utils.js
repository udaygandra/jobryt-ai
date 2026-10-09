/**
 * Jobryt AI - Core Utilities & UI Helpers
 * Lightweight, zero-dependency helper functions
 */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('jobryt_theme', theme);
  } catch (_) { }
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
