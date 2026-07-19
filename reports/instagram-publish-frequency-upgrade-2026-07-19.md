# Instagram publish frequency upgrade — government-information legacy system

## Target system

Existing/canonical Instagram normal-post system:

- Cron route: `app/api/cron/instagram-publish/route.ts`
- Card renderer: `app/api/instagram-card/[slug]/[index]/route.tsx`
- Graph publisher: `lib/instagram/publish.ts`
- Cron config: `vercel.json`

## Changes

1. Cron frequency increased
   - Before: `0 * * * *` — hourly
   - After: `0,30 * * * *` — twice per hour
   - Per-run publishing remains 1 post. This avoids widening one failure into multiple posts in the same invocation.

2. Daily cap increased
   - New-account default cap: 5/day → 8/day
   - Established-account default cap: 14/day → 20/day

3. Runtime cap override added
   - `INSTAGRAM_DAILY_CAP`
   - `INSTAGRAM_NEW_ACCOUNT_DAILY_CAP`
   - `INSTAGRAM_ESTABLISHED_DAILY_CAP`
   - Invalid/non-positive values fall back to safe defaults.

4. Tests updated
   - Default new-account cap appears in dry-run response as `8`.
   - Established account cap can be overridden via env.
   - Cron schedule check confirms `0,30 * * * *`.

## Verification

Commands run:

```bash
npx tsc --noEmit
npx vitest run __tests__/app/instagram-publish-route.test.ts __tests__/lib/instagram-caption.test.ts
node -e "const v=require('./vercel.json'); const row=v.crons.find(c=>c.path==='/api/cron/instagram-publish'); if(row.schedule!=='0,30 * * * *') throw new Error(row.schedule);"
```

Result:

```text
19 passed
instagram cron schedule ok: 0,30 * * * *
git diff --check: pass
```

## Red-team note

This is deliberately not a multi-post loop. Instagram carousel publish can take up to ~245s because of media container polling. Publishing multiple posts in one function would raise timeout, duplicate, and partial-failure risk. Twice-hourly one-at-a-time publishing increases throughput while preserving the existing CAS/attempt-count safety model.

## Deployment boundary

No production deploy was performed in this worktree. Public publishing behavior changes require explicit deploy approval.
