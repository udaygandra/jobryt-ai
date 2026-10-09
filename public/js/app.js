/**
 * Jobryt AI - Main Application Bootstrap & Lifecycle
 * Zero-build, high-performance vanilla architecture
 */

// Shared reactive state
var activeTab = 'feed';
var currentProfile = {};
var currentSettings = {};
var currentOpenDropdown = null;

// Application Initialization
async function init() {
  initTheme();
  await loadStatus();
  await loadProfile();
  await loadSettings();
  await loadPendingJobs();
  await loadAppliedJobs();
  await loadTelegramStatus();
  checkFirstTimeOnboarding();
}

window.addEventListener('DOMContentLoaded', init);
