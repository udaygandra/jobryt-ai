# Phase 28 Verification: Decouple Profile From Search Settings & Uncapped High-Performance Concurrency

## Phase Goal
Decouple candidate profile from search preferences so "My Resume and Profile" contains only the candidate's single current role and single resident location, while auto-discovered roles route solely into Search Settings (`settings.json`). Ensure job scans execute solely against search preferences, remove artificial scoring and scraping limits, and implement concurrent scoring.

## Must-Haves Verification

### 1. Candidate Profile vs Search Preferences Decoupling
- [x] `#prof-current-role` and single resident location `#prof-location` render in "My Resume and Profile" UI.
- [x] `public/js/profile.js` populates and synchronizes single role and city; no comma-separated list in profile.
- [x] `POST /api/settings` saves to `data/config/settings.json` without mutating `master-profile.json`.
- [x] Resume upload routes discovered roles (4–10) solely into `settings.target_titles` and `settings.locations`, leaving `master-profile.json` with only the candidate's authentic current role and resident city.
- **Evidence:** `tests/test-profile-settings-decoupling.test.js` passed (5/5).

### 2. Pure Settings-Driven Pipeline Execution
- [x] `src/routes/pipeline.js` solely derives search roles and locations from `settings.json` (or `overrides`), only falling back to profile if settings are completely empty.
- [x] Geo-filtering, workplace eligibility, and candidate scoring strictly evaluate jobs against settings target roles and target locations.
- **Evidence:** `tests/test-pipeline-settings-source.test.js` passed (4/4).

### 3. Uncapped High-Performance Concurrent Ingestion and Scoring
- [x] Removed artificial `MAX_TO_SCORE` cap (was 30) from `src/routes/pipeline.js`.
- [x] Implemented concurrent scoring worker pool (`SCORING_CONCURRENCY = 8`) with 4500ms timeout guard per LLM request and automatic heuristic fallback.
- [x] Removed arbitrary slice limits in `fetch-all-boards.js` (`fetchArbeitnow`, `fetchNaukri`, `fetchDaijobJP`, `fetchVagasBR`).
- [x] Preserved rate limiting on sensitive external boards (LinkedIn 2 concurrency, 150ms delay).
- **Evidence:** `tests/test-uncapped-concurrent-scoring.test.js` passed (3/3).
- **Evidence:** Full test suite (`node --test tests/*.test.js`) passed 121/121 tests across 17 suites.
- **Evidence:** Role discovery benchmark (`node tests/benchmark-25-roles.js`) passed 150/150 test cases (100%).

## Verdict
**PASS**
Phase 28 meets all requirements with verified empirical evidence.
