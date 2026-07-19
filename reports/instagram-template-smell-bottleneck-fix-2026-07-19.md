# Instagram template_smell_detected bottleneck fix

## Problem

The legacy Instagram normal-post cron selected exactly one FIFO candidate:

- `published_at IS NOT NULL`
- `instagram_published_at IS NULL`
- `admin_review_required = false`
- `instagram_attempt_count < 3`
- oldest `published_at`

If that one candidate failed `assessExternalPublishQuality()` with `template_smell_detected`, the route returned `quality_gate_rejected` and never looked at later candidates. One bad post could block the whole 30-minute publish pipeline.

## Fix

Updated `app/api/cron/instagram-publish/route.ts`:

- Fetch up to 10 FIFO pending candidates.
- Assess each candidate in order.
- Skip rejected candidates in-memory.
- Select the first approved candidate for dry-run or publish.
- If all 10 are rejected, return `quality_gate_rejected` with:
  - `scannedCandidates`
  - `rejectedCandidates[]`
- On real publish only, write an audit entry `quality_gate_rejected_candidates_skipped` when rejected candidates were skipped.
- Dry-run remains read-only: no audit write and no Graph publish.

## Tests

Updated `__tests__/app/instagram-publish-route.test.ts`:

- Mock now supports multiple FIFO candidates.
- Added regression test that first rejected candidate is skipped and first approved fallback is selected.

Verification:

```text
npx tsc --noEmit
npx vitest run __tests__/app/instagram-publish-route.test.ts __tests__/lib/blog-quality-gate.test.ts
```

Result:

```text
14 passed
```

## Deployment status

Not pushed/deployed yet. This is a production behavior change and should be deployed after explicit approval.
