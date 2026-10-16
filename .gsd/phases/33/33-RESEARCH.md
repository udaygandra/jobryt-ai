# Phase 33 Research: Resume-Parser-Driven Target Roles & Settings Auto-Population

## Executive Summary

The resume upload → parse → profile → settings → pipeline flow is **already fully implemented and working**. Only **two focused changes** are needed to meet the phase requirements.

---

## Current Architecture (Working End-to-End)

```
Resume Upload (src/routes/profile.js:93)
    │
    ▼
Text Extraction + Validation
    │
    ▼
LLM Parser (scripts/engine/resume-to-profile.js:686)
    │  ├─ Uses prompts/resume-parser.txt
    │  └─ Calls discoverMarketRoles() for 4-10 role suggestions
    │
    ▼
Local Fallback (scripts/engine/local-resume-extractor.js:98)
    │  ├─ Extracts header title FIRST (regex: name line → next line)
    │  └─ Also calls discoverMarketRoles()
    │
    ▼
Profile Object → settings-helper.js:515 syncProfileToSettings()
    │  ├─ target_roles (flat skills)
    │  ├─ target_titles (role titles)
    │  ├─ locations / target_locations
    │  └─ country_scope
    │
    ▼
data/settings.json (primary source for pipeline)
    │
    ▼
Pipeline Search (src/routes/pipeline.js:138) reads from settings
```

---

## Key Files & Functions

| File | Purpose | Key Line |
|------|---------|----------|
| `scripts/engine/resume-to-profile.js` | Main LLM parsing + market roles | `parseResumeToProfile()` (686), `discoverMarketRoles()` (1200+) |
| `prompts/resume-parser.txt` | LLM prompt for resume parsing | Entire file |
| `scripts/engine/local-resume-extractor.js` | Local fallback extractor | `extractHeaderTitle()` (98), `extractContactInfo()` (150) |
| `scripts/core/settings-helper.js` | Settings read/write + sync | `syncProfileToSettings()` (515) |
| `src/routes/profile.js` | Upload endpoint | `POST /api/profile/resume` (93) |
| `src/routes/pipeline.js` | Search endpoint | `GET /api/pipeline/scan` (138) |

---

## Gap Analysis

| Requirement | Status | Evidence |
|-------------|--------|----------|
| **Extract primary profession from resume header as highest-priority target role** | ❌ **Missing** | LLM prompt doesn't emphasize header priority; `discoverMarketRoles()` sorts by frequency, not header position |
| **Filter past experience skills by profession similarity** | ❌ **Missing** | All skills extracted verbatim into `skills`/`skills_categorized`; no profession-aware filtering |
| **Auto-populate settings.json on resume upload** | ✅ **Working** | `syncProfileToSettings()` called in `profile.js:145` after successful parse |
| **Extract country/location from resume header** | ✅ **Working** | Both LLM prompt (Rule 7) and local extractor (`extractContactInfo`) do this |

---

## Settings.json Structure (Relevant Fields)

```json
{
  "target_roles": ["Software Engineer", "Backend Developer"],
  "target_titles": ["Senior Software Engineer", "Full Stack Developer"],
  "locations": ["Austin, TX", "Remote"],
  "target_locations": ["Austin, TX", "Remote", "San Francisco, CA"],
  "country_scope": "US"
}
```

---

## Required Changes (Only 2)

### 1. Update `prompts/resume-parser.txt` — Add Two CRITICAL RULES

**Rule A — Header Profession Priority:**
> The FIRST job title appearing after the name/contact block IS the PRIMARY PROFESSION. It must appear as the FIRST element in `target_titles` array. All other discovered roles are secondary.

**Rule B — Profession-Aware Skill Filtering:**
> In `skills` and `skills_categorized`, ONLY include skills DIRECTLY RELEVANT to the primary profession. Exclude skills from unrelated past roles (e.g., "teaching", "retail management" for a software engineer). Group by category: `languages`, `frameworks`, `tools`, `domains`.

### 2. Add Post-Process Filter in `resume-to-profile.js` (~line 943)

After `discoverMarketRoles()` returns, before profile finalization:
```javascript
function filterSkillsByPrimaryProfession(profile) {
  const primary = profile.target_titles?.[0];
  if (!primary) return profile;
  const primaryKeywords = extractProfessionKeywords(primary);
  profile.skills = profile.skills?.filter(s => isRelevant(s, primaryKeywords));
  profile.skills_categorized = filterCategories(profile.skills_categorized, primaryKeywords);
  return profile;
}
```

---

## Risks / Blockers

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| LLM ignores "first in array" instruction | Medium | Add explicit JSON example in prompt; local fallback already prioritizes header |
| Skill filtering too aggressive | Medium | Use keyword overlap + category allowlist; preserve all skills in `all_skills` backup field |
| Breaking existing profile format | Low | Changes are additive; `skills_categorized` structure unchanged |

---

## Recommended Implementation Order

1. **Update `prompts/resume-parser.txt`** (prompt engineering only)
2. **Add `filterSkillsByPrimaryProfession()` in `resume-to-profile.js`** (pure JS, no LLM calls)
3. **Test with sample resumes** spanning different professions
4. **Verify settings.json auto-population still works** (existing `syncProfileToSettings` untouched)

---

## Effort Estimate

- **Prompt update**: 30 min
- **Filter function + integration**: 1.5 hours
- **Testing**: 1 hour
- **Total**: ~3 hours (single plan, no waves needed)

---

## Research Complete

✅ No new infrastructure needed — builds on existing working flow.
✅ Settings auto-population already implemented.
✅ Country/location extraction already implemented.
✅ Only prompt + post-process filter required.