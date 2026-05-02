# Home Recommendation Trust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the homepage personalized recommendation card explain profile completeness and recommendation confidence so users understand why items appear.

**Architecture:** Keep the upgrade inside the existing server component `components/home-recommend-auto.tsx`. Add pure helper functions for profile completeness and confidence labeling, cover them with component unit tests, and reuse existing `scoreAndFilter` output without adding new database reads.

**Tech Stack:** Next.js App Router server component, React, TypeScript, Vitest.

---

### Task 1: Add Trust Helpers

**Files:**
- Modify: `components/home-recommend-auto.tsx`
- Modify: `__tests__/components/home-recommend-auto.test.tsx`

- [ ] Add `getProfileCompletionSummary(signals)` that returns completed count, total count, percent, and missing labels for age, region, occupation, income, household, and interests.
- [ ] Add `getRecommendationConfidenceLabel(signals)` that returns `매우 적합`, `적합`, or `확인 필요` based on how many meaningful match reasons exist.
- [ ] Add Vitest coverage for full, partial, and empty profile signals plus confidence thresholds.

### Task 2: Update Homepage Recommendation Card

**Files:**
- Modify: `components/home-recommend-auto.tsx`

- [ ] Render a compact profile-completeness strip below the card title.
- [ ] Render missing profile labels as chips when any are missing.
- [ ] Add a confidence label on each recommendation row next to existing reason chips.
- [ ] Keep existing links and server-side data flow unchanged.

### Task 3: Verify And Publish

**Files:**
- No new runtime files.

- [ ] Run `npm.cmd test -- __tests__/components/home-recommend-auto.test.tsx`.
- [ ] Run `npm.cmd run lint`.
- [ ] Run `npm.cmd run build`.
- [ ] Run `npm.cmd run ci` after build finishes.
- [ ] Commit and push to `origin/master`.
