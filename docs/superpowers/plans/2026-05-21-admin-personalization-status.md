# Admin Personalization Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin dashboard section that shows recommendation readiness and notification delivery status after the homepage and policy inbox personalization slices.

**Architecture:** Put status calculation and Supabase count queries in `lib/admin/personalization-status.ts`. Keep `/admin/page.tsx` as a Server Component with only allowed Next.js page exports. Render a small status section with links to existing admin diagnostic surfaces.

**Tech Stack:** Next.js App Router, Supabase admin client, TypeScript, Vitest.

---

## Task 1: Helper Test And Implementation

- [x] Add a failing Vitest test for the status summary.
- [x] Implement the summary builder and admin count query helper.
- [x] Run the helper test until it passes.

## Task 2: Admin Dashboard Wiring

- [x] Load personalization status in `/admin`.
- [x] Render a compact “추천·알림 상태” section under the 24h KPI cards.
- [x] Link cards to `/admin/recommendation-trace`, `/admin/alert-simulator`, and `/admin/alimtalk`.

## Task 3: Verification And Commit

- [x] Run targeted Vitest checks.
- [x] Run `npx tsc --noEmit --pretty false`.
- [x] Run `npm run lint`.
- [x] Run `npm run ci`.
- [x] Run `npm run build`.
- [x] Commit and push only this slice.

## Self-Review

- This slice is read-only and does not add DB writes or notification sending.
- It preserves unrelated dirty worktree files by staging explicit paths only.
- It avoids exporting extra helpers from route files.
