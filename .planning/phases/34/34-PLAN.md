# Phase 34: Light Mode Loader Contrast & Multi-Country Market Resume Ingestion Matrix — PLAN.md

## Phase Goal
Deliver a visually stunning, high-contrast resume upload loader popup in Light Mode (resolving dark-on-dark unreadable text and inverted white square icon) and implement a comprehensive multi-country resume testing matrix across 6 global markets (US, CA, DE, GB, SG, IN) to ensure resume parsing, settings auto-population, country board routing, and job ingestion filtering perform flawlessly end-to-end.

---

## Tracer Slice (End-to-End Flow First)

**Tracer Flow:**
1. Switch UI to Light Theme (`data-theme="light"`).
2. Upload a sample Resume (e.g., Canadian Data Analyst).
3. Verify Upload Loader Modal:
   - Overlay renders with soft backdrop blur (`rgba(15, 23, 42, 0.45)`).
   - Card displays pure crisp white (`#FFFFFF`) with dark legible typography (`#0F172A` / `#64748B`).
   - Jobryt logo badge renders with polished golden accents, not an unstyled white box.
   - Progress bar and pulsating status badges display with high contrast and smooth animation.
4. Parsing & Auto-Population:
   - Primary profession extracted as `target_titles[0]`.
   - Country scope detected as `CA`, locations set to Canadian city (e.g. `Toronto, ON`).
   - Settings auto-synced with `country_scope: "CA"`.
5. Board Ingestion Routing:
   - Ingestion dispatches Canada Job Bank, Adzuna (CA), and LinkedIn (CA).
   - Foreign government boards (USAJOBS, Bundesagentur für Arbeit) are cleanly bypassed.
   - Ingested jobs pass location and workplace eligibility checks.

---

## Tasks (Standard Granularity: 3 Tasks)

### Task 34.1: Light Theme Loader Popup Redesign & Contrast Polish
- **Action:**
  - Update `public/index.html` lines 2925-2984:
    - Add semantic CSS classes: `.resume-upload-modal-overlay`, `.resume-upload-modal-card`, `.resume-upload-engine-badge`, `.resume-upload-progress-track`.
    - Retain all accessibility attributes (`role="dialog"`, `aria-modal="true"`, `aria-label`).
  - Update `public/css/theme.css` and `public/css/components.css`:
    - Add `[data-theme="light"]` rules for `#resume-upload-blocking-overlay`:
      - Overlay background: `rgba(15, 23, 42, 0.45)` with `backdrop-filter: blur(8px)`.
      - Card container (`.resume-upload-modal-card`): `background: #FFFFFF !important`, `border-color: #E2E8F0 !important`, `box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15) !important`.
      - Ambient glow: soft warm gold `rgba(217, 164, 65, 0.1)`.
      - Logo badge: `#FFFBEB` background with `#D97706` border and `#D97706` icon.
      - "Jobryt" text: `#0F172A` font-extrabold.
      - "Engine" badge (`.resume-upload-engine-badge`): `#FEF3C7` background, `#B45309` text, `#FCD34D` border.
      - Subtitle: `#64748B`.
      - Progress track (`.resume-upload-progress-track`): `#F1F5F9` background, `#CBD5E1` border.
      - Progress bar: Gradient `from-[#D97706] via-[#F59E0B] to-[#D97706]`.
      - Status text (`#resume-upload-status-text`): `#0F172A` font-semibold.
      - Sub-status message: `#64748B`.
  - Update `tests/test-upload-blocking-loader.test.js`:
    - Assert that semantic classes exist in `public/index.html`.
    - Assert that `public/css/theme.css` contains the light mode override rules for `#resume-upload-blocking-overlay`.
- **Files Modified:**
  - `public/index.html`
  - `public/css/theme.css`
  - `public/css/components.css`
  - `tests/test-upload-blocking-loader.test.js`
- **Acceptance Criteria:**
  - In light theme, the popup card is bright white with crisp dark text, clear gold accents, and zero dark-on-dark contrast issues.
  - In dark theme, the popup card retains its sleek dark obsidian glass aesthetic.
  - Tests pass with zero regressions.
- **Verify Commands:**
  ```bash
  node tests/test-upload-blocking-loader.test.js
  ```

---

### Task 34.2: Multi-Country Resume Dataset & Parser Verification Suite
- **Action:**
  - Create a fixture generator or dataset `tests/fixtures/multi-country-resumes.json` covering 6 major markets:
    1. **US (United States)**: Senior Technical Product Manager (Seattle, WA)
    2. **CA (Canada)**: Senior Data Analyst / BI Developer (Toronto, ON)
    3. **DE (Germany)**: Cloud DevOps & SRE Engineer (Berlin, Germany)
    4. **GB (United Kingdom)**: Full Stack TypeScript / React Engineer (London, UK)
    5. **SG (Singapore)**: Solutions Architect / Data Platform Lead (Singapore)
    6. **IN (India)**: Senior Backend Java / Distributed Systems Engineer (Bangalore, Karnataka, India)
  - Verify parser behavior across both extraction engines:
    - Accurate country code resolution (`US`, `CA`, `DE`, `GB`, `SG`, `IN`).
    - Primary profession prioritized as `target_titles[0]`.
    - Target locations extracted and normalized.
    - Profession-aware skills filtering excludes irrelevant past roles.
  - Verify `syncProfileToSettings(parsedProfile)` automatically updates:
    - `country_scope` to matching country ISO code.
    - `target_roles` / `target_titles` up to 10 roles.
    - `target_locations` / `locations` up to 5 locations.
- **Files Modified:**
  - `tests/fixtures/multi-country-resumes.json`
  - `tests/test-multi-country-resumes-matrix.test.js`
- **Acceptance Criteria:**
  - All 6 market personas parse reliably with 100% correct country scope and primary profession.
  - `syncProfileToSettings` updates configuration cleanly for each country without corrupting baseline settings.
- **Verify Commands:**
  ```bash
  node tests/test-multi-country-resumes-matrix.test.js
  ```

---

### Task 34.3: End-to-End Market Board Ingestion & Country Routing Matrix
- **Action:**
  - Wire up end-to-end multi-market routing validation inside `tests/test-multi-country-resumes-matrix.test.js`:
    - For each country persona, dispatch `fetchAllJobs` with candidate's synced settings (`countryScope`, `targetTitles`, `targetLocations`).
    - Verify board selection rules:
      - **US Mode**: Dice, Adzuna (US), USAJOBS, LinkedIn enabled; Canada Job Bank, Arbeitsagentur, MyCareersFuture skipped.
      - **CA Mode**: Canada Job Bank, Adzuna (CA), LinkedIn enabled; USAJOBS, Arbeitsagentur skipped.
      - **DE Mode**: Arbeitsagentur, ArbeitNow, Adzuna (DE), LinkedIn enabled; USAJOBS, Canada Job Bank skipped.
      - **GB Mode**: Reed, Adzuna (GB), LinkedIn enabled; USAJOBS, Canada Job Bank skipped.
      - **SG Mode**: MyCareersFuture, Adzuna (SG), LinkedIn enabled.
      - **IN Mode**: Naukri, Adzuna (IN), LinkedIn enabled.
    - Verify location eligibility heuristics: `isJobLocationEligible` correctly validates native locations and remote jobs while filtering foreign mismatched listings.
    - Verify live job scoring and pipeline ingestion for sample job listings across each market.
  - Run full regression testing across all 23 test suites (`npm test`).
- **Files Modified:**
  - `tests/test-multi-country-resumes-matrix.test.js`
- **Acceptance Criteria:**
  - Board routing matrix accurately verifies country-specific board inclusion and exclusion.
  - Ingestion pipeline produces valid, deduplicated, and scoreable job items for each tested market.
  - Entire test suite (`npm test`) passes with 0 failures.
- **Verify Commands:**
  ```bash
  npm test
  ```

---

## Dimension 8: Nyquist Validation Requirements

### Validation Checklist (Must Pass Before Phase Complete)

| Validation | Method | Expected Result |
|------------|--------|-----------------|
| **Light Mode Loader Card Surface** | CSS verification in `theme.css` / DOM test | `#FFFFFF` background, `#E2E8F0` border |
| **Light Mode Loader Typography** | CSS verification in `theme.css` / DOM test | `#0F172A` title, `#64748B` subtext (no dark-on-dark) |
| **Light Mode Logo Badge** | CSS verification in `components.css` / `theme.css` | Golden amber accents `#D97706`, not unstyled white box |
| **US Resume Pipeline** | `test-multi-country-resumes-matrix.test.js` | Scope: US, Dice + USAJOBS routed, Canadian Job Bank skipped |
| **Canada Resume Pipeline** | `test-multi-country-resumes-matrix.test.js` | Scope: CA, Job Bank + Adzuna CA routed, USAJOBS skipped |
| **Germany Resume Pipeline** | `test-multi-country-resumes-matrix.test.js` | Scope: DE, Arbeitsagentur + ArbeitNow routed, USAJOBS skipped |
| **UK Resume Pipeline** | `test-multi-country-resumes-matrix.test.js` | Scope: GB, Reed + Adzuna GB routed |
| **Singapore Resume Pipeline** | `test-multi-country-resumes-matrix.test.js` | Scope: SG, MyCareersFuture routed |
| **India Resume Pipeline** | `test-multi-country-resumes-matrix.test.js` | Scope: IN, Naukri + Adzuna IN routed |
| **Full Regression Suite** | `npm test` | All 23 test files pass cleanly |

---

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| **CSS Leakage to Dark Mode** | Low | High | Restrict all light mode loader rules strictly under `[data-theme="light"]` selector |
| **Board Rate Limiting during Matrix Tests** | Medium | Medium | Use unit/mock integration checks for external live network queries where appropriate; leverage live feeds for open endpoints (ArbeitNow, Jobicy, Adzuna mock/live) |
| **Settings Overwrite side-effects** | Low | Medium | Multi-country tests restore original `master-profile.json` and `settings.json` in `after()` hook |
