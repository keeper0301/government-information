# Press Ingest L2 Confirm Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert 광역 보도자료 L2 from direct auto INSERT into a safe LLM-classified confirm queue.

**Architecture:** Add `press_ingest_candidates` as a durable queue keyed by `news_id`. The cron classifies L1 candidates and upserts L2 results into the queue without publishing. The admin page renders queued L2 candidates first and uses server actions to confirm into `welfare_programs` or `loan_programs`, or reject.

**Tech Stack:** Next.js App Router server components/actions, Supabase Postgres, Vitest, existing Anthropic fetch classifier.

---

### Task 1: Schema

**Files:**
- Create: `supabase/migrations/069_press_ingest_candidates.sql`

- [ ] Add `public.press_ingest_candidates` with `news_id` unique, `status`, `program_type`, `classified_payload`, `skip_reason`, timestamps, and confirmed/rejected audit columns.
- [ ] Enable RLS with no public policies; service role only.

### Task 2: Queue Helpers

**Files:**
- Create: `lib/press-ingest/candidates.ts`
- Test: `__tests__/lib/press-ingest-candidates.test.ts`

- [ ] Write failing tests for mapping a `ClassifyResult` into a pending queue row and mapping pending candidates into welfare/loan insert payloads.
- [ ] Implement pure helpers plus DB helpers for upsert/list/confirm/reject.

### Task 3: Cron Classification

**Files:**
- Modify: `lib/press-ingest/ingest.ts`
- Modify: `app/api/cron/press-ingest/route.ts`

- [ ] Change cron from direct insert to `runAutoClassifyQueue`.
- [ ] Preserve cost caps and classify counters.
- [ ] Mark duplicates/skips in the queue instead of silently losing them.

### Task 4: Admin Confirm UI

**Files:**
- Create/Modify: `app/admin/press-ingest/actions.ts`
- Modify: `app/admin/press-ingest/page.tsx`

- [ ] Render L2 pending queue above L1 raw candidates.
- [ ] Add confirm/reject forms.
- [ ] Keep manual fallback links and one-off AI classification button for raw L1 candidates.

### Task 5: Verification

**Commands:**
- `npm.cmd run test -- __tests__/lib/press-ingest-candidates.test.ts`
- `npm.cmd run test -- __tests__/lib/press-ingest-candidates.test.ts __tests__/lib/collectors/bizinfo.test.ts`
- `npm.cmd run lint`
- `npm.cmd run build`

---

Self-review: scope is one subsystem, no direct user-visible program insert without confirm, and the existing manual fallback remains available.
