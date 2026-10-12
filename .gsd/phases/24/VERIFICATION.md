# Phase 24 Verification: High-Throughput Fetch Pool, Per-API Builders & Scoring v2

## Phase Goal
Optimize the multi-board ingestion pipeline via bounded asynchronous concurrency, build pure per-API request builders respecting user settings without credential leaks, and establish Scoring Engine v2 with location as a hard gate and 4-pillar weighting (45% Skills, 30% Seniority, 10% Function, 15% Location).

## Verification Checklist

### 1. Bounded Asynchronous Fetch Pool (`fetch-pool.js`)
- [x] Implemented `runPool` with maximum concurrency of 12 and isolated worker failures.
- [x] Implemented `hostFetch` with per-domain rate limiting (LinkedIn: 2 concurrent + 150ms gap; Job Bank: 3; Adzuna: 4; Others: 4), 10s request timeouts, and 2 jittered retries on 429/5xx/network errors honoring `Retry-After`.
- [x] Parallelized cartesian (role x location x board) sweep tasks and page iterations (Adzuna pages 1-3, LinkedIn job details).
- [x] Wall-clock scan time dropped from **13.6s to 3.1s (~4.4x speedup)** for identical role and location scans.

### 2. Tailored Per-API Request Builders (`board-requests.js`)
- [x] Pure builders implemented for Adzuna, LinkedIn, Job Bank, Indeed, and USAJobs.
- [x] Builders send only user-configured parameters supported by each API (radius in miles, freshness codes, remote/onsite work types).
- [x] `classifyWorkMode` strictly prioritizes hybrid over remote keywords when physical location is present (e.g., "Hybrid in Vancouver" is classified as `hybrid`).
- [x] Redaction helper `redact(url)` masks API credentials in logs.
- [x] Role synonym expansion engine `title-synonyms.js` expands top target roles to up to 2 high-precision synonyms.

### 3. Scoring Engine v2 (`scoring-v2.js`)
- [x] 4-Pillar Scoring formula: `45% Skills + 30% Seniority + 10% Function + 15% Location (Gate)`.
- [x] `locationGate`: Non-remote out-of-commute positions fail gate, are capped at $\le 45\%$, and have `should_apply = false`.
- [x] Remote positions receive 100% location fit score across all candidate targets.
- [x] In-radius positions receive an 85–100% radial gradient score; location differences inside commute radius do not displace skills and seniority ranking.
- [x] 90% skills match baseline preserved for postings omitting explicit skill requirements.
- [x] Frontend opportunities view (`opportunities.js`) updated to display 4-pillar badge breakdown pills.

### 4. Automated Test Suite Proof
- [x] `tests/test-scoring-v2.test.js`: 11/11 tests pass across 10 diverse personas and ranking invariants.
- [x] `tests/test-board-requests.test.js`: 11/11 tests pass for builders, conversions, and work-mode classification.
- [x] `tests/test-payload-tuning-and-scoring.test.js`: 18/18 tests pass.
- [x] `tests/benchmark-25-roles.js`: 150/150 test cases pass with 100% accuracy.
- [x] Docker web container restarted and healthy on `http://localhost:3000`.
