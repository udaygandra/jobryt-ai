# Phase 33: Resume-Parser-Driven Target Roles & Settings Auto-Population — PLAN.md

## Phase Goal
When user uploads resume, LLM extracts primary profession/title from resume header as highest-priority target role. Only includes past experience skills that match current profession or similar field. Auto-populates settings.json with target roles, country, and location from resume. Updates resume-parser.txt prompt to enforce this behavior.

---

## Tracer Slice (End-to-End Flow First)

**Tracer Flow:** Upload Resume → LLM Parse (with updated prompt) → filterSkillsByPrimaryProfession() → normalizeProfileFields() → syncProfileToSettings() → settings.json → Pipeline Search

**Tracer Test Case:** Upload a Software Engineer resume with past "Teaching Assistant" role. Verify:
1. `target_titles[0]` = "Software Engineer" (from header)
2. `skills` excludes "lesson planning", "classroom management"
3. `settings.json` populated with target_roles, target_locations, country_scope

---

## Tasks (Standard Granularity: 3 Tasks)

### Task 33.1: Update `prompts/resume-parser.txt` — Add Two CRITICAL RULES
- **Action:** Edit prompt file to add Rule A (Header Profession Priority) and Rule B (Profession-Aware Skill Filtering)
- **Files Modified:** `prompts/resume-parser.txt`
- **Acceptance Criteria:**
  - Rule A: "The FIRST job title appearing after the name/contact block IS the PRIMARY PROFESSION. It must appear as the FIRST element in `target_titles` array. All other discovered roles are secondary."
  - Rule B: "In `skills` and `skills_categorized`, ONLY include skills DIRECTLY RELEVANT to the primary profession. Exclude skills from unrelated past roles (e.g., 'teaching', 'retail management' for a software engineer). Group by category: `languages`, `frameworks`, `tools`, `domains`."
  - JSON schema example in prompt shows `target_titles` with header role first
- **Verify Commands:**
  ```bash
  cat prompts/resume-parser.txt | grep -A 5 "CRITICAL RULES"
  # Should show both new rules
  ```

### Task 33.2: Add `filterSkillsByPrimaryProfession()` in `scripts/engine/resume-to-profile.js`
- **Action:** Implement post-process filter function and integrate into `normalizeProfileFields()` after `discoverMarketRoles()` call (~line 593)
- **Files Modified:** `scripts/engine/resume-to-profile.js`
- **Acceptance Criteria:**
  - New function `filterSkillsByPrimaryProfession(profile)` added after line ~943 (after `normalizeCategorizedSkills` call)
  - Extracts primary profession from `profile.target_titles[0]`
  - Derives profession keywords (split by space, normalize)
  - Filters `profile.skills` to only skills containing profession keywords OR in allowlist categories
  - Filters `profile.skills_categorized` items similarly
  - Preserves all original skills in `profile.all_skills` backup field
  - Returns filtered profile
  - Integration: Call `filterSkillsByPrimaryProfession(parsedProfile)` after `discoverMarketRoles()` at line ~593
- **Verify Commands:**
  ```bash
  node -e "const {parseResume} = require('./scripts/engine/resume-to-profile'); parseResume('./test-resume.pdf', {dryRun: true})" 2>&1 | head -50
  # Check skills output excludes unrelated past-role skills
  ```

### Task 33.3: Integration Test & Verification
- **Action:** Test end-to-end flow with sample resumes spanning different professions
- **Files Modified:** None (test only)
- **Acceptance Criteria:**
  - Software Engineer resume: `target_titles[0]` = "Software Engineer", skills filtered to tech only
  - Data Analyst resume: `target_titles[0]` = "Data Analyst", skills filtered to analytics
  - Teacher resume: `target_titles[0]` = "Teacher", skills filtered to education
  - Settings.json auto-populated with target_roles, target_locations, country_scope
  - Pipeline search reads from settings correctly
- **Verify Commands:**
  ```bash
  # Test LLM path
  node scripts/engine/resume-to-profile.js ./test-resumes/software-engineer.pdf --test
  cat data/profiles/test-profile.json | jq '.target_titles[0], .skills[]'
  
  # Test local fallback path
  node -e "const {extractResumeLocallyFromText} = require('./scripts/engine/local-resume-extractor'); const fs=require('fs'); const t=fs.readFileSync('./test-resumes/software-engineer.txt','utf8'); console.log(JSON.stringify(extractResumeLocallyFromText(t), null, 2))" | jq '.target_titles[0], .skills[]'
  
  # Verify settings sync
  cat data/config/settings.json | jq '.target_roles, .target_locations, .country_scope'
  ```

---

## Dimension 8: Nyquist Validation Requirements

### Validation Checklist (Must Pass Before Phase Complete)

| Validation | Method | Expected |
|------------|--------|----------|
| **Header title → target_titles[0]** | Unit test with known resume | First header role = first target_title |
| **Skill filtering excludes unrelated** | Unit test with mixed resume | "teaching", "retail" absent for SWE |
| **Skill filtering preserves relevant** | Unit test with tech resume | "React", "Node.js", "SQL" present |
| **All original skills preserved** | Check `all_skills` field exists | `profile.all_skills.length >= profile.skills.length` |
| **Settings auto-population works** | Integration test | `settings.target_roles` matches `profile.target_titles` |
| **Country/location extracted** | Integration test | `settings.country_scope` = ISO code from resume |
| **Local fallback also works** | Test with local-resume-extractor | Same behavior as LLM path |
| **No regression in discoverMarketRoles** | Existing tests pass | 4-10 titles still discovered |

---

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| **PII leakage in resume text** | Medium | High | Resume text never logged; temp file deleted after parse; no PII in settings.json |
| **Settings overwrite on bad parse** | Low | Medium | `syncProfileToSettings` validates country_code format; only updates if valid data |
| **Over-aggressive skill filtering** | Medium | Medium | Preserve `all_skills` backup; keyword allowlist per profession category |
| **LLM ignores prompt rules** | Medium | Low | Local fallback already prioritizes header; explicit JSON example in prompt |
| **Breaking existing profile consumers** | Low | High | Changes additive only; `skills_categorized` structure unchanged |

### Security Controls Implemented
1. **PII Handling:** Resume text processed in-memory; temp files deleted immediately; no resume content written to logs or settings.json
2. **Settings Integrity:** `syncProfileToSettings` validates `country_code` is 2-letter ISO; deduplicates locations; caps at 5 locations
3. **Data Preservation:** Original unfiltered skills stored in `profile.all_skills` for rollback/debugging

---

## Dependencies & Order

```
Task 33.1 (Prompt Update) 
    │
    ├─→ Task 33.2 (Filter Function) 
    │       │
    │       └─→ Task 33.3 (Integration Test)
    │
    └─→ Task 33.3 (Integration Test - local path)
```

- Task 33.1 and 33.2 can run in parallel (independent files)
- Task 33.3 requires both 33.1 and 33.2 complete

---

## Effort Estimate

| Task | Estimate |
|------|----------|
| 33.1 Prompt Update | 30 min |
| 33.2 Filter Function + Integration | 1.5 hours |
| 33.3 Testing | 1 hour |
| **Total** | **~3 hours** |

---

## Phase Completion Criteria

- [ ] `prompts/resume-parser.txt` contains both CRITICAL RULES with examples
- [ ] `filterSkillsByPrimaryProfession()` implemented and integrated
- [ ] All 8 Nyquist validations pass
- [ ] Settings.json auto-populated on resume upload (existing flow preserved)
- [ ] No regressions in existing test suite
- [ ] Tracer slice verified end-to-end