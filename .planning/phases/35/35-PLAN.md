# Phase 35: Auto-Scalable High-Performance Streaming Pipeline, Non-Blocking IO & Memory-Safe Concurrency — PLAN.md

## Phase Goal
Transform the "Run Scan" pipeline from a slow monolithic batch job into an auto-scalable, streaming, high-performance engine that utilizes non-blocking I/O, persistent HTTP keep-alive connection pooling, smart task deduplication, lightweight data transfer objects (preventing RAM bloat), and progressive client hydration so users see qualified job matches within seconds without overloading memory.

---

## Tracer Slice (End-to-End Flow First)

**Tracer Flow:**
1. User clicks **"Run Scan"** in Opportunities view.
2. `POST /api/pipeline/run` initializes the **Adaptive Concurrency Controller**, detecting CPU cores and free memory.
3. Task Scheduler splits the 16 boards into:
   - **Global/Remote Feeds** (Jobicy, Himalayas, Remotive, ArbeitNow, etc.) -> Fetched **once per scan** in parallel.
   - **Targeted Gateways** (Adzuna, Dice, LinkedIn, Job Bank, etc.) -> Scoped specifically to unique `(role, location)` pairs with persistent HTTP keep-alive sockets.
4. As fast boards return jobs (within 1.5–3 seconds):
   - Jobs are converted to **Lightweight DTOs** (HTML stripped, description capped at 1,500 chars).
   - Fast deterministic Geo Gate and SQLite deduplication run.
   - Jobs are scored in non-blocking micro-batches (yielding to the event loop via `setImmediate`).
   - Qualified matches (`score >= threshold`) are immediately committed to SQLite `pending_jobs`.
5. Frontend UI progressively loads and renders new pending cards every 1.5–2 seconds, achieving **Time-to-First-Result (TTFR) < 3.5 seconds**.
6. The full sweep finishes up to 4x faster with peak heap memory strictly bounded under 120MB.

---

## Tasks (Standard Granularity: 3 Tasks)

### Task 35.1: Non-Blocking Network IO, HTTP Keep-Alive Agent & Smart Task Deduplication Engine
- **Action:**
  - Enhance `scripts/engine/fetch-pool.js`:
    - Add persistent `http.Agent` and `https.Agent` with `keepAlive: true`, `maxSockets: 32`, `maxFreeSockets: 10`, `keepAliveMsecs: 10000`, and `timeout: 8000`.
    - Route `hostFetch` requests through these persistent agents to eliminate SSL/TLS handshake churn.
    - Implement adaptive per-host queueing and jittered exponential backoff for 429 rate limits.
  - Refactor `scripts/engine/fetch-all-boards.js`:
    - Partition the 16 boards into:
      1. `GLOBAL_FEED_BOARDS`: Boards that provide global/country remote feeds independent of city (Jobicy, Himalayas, Remotive, ArbeitNow, Bayt, Vagas, Daijob). Dispatched **once per scan session**.
      2. `TARGETED_GATEWAY_BOARDS`: Location/role-specific boards (Adzuna, Dice, LinkedIn, Canada Job Bank, USAJOBS, Reed, Arbeitsagentur, MyCareersFuture, Seek, WTTJ). Dispatched per `(role, location)` pair.
    - Eliminates redundant requests (e.g. 5 roles × 3 locations no longer fetches Remotive 15 times).
    - Provide a streaming callback option `onBatchFetched(jobs)` so caller can consume jobs in real-time as individual boards finish.
- **Files Modified:**
  - `scripts/engine/fetch-pool.js`
  - `scripts/engine/fetch-all-boards.js`
- **Acceptance Criteria:**
  - Global feeds are fetched only once per scan sweep regardless of role/location count.
  - Total task count for multi-role search reduced by 60%–80%.
  - Network connections reuse persistent keep-alive sockets.
- **Verify Commands:**
  ```bash
  node -e "const { fetchAllJobs } = require('./scripts/engine/fetch-all-boards'); fetchAllJobs({ targetTitles: ['Software Engineer', 'Product Manager'], targetLocations: ['Seattle, WA', 'Remote'] }).then(j => console.log('Fetched jobs count:', j.length))"
  ```

---

### Task 35.2: Memory-Safe Streaming Ingestion, Lightweight DTOs & Adaptive Concurrency Controller
- **Action:**
  - Create `scripts/engine/adaptive-concurrency.js`:
    - Reads `os.cpus().length`, `os.freemem()`, and `process.memoryUsage().heapUsed`.
    - Dynamically computes optimal `networkConcurrency` (between 6 and 24) and `scoringConcurrency` (between 4 and 16).
    - Exposes `checkMemoryPressure()` guardrail that signals backpressure if heap usage exceeds 70% of limit or free RAM < 400MB.
  - Enhance `scripts/engine/node-logic.js` and `scripts/engine/scoring-v2.js`:
    - Add `toLightweightJobDTO(rawJob)`:
      - Strips HTML tags, inline CSS, script tags, and raw HTTP response headers.
      - Truncates descriptions to clean 1,500 characters.
      - Normalizes keys (`id`, `title`, `company`, `location`, `redirect_url`, `source`).
      - Reduces RAM footprint per job from ~120KB down to ~2KB.
    - Update `computeHeuristicScore` to yield event-loop execution periodically with `setImmediate` during batch processing.
  - Refactor `src/routes/pipeline.js`:
    - Hook into `onBatchFetched` to process incoming jobs in micro-batches (15–20 jobs).
    - Perform immediate deduplication against SQLite (`jobsDb.isJobSeen`).
    - Score and immediately persist qualified jobs to SQLite (`jobsDb.savePendingJob`) in real time rather than waiting for the entire scan to finish.
    - Release processed job batches from memory immediately to prevent heap ballooning.
- **Files Modified:**
  - `scripts/engine/adaptive-concurrency.js` (new)
  - `scripts/engine/node-logic.js`
  - `scripts/engine/scoring-v2.js`
  - `src/routes/pipeline.js`
- **Acceptance Criteria:**
  - Memory footprint remains strictly bounded under 120MB heap throughout large sweeps.
  - Event loop latency remains under 50ms (no blocking).
  - High-scoring jobs are committed to SQLite progressively during the scan.
- **Verify Commands:**
  ```bash
  node -e "const { getOptimalConcurrency } = require('./scripts/engine/adaptive-concurrency'); console.log(getOptimalConcurrency());"
  ```

---

### Task 35.3: Real-Time Progressive Hydration, Streaming Updates & Performance Benchmark Suite
- **Action:**
  - Update `src/routes/pipeline.js`:
    - Expose progressive status endpoint `GET /api/pipeline/status` with current real-time stats (`qualifiedCount`, `scoredCount`, `lastAddedJob`).
    - Add streaming SSE (Server-Sent Events) endpoint `GET /api/pipeline/stream` for clients desiring live push notifications of new qualified jobs.
  - Update `public/js/opportunities.js`:
    - During an active scan, poll `/api/jobs/pending` or listen to progressive updates every 2 seconds.
    - When new pending jobs appear during a running scan, dynamically insert them into the opportunity card deck with smooth entrance animation (`fade-in zoom-in`).
    - Update scan progress modal with live counts (e.g. "3 qualified opportunities discovered so far...").
  - Create comprehensive benchmark suite: `tests/benchmark-pipeline-performance.test.js`:
    - Benchmarks Time-to-First-Result (TTFR). Must be `< 3.5s`.
    - Benchmarks total execution duration for 4 roles × 2 locations sweep. Must be `< 15s`.
    - Asserts peak heap memory usage (`process.memoryUsage().heapUsed`) stays `< 120MB`.
    - Runs full regression suite (`npm test`).
- **Files Modified:**
  - `src/routes/pipeline.js`
  - `public/js/opportunities.js`
  - `tests/benchmark-pipeline-performance.test.js`
- **Acceptance Criteria:**
  - TTFR is under 3.5 seconds.
  - Opportunities deck hydrates progressively during active scan.
  - All existing 23 end-to-end tests and 16 core tests pass without regression.
- **Verify Commands:**
  ```bash
  node tests/benchmark-pipeline-performance.test.js
  npm test
  ```

---

## Dimension 8: Nyquist Validation Requirements

### Validation Checklist (Must Pass Before Phase Complete)

| Validation | Method | Target / Expected Result |
|------------|--------|--------------------------|
| **Task Count Reduction** | Unit inspection in `fetch-all-boards.js` | Global feeds executed only once per sweep (>= 60% task reduction) |
| **HTTP Socket Reuse** | Inspect agent socket pool in `fetch-pool.js` | Persistent sockets kept alive across requests |
| **Lightweight DTO Memory** | Unit test `toLightweightJobDTO` | Memory per job <= 2.5KB, raw HTML stripped, desc <= 1500 chars |
| **Adaptive Concurrency** | Unit test `adaptive-concurrency.js` | Auto-tunes worker pool based on CPU/RAM with memory guardrail |
| **Time-to-First-Result (TTFR)** | Benchmark script | First qualified job saved & available in `< 3.5s` |
| **Peak Heap RAM** | `benchmark-pipeline-performance.test.js` | `heapUsed < 120MB` during full scan |
| **Progressive UI Hydration** | E2E / browser simulation | Cards appear in deck while scan is still running |
| **Full Regression Suite** | `npm test` | All 23 test suites pass cleanly |

---

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| **Memory Leak from Unbounded Socket Pool** | Low | High | Set `maxSockets: 32` and `maxFreeSockets: 10` on persistent agent; close idle sockets after 10s |
| **Database Lock Contention in SQLite** | Medium | Medium | Use `node:sqlite` with `busy_timeout = 10000` and batch inserts for micro-batches |
| **Aggressive Polling Overload from UI** | Low | Low | Rate-limit client status polling to at most once per 1.5s; use SSE if supported |
| **API Rate Limiting from Fast Gateways** | Medium | Medium | Keep per-host rate limits and domain gap timeouts in `fetch-pool.js` |
