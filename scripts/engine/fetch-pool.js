/**
 * fetch-pool.js — Bounded concurrency pool + per-host rate-limited fetch.
 *
 * runPool(tasks, { globalLimit })  → runs `{ board, run }` tasks with at most
 *   `globalLimit` in flight; failures are isolated (allSettled semantics).
 * hostFetch(url, opts)             → fetch with per-host concurrency cap,
 *   minimum gap between requests to the same host, timeout, and retry with
 *   jittered backoff on 429 / 5xx / network errors (honours Retry-After).
 */

const HOST_LIMITS = [
  { match: /linkedin\.com$/i, max: 3, gapMs: 100 },
  { match: /jobbank\.gc\.ca$/i, max: 4, gapMs: 0 },
  { match: /adzuna\.com$/i, max: 4, gapMs: 0 },
  { match: /dice\.com$/i, max: 2, gapMs: 200 },
  { match: /indeed\.com$/i, max: 1, gapMs: 1000 },
];
const DEFAULT_HOST = { max: 4, gapMs: 0 };

const hostState = new Map(); // host -> { active, queue, lastStart }

function limitsFor(host) {
  return HOST_LIMITS.find(l => l.match.test(host)) || DEFAULT_HOST;
}

function acquire(host) {
  const lim = limitsFor(host);
  let st = hostState.get(host);
  if (!st) { st = { active: 0, queue: [], lastStart: 0 }; hostState.set(host, st); }
  return new Promise(resolve => {
    const tryStart = () => {
      if (st.active >= lim.max) { st.queue.push(tryStart); return; }
      st.active++;
      const wait = Math.max(0, st.lastStart + lim.gapMs - Date.now());
      st.lastStart = Date.now() + wait;
      if (wait > 0) setTimeout(resolve, wait); else resolve();
    };
    tryStart();
  });
}

function release(host) {
  const st = hostState.get(host);
  if (!st) return;
  st.active--;
  const next = st.queue.shift();
  if (next) next();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const { getOptimalConcurrency } = require('./adaptive-concurrency');

async function hostFetch(url, opts = {}) {
  const { timeoutMs = 10000, retries = 2, keepalive = true, ...fetchOpts } = opts;
  let host = '';
  try { host = new URL(url).hostname; } catch (_) {}
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await acquire(host);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, { keepalive, ...fetchOpts, signal: ctrl.signal });
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
      release(host);
    }
    if (res) {
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === retries) return res;
      const ra = Number(res.headers.get('retry-after'));
      await sleep(ra > 0 ? Math.min(ra, 5) * 1000 : 400 * (attempt + 1) + Math.random() * 300);
    } else if (attempt < retries) {
      await sleep(300 * (attempt + 1) + Math.random() * 300);
    }
  }
  throw lastErr || new Error(`hostFetch failed: ${url}`);
}

async function runPool(tasks, { globalLimit, onError, onTaskResult, signal } = {}) {
  const limit = globalLimit || getOptimalConcurrency().networkConcurrency;
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (true) {
      if (signal && signal.aborted) return;
      const i = next++;
      if (i >= tasks.length) return;
      const t = tasks[i];
      const started = Date.now();
      try {
        const val = await t.run();
        const res = { status: 'fulfilled', value: val, ms: Date.now() - started };
        results[i] = res;
        if (typeof onTaskResult === 'function') {
          try { onTaskResult(t, res); } catch (_) {}
        }
      } catch (err) {
        const res = { status: 'rejected', reason: err, ms: Date.now() - started };
        results[i] = res;
        if (onError) onError(t, err);
        else console.error(`[Fetch] ${t.board || 'task'} failed: ${err && err.message}`);
        if (typeof onTaskResult === 'function') {
          try { onTaskResult(t, res); } catch (_) {}
        }
      }
    }
  }
  const n = Math.max(1, Math.min(limit, tasks.length));
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}

module.exports = { runPool, hostFetch };
