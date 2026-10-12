/**
 * Jobryt AI - Main Application Bootstrap & Lifecycle
 * Zero-build, high-performance vanilla architecture with SWR Caching
 */

// Shared reactive state
var activeTab = 'feed';
var currentProfile = {};
var currentSettings = {};
var currentOpenDropdown = null;

// Application Initialization
async function init() {
  initTheme();

  // 1. Instant Optimistic Hydration from Local Storage (0ms render on reload)
  if (typeof hydrateFromCachedStatus === 'function') {
    hydrateFromCachedStatus();
  }
  if (typeof hydrateFromCachedJobs === 'function') {
    hydrateFromCachedJobs();
  }

  // Restore active tab from local storage (0ms flicker-free tab retention)
  if (typeof restoreActiveTab === 'function') {
    restoreActiveTab();
  }

  // 2. Parallel Network Bootstrap with Promise.allSettled
  try {
    await Promise.allSettled([
      typeof loadStatus === 'function' ? loadStatus() : Promise.resolve(),
      typeof loadProfile === 'function' ? loadProfile() : Promise.resolve(),
      typeof loadSettings === 'function' ? loadSettings() : Promise.resolve(),
      typeof loadPendingJobs === 'function' ? loadPendingJobs() : Promise.resolve(),
      typeof loadAppliedJobs === 'function' ? loadAppliedJobs() : Promise.resolve(),
      typeof loadTelegramStatus === 'function' ? loadTelegramStatus() : Promise.resolve()
    ]);
  } catch (err) {
    console.error('Bootstrap error:', err);
  }

  // 3. Post-hydration onboarding check
  if (typeof checkFirstTimeOnboarding === 'function') {
    checkFirstTimeOnboarding();
  }
}

window.addEventListener('DOMContentLoaded', init);
