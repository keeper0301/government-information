# Policy Inbox State Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the DB and helper foundation for read/save/hide state in the personal policy inbox.

**Architecture:** Add a new per-user `user_policy_inbox_items` table with RLS. Keep this slice to schema plus pure helpers; UI buttons and server actions can follow once the storage contract is committed and tested.

**Tech Stack:** Supabase Postgres, RLS, Next.js App Router, TypeScript, Vitest.

---

## Task 1: State Contract

- [x] Create a Supabase migration with `supabase migration new`.
- [x] Add failing tests for policy inbox state normalization, timestamp patches, and migration SQL.
- [x] Implement `lib/notifications/policy-inbox-state.ts`.

## Task 2: Migration

- [x] Fill the migration with `user_policy_inbox_items`.
- [x] Add indexes for user inbox sorting and saved-item lookup.
- [x] Enable RLS with own-row SELECT/INSERT/UPDATE/DELETE policies.
- [x] Grant authenticated CRUD access and keep anon without grants.

## Task 3: Verification And Commit

- [x] Run targeted tests.
- [x] Run `npx tsc --noEmit --pretty false`.
- [x] Run `npm run lint`.
- [x] Run `npm run ci`.
- [x] Run `npm run build`.
- [x] Commit and push only this slice.

## Self-Review

- This slice does not apply the migration to production.
- Existing unrelated dirty files stay untouched.
- The schema stores only lightweight user state, not duplicated policy bodies.
