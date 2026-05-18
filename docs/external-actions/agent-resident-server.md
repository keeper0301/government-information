# Agent Resident Server

This is the always-on worker for 100% autonomous keepioo operations.

## What It Does

- Keeps a real server process alive outside Vercel serverless timeouts.
- Calls `https://www.keepioo.com/api/cron/agent-resident-cycle` every 5 minutes.
- Exposes `/health` so `/admin/autonomous` and Render health checks can verify it.
- Uses `agent-policy.ts` inside the site, so every action is classified and audited.

## Required Environment

- `CRON_SECRET`: same value as the production site.
- `SITE_BASE_URL`: `https://www.keepioo.com`.
- `AGENT_RESIDENT_INTERVAL_MS`: default `300000`.

## Render Setup

Use `render.yaml`.

1. Create a new Render Blueprint from this repository.
2. Select `keepioo-agent-resident`.
3. Add `CRON_SECRET` as a secret environment variable.
4. Use Starter or higher plan for always-on behavior.
5. Confirm `/health` returns `ready: true`.

## Local Run

```bash
SITE_BASE_URL=https://www.keepioo.com CRON_SECRET=... npm run agent:resident
```

Config validation:

```bash
SITE_BASE_URL=https://www.keepioo.com CRON_SECRET=... npm run agent:resident:check
```

## Safety

The worker does not bypass the site policy engine. Production DB changes are only allowed when the operation is non-destructive and includes both `migrationTested: true` and `rollbackReady: true`. Destructive DB actions, auth/RLS changes, secrets, payments, and force operations remain blocked or routed to review.
