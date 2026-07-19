# Instagram automatic publish volume upgrade

## Change

Increase the legacy Instagram normal-post automatic publishing capacity while keeping one post per cron run.

## Previous production behavior

- Cron: `0,30 * * * *` — every 30 minutes
- New-account daily cap: 8 posts/day
- Established-account daily cap: 20 posts/day
- Per-run publish count: 1 post

## New behavior

- Cron: `*/15 * * * *` — every 15 minutes
- New-account daily cap: 12 posts/day
- Established-account daily cap: 28 posts/day
- Per-run publish count: 1 post

## Risk control

- Still one carousel per run.
- KST 09:00–21:59 hour guard remains.
- `INSTAGRAM_CRON_DISABLED=true` kill switch remains.
- Env overrides remain available:
  - `INSTAGRAM_DAILY_CAP`
  - `INSTAGRAM_NEW_ACCOUNT_DAILY_CAP`
  - `INSTAGRAM_ESTABLISHED_DAILY_CAP`
- Quality gate and template-smell candidate skipping remain active.

## Why this shape

Do not publish multiple posts in a single Vercel invocation. A carousel publish creates multiple Instagram media containers and polls Graph state, so batching several posts in one invocation increases timeout, transient error, and duplicate-post risk. More frequent cron plus one post per run is safer.

## Verification

Run before deploy:

```text
npx tsc --noEmit
npx vitest run __tests__/app/instagram-publish-route.test.ts __tests__/lib/instagram-caption.test.ts __tests__/lib/instagram-policy-copy.test.ts
node -e "const v=require('./vercel.json'); const c=v.crons.find(x=>x.path==='/api/cron/instagram-publish'); if(c.schedule!=='*/15 * * * *') process.exit(1); console.log(c.schedule)"
git diff --check
```
