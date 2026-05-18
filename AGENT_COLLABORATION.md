# Agent Collaboration Handoff

Last updated: 2026-05-17 KST

This repository may be edited by Codex and Claude at the same time. Follow this file to avoid conflicts and duplicated work.

## Shared Goal

Build keepioo into an autonomous operations system:

- site management and server health monitoring
- marketing automation for keepioo blog, Naver Blog, Instagram, WordPress, and SNS reuse
- trend-aware content quality improvement
- bug, cron, scraping, publishing, and security issue detection
- safe automatic fixes where low risk
- PR or human review for risky changes
- audit logs for every automated action

Do not interpret "100% automatic" as permission to run destructive operations without safeguards. Full automation must be tiered by risk.

## Current Operating Rules

- Use WSL for git commands, commits, and pushes.
- Do not stage broad dirty worktree changes. Stage only files you intentionally edited.
- `lib/admin-actions.ts` is currently dirty from another workstream. Do not edit or stage it unless you explicitly own that change.
- Existing dirty files across app, lib, docs, config, and migrations may belong to another agent. Work around them, do not revert them.
- Before committing, run at minimum targeted tests plus `npm run ci` when feasible.
- If WSL Node cannot run a tool because of Node version, use Windows Node from PowerShell for Vitest/CI.
- Keep commits small and named after the exact slice.

## Ownership Guidance

Codex recent slices:

- external blog publishing quality gate
- fail-closed inline quality review
- external channel learning hints
- blog publish automation audit logs
- quality-approved external release path
- precise external release result accounting
- test alignment for AdSense reminder and external hint limits

Claude can safely work in parallel on:

- local press collectors and monitoring
- autonomous hub UI cards
- scraper auto-fix PR/revert flows
- analytics cards
- documentation for self-service operations

Coordinate before touching:

- `app/api/cron/blog-quality-check/route.ts`
- `lib/blog-publish.ts`
- `lib/blog/quality-check.ts`
- `lib/blog/external-channel-learning.ts`
- `lib/naver-blog/queue.ts`
- `app/api/publish-blog/route.ts`

These files are on the marketing/quality automation path and small changes can affect Naver, Instagram, WordPress, and SNS publishing.

## Automation Safety Policy

Low risk, can run automatically:

- read-only health checks
- cron run audit logging
- content quality scoring
- IndexNow submission
- retrying failed non-destructive crons
- non-destructive production DB changes when tests and rollback are both confirmed
- creating GitHub PRs for parser fixes
- generating recommendations in `/admin/autonomous`

Medium risk, prefer PR or admin review:

- scraper parser changes
- SEO copy/prompt changes
- UI changes in admin dashboards
- notification wording changes
- production DB changes missing test or rollback proof

High risk, do not run silently:

- deleting rows or files
- destructive production DB changes such as drop, truncate, purge, or irreversible mass update
- rotating secrets
- payment, auth, or RLS changes
- publishing externally when quality review failed
- bypassing review gates
- force-push, reset, or destructive git operations

## Communication Pattern

When one agent starts a slice:

1. Inspect `git status --short`.
2. Pick a narrow write set.
3. Avoid files already dirty unless the slice requires them.
4. Run targeted tests.
5. Run full CI if the change touches shared contracts.
6. Commit and push only the intended files.
7. Leave a concise final note with commit SHA and tests.

If conflicts appear, prefer adding a new helper or test around the existing code rather than rewriting another agent's in-progress file.
