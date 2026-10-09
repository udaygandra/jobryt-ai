# SPEC.md — Project Specification

> **Milestone**: `v1.1-Enhancements`
> **Status**: `FINALIZED`
>
> ⚠️ **Planning Lock**: FINALIZED — Plans can be generated for execution.

## Vision
JobRyt AI Milestone v1.1 introduces an enhanced visual analytics dashboard, custom RSS/ATS feed ingestion, specialist board adapters, and automated real-time alert dispatching.

## Goals
1. **Visual UI & Analytics Dashboard** — Interactive status charts, multi-country board selector pills, and responsive job filtering drawer.
2. **Specialist Board & RSS Adapters** — Extend job ingestion engine to support custom RSS/Atom feeds and direct company ATS links.
3. **Automated Real-Time Notifications** — High-match alert engine with Telegram bridge dispatch for top-scoring opportunities.

## Non-Goals (Out of Scope)
- Paid commercial Job board scrapers requiring CAPTCHA bypass or illegal web scraping.
- Multi-tenant cloud user authentication (retains secure desktop/self-hosted architecture).

## Constraints
- **UI Aesthetics**: Premium, dynamic design using modern typography (Inter/Outfit), HSL color palettes, subtle glassmorphism, and smooth micro-animations.
- **Backwards Compatibility**: All existing REST API contracts (`/api/*`) and database schema must remain 100% compatible.

## Success Criteria
- [ ] Visual UI dashboard renders cleanly across desktop & mobile browsers.
- [ ] Custom RSS/ATS feed parser ingests jobs with normalized schema.
- [ ] Automated high-match notification engine triggers on score >= threshold.
- [ ] Full integration suite (`npm test`) passes with 100% assertion rate.

---

*Last updated: 2026-10-08*
