# Phase 34: Light Mode Loader Contrast & Multi-Country Market Resume Ingestion Matrix — RESEARCH.md

## Research Objective
Address two critical requirements:
1. **Light Mode Loader Contrast**: Fix `#resume-upload-blocking-overlay` in `public/index.html` and `public/css/theme.css` so that in light mode, the resume upload popup displays with crisp, elegant high-contrast styling (white card, dark legible typography, vibrant gold progress bar, clear status messages) instead of inverted dark-on-dark text.
2. **Multi-Country Resume & Market Board Testing Strategy**: Formulate a comprehensive plan and test harness to validate resumes from different international markets (US, Canada, UK, Germany, Singapore, India) across resume parsing, settings auto-population, country board selection, and job ingestion filtering.

---

## 1. Light Mode Resume Upload Loader Analysis

### Existing Implementation
Located in [`public/index.html`](file:///c:/Users/udays/Documents/jobryt-ai/public/index.html#L2925-L2984):
- **Overlay**: `id="resume-upload-blocking-overlay"` with `bg-black/85 backdrop-blur-md`.
- **Card**: Inner container uses Tailwind `bg-[#14161A]/95 border border-[#2B3036]`.
- **Branding**:
  - Logo badge: `jobryt-logo-badge bg-[#1C1F24] border border-[#D9A441]/50`.
  - Title: `text-[#E8E6E1]` ("Jobryt").
  - Engine badge: `bg-[#242830] text-[#D9A441] border border-[#D9A441]/30`.
  - Subtitle: `text-[#9AA0A6]` ("Career Acceleration & Resume Parsing").
  - Progress track: `bg-[#111317] border border-[#2B3036]`.
  - Progress bar: `resume-parse-progress-bar bg-gradient-to-r from-[#D9A441] via-[#F4D068] to-[#D9A441]`.
  - Status text: `id="resume-upload-status-text"` with `text-[#E8E6E1]`.
  - Secondary status: `text-[#9AA0A6]`.

### The Inversion Bug in Light Mode
In [`public/css/theme.css`](file:///c:/Users/udays/Documents/jobryt-ai/public/css/theme.css):
- `[data-theme="light"] .text-[#E8E6E1]` overrides text to `#1F2328` (dark charcoal).
- `[data-theme="light"] .text-[#9AA0A6]` overrides text to `#57606A` (dark gray).
- `[data-theme="light"] .jobryt-logo-badge` overrides badge to `#FFFFFF` (white square).
- **CRITICAL GAP**: The card's class `bg-[#14161A]/95` is an opacity-modified class (`bg-[#14161A]\/95`) which does **NOT** match `theme.css`'s `.bg-[#14161A]` selector!
- The overlay `bg-black/85` also stays jet black in light mode.
- **Visual result**: In light mode, the user gets a pitch-black card with dark charcoal text (`#1F2328` on `#14161A`) and a solitary white square logo, making the entire popup completely unreadable.

### Solution Pattern
Add dedicated, semantic CSS classes for the resume loader modal:
- `.resume-upload-modal-overlay`
- `.resume-upload-modal-card`
- `.resume-upload-progress-track`
- `.resume-upload-engine-badge`

Define explicit light-mode rules in [`public/css/theme.css`](file:///c:/Users/udays/Documents/jobryt-ai/public/css/theme.css):
```css
[data-theme="light"] #resume-upload-blocking-overlay {
  background: rgba(15, 23, 42, 0.45) !important;
  backdrop-filter: blur(8px) !important;
}

[data-theme="light"] #resume-upload-blocking-overlay .resume-upload-modal-card {
  background: #FFFFFF !important;
  border-color: #E1E4E8 !important;
  box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05) !important;
}

[data-theme="light"] #resume-upload-blocking-overlay .resume-upload-engine-badge {
  background: #FFF8E7 !important;
  color: #B07D1E !important;
  border-color: rgba(217, 164, 65, 0.4) !important;
}

[data-theme="light"] #resume-upload-blocking-overlay .resume-upload-progress-track {
  background: #F0F2F5 !important;
  border-color: #D0D7DE !important;
}
```
This guarantees crisp, beautiful presentation in light mode while preserving the sleek dark aesthetic in dark mode.

---

## 2. Multi-Country Market Board Architecture & Testing Strategy

### Supported Markets & Boards
From [`scripts/core/country-boards-registry.js`](file:///c:/Users/udays/Documents/jobryt-ai/scripts/core/country-boards-registry.js):

| Market | Code | Core Boards | Official / Specialist Source | Free Open Feeds |
| :--- | :--- | :--- | :--- | :--- |
| **United States** | `US` | LinkedIn (US), Dice (Tech), Adzuna (US) | USAJOBS (Federal Gov REST API) | Global Remote (Jobicy, Himalayas, Remotive) |
| **Canada** | `CA` | LinkedIn (CA), Adzuna (CA), Indeed (CA) | Canada Job Bank (Gov HTML scraper) | TechCareers, Global Remote |
| **Germany** | `DE` | LinkedIn (DE), Adzuna (DE), StepStone | Bundesagentur für Arbeit (Official Gov REST API) | ArbeitNow (DACH & EU Tech ATS Direct) |
| **United Kingdom** | `GB` | LinkedIn (UK), Adzuna (UK/DWP), Indeed (UK) | Reed.co.uk (Market Leader Open API/RSS) | CWJobs (UK Tech), Global Remote |
| **Singapore** | `SG` | LinkedIn (SG), Indeed (SG) | MyCareersFuture (Workforce Singapore Gov API) | Global Remote |
| **India** | `IN` | LinkedIn (IN), Adzuna (IN) | Naukri.com (Market Leader Search Gateway) | Instahyre (Tech), Global Remote |
| **Australia / NZ** | `AU`/`NZ` | LinkedIn (AU), Indeed (AU), Adzuna (AU) | SEEK (Australia & NZ Market Leader API) | Global Remote |

### The End-to-End Pipeline Verification Loop
To guarantee everything works as expected when switching or uploading resumes for different markets:
1. **Resume Ingestion & Parsing**:
   - Contact location -> extracts city, state/province, and ISO country code.
   - Primary profession in resume header -> placed as `target_titles[0]`.
   - Relevant skills categorized, unrelated past skills filtered out.
2. **Settings Auto-Population**:
   - `syncProfileToSettings` updates `data/config/settings.json`:
     - `country_scope` set to the detected country (e.g. `US`, `CA`, `GB`, `DE`, `SG`, `IN`).
     - `target_roles` and `target_locations` populated.
     - `boards_enabled` updated to include the country's primary boards.
3. **Ingestion Engine Board Routing**:
   - `fetchAllJobs({ countryScope, targetTitles, targetLocations })`:
     - Dispatches only the relevant boards for that country.
     - Ignores boards inapplicable to that market (e.g. Canada Job Bank skipped in US/DE mode; USAJOBS skipped in CA/DE mode; Bundesagentur skipped in US mode).
     - Applies geo and workplace eligibility rules ([`isJobLocationEligible`](file:///c:/Users/udays/Documents/jobryt-ai/scripts/core/geo-helper.js#L342)) with country-aware heuristics.
4. **Scoring & Pipeline Matching**:
   - Evaluator scores jobs against the candidate's skills and experience.
   - Verified that score distributions are healthy (55%–95%) and jobs are queued for user review.

---

## 3. Resume Personas Test Matrix
We will formulate 6 distinct resume personas for automated testing:

1. **Marcus Vance (United States - US)**
   - Role: Senior Technical Product Manager
   - Location: Seattle, WA, USA
   - Primary Boards: LinkedIn, Dice, USAJOBS, Adzuna
2. **Sahana Rao D (Canada - CA)**
   - Role: Data Analyst / BI Developer
   - Location: Toronto, ON, Canada
   - Primary Boards: Canada Job Bank, LinkedIn, Adzuna
3. **Dr. Lukas Weber (Germany - DE)**
   - Role: Cloud DevOps & SRE Engineer
   - Location: Berlin, Germany
   - Primary Boards: Bundesagentur für Arbeit, ArbeitNow, LinkedIn
4. **Liam Smith (United Kingdom - GB)**
   - Role: Full Stack TypeScript / React Engineer
   - Location: London, UK
   - Primary Boards: Reed.co.uk, LinkedIn, Adzuna
5. **Mei Ling Tan (Singapore - SG)**
   - Role: Solutions Architect / Data Platform Lead
   - Location: Singapore
   - Primary Boards: MyCareersFuture (Gov SG), LinkedIn
6. **Rajesh Kumar (India - IN)**
   - Role: Senior Backend Java / Distributed Systems Engineer
   - Location: Bangalore, Karnataka, India
   - Primary Boards: Naukri.com, LinkedIn, Adzuna

---

## 4. Verification & Testing Deliverables
- **Unit & CSS Tests**: Validate `#resume-upload-blocking-overlay` elements and light theme contrast overrides.
- **Multi-Country Test Harness**: `tests/test-multi-country-resumes-matrix.test.js` validating the full cycle (Resume Parsing -> Settings Sync -> Board Dispatch -> Ingestion Yield & Filtering) across all 6 market personas.
- **Regression**: All existing 23 end-to-end tests and 16 core tests continue to pass with zero failures.
