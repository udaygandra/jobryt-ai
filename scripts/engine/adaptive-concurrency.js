/**
 * scripts/engine/adaptive-concurrency.js
 *
 * Auto-Scalable Concurrency & Memory Guardrail Engine
 * Dynamically computes optimal worker pool sizes and monitors RAM backpressure
 * to prevent V8 heap exhaustion and ensure non-blocking event loop execution.
 */

const os = require('os');
const v8 = require('v8');

/**
 * Returns dynamic concurrency parameters tuned to current host resources.
 */
function getOptimalConcurrency() {
  const cpuCount = Array.isArray(os.cpus()) && os.cpus().length > 0 ? os.cpus().length : 4;
  const freeMemMb = Math.round(os.freemem() / (1024 * 1024));
  const heapStats = v8.getHeapStatistics();
  const heapUsedMb = Math.round(heapStats.used_heap_size / (1024 * 1024));
  const heapLimitMb = Math.round(heapStats.heap_size_limit / (1024 * 1024));

  const heapRatio = heapUsedMb / Math.max(heapLimitMb, 1);
  const isHighMemoryPressure = heapRatio > 0.70 || freeMemMb < 350;

  let networkConcurrency = Math.min(24, Math.max(8, cpuCount * 3));
  let scoringConcurrency = Math.min(16, Math.max(4, cpuCount * 2));

  // Adaptive throttling under memory pressure
  if (isHighMemoryPressure) {
    networkConcurrency = Math.max(4, Math.floor(networkConcurrency / 2));
    scoringConcurrency = Math.max(2, Math.floor(scoringConcurrency / 2));
  }

  return {
    cpuCount,
    freeMemMb,
    heapUsedMb,
    heapLimitMb,
    heapRatio,
    isHighMemoryPressure,
    networkConcurrency,
    scoringConcurrency
  };
}

/**
 * Quick boolean check if memory pressure requires yielding or throttling.
 */
function isUnderMemoryPressure() {
  try {
    const freeMemMb = os.freemem() / (1024 * 1024);
    const heapStats = v8.getHeapStatistics();
    const heapUsedMb = heapStats.used_heap_size / (1024 * 1024);
    const heapLimitMb = heapStats.heap_size_limit / (1024 * 1024);
    return (heapUsedMb / heapLimitMb) > 0.72 || freeMemMb < 300;
  } catch (_) {
    return false;
  }
}

/**
 * Yields event loop execution for micro-task pacing.
 */
function yieldEventLoop() {
  return new Promise(resolve => setImmediate(resolve));
}

module.exports = {
  getOptimalConcurrency,
  isUnderMemoryPressure,
  yieldEventLoop
};
