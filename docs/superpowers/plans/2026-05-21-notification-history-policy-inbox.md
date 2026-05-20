# Notification History Policy Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/mypage/notifications/history` from a delivery log into a personal policy inbox that explains why each delivered policy reached the user.

**Architecture:** Keep DB-backed state changes out of this slice. Extract URL/filter/status/reason-scoring helpers into `lib/notifications/history-inbox.ts`, cover them with Vitest, then let the server page fetch linked welfare/loan policy rows for the visible delivery page and render reusable recommendation reason chips.

**Tech Stack:** Next.js App Router, React Server Components by default, Supabase server client, TypeScript, Vitest.

---

## File Structure

- Create `lib/notifications/history-inbox.ts`
  - Normalizes URL search params.
  - Builds stable pagination/filter URLs.
  - Groups visible `alert_deliveries` by supported policy table.
  - Scores linked policies against the current user profile.
- Add `__tests__/lib/notification-history-inbox.test.ts`
  - Covers filter normalization, URL building, delivery grouping, status metadata, and reason signals.
- Modify `app/mypage/notifications/history/page.tsx`
  - Rename the surface to a personal policy inbox.
  - Fetch linked welfare/loan rows for visible deliveries only.
  - Render status, channel/time, policy link, and recommendation reason chips.

## Task 1: Helper And Tests

- [x] Write failing helper tests for URL/filter normalization, grouping, and reason signals.
- [x] Implement `lib/notifications/history-inbox.ts`.
- [x] Run the helper test and confirm it passes.

## Task 2: Page Wiring

- [x] Replace inline page helper functions with shared imports.
- [x] Load the user personalization profile on the server page.
- [x] Fetch linked policy rows for visible notification deliveries.
- [x] Render “내 정책함” copy, clearer filters, policy cards, status badges, and recommendation reason chips.

## Task 3: Verification And Commit

- [x] Run targeted Vitest checks.
- [x] Run `npx tsc --noEmit --pretty false`.
- [x] Run `npm run lint`.
- [x] Run `npm run ci`.
- [x] Run `npm run build`.
- [x] Commit and push only the Slice 2 files.

## Self-Review

- This slice intentionally does not add read/save/hide state because that needs a DB design and migration.
- The page remains a Server Component and follows the Next.js async `searchParams` convention.
- Policy fetches are limited to the current page of deliveries, so the inbox does not create broad extra queries.
