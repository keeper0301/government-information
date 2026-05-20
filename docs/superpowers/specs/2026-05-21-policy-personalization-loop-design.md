# Policy Personalization Loop Design

Date: 2026-05-21

## Goal

Build a visible policy personalization loop across the user homepage, policy alert inbox, and admin operations dashboard.

The site already has recommendation scoring, profile loading, alert surfaces, and autonomous operations pages. The next upgrade should connect those pieces into one product loop:

1. Users see why a policy matches them.
2. Users receive and manage policy alerts that continue the recommendation experience.
3. Operators can see whether personalization and alerts are healthy.

This design covers options 1, 2, and 3 selected by the user:

- Neighborhood recommendation 2.0
- Personal policy alert inbox
- Admin autonomous operations cockpit

## Product Shape

### 1. Neighborhood Recommendation 2.0

Upgrade homepage recommendation surfaces so users understand the match reason, not just the policy title.

Expected behavior:

- Logged-in users see compact reason chips on recommended policies.
- Reason chips should reuse recommendation signals such as region, district, sub-district, age, household, income, interest, deadline, and popularity where available.
- Sub-district matches should be visible as a stronger local signal, using the existing `sub_district` profile path.
- If the profile is incomplete, the homepage should show a profile completion nudge instead of pretending the recommendation is fully personalized.
- Anonymous users should still get the quiz and signup path.

Primary UI surfaces:

- Homepage personalized recommendation area
- Recommendation list cards where match reasons are already available
- Profile completion entry points that lead to `/mypage` or `/quiz`

### 2. Personal Policy Alert Inbox

Upgrade `/alerts` from a passive alert list into a personal policy inbox.

Expected behavior:

- Each alert item explains why the policy was sent.
- Users can mark alerts as read, keep them for later, or hide alerts that are not relevant.
- Alert items link back to the policy detail or recommendation result.
- The inbox should distinguish new, deadline-sensitive, and profile-matched policies.
- Alert settings should stay lightweight: region, category, and frequency are enough for the first pass.

Primary UI surfaces:

- `/alerts`
- Alert preference controls if they already exist
- Entry points from homepage recommendation sections

### 3. Admin Autonomous Operations Cockpit

Upgrade `/admin/autonomous` so operators can see whether the personalization loop is actually working.

Expected behavior:

- Show recommendation health signals: recent recommendation volume, empty-result rate, and top missing profile fields.
- Show alert health signals: pending alerts, sent alerts, failed sends, and stale rules.
- Show data freshness signals: recent collection time, failed collectors, and policy coverage by region.
- Show safe next actions, but keep risky automation behind existing review gates.

Primary UI surfaces:

- `/admin/autonomous`
- Existing autonomous operations cards and audit logs
- Existing risk policy helpers for admin review or PR-only actions

## Architecture

The upgrade should not introduce a second recommendation engine. It should expose and organize signals already produced by the existing personalization path.

Recommended layering:

- `lib/personalization/*` remains the scoring and signal source.
- UI components render reason chips from scored signals instead of recomputing reasons.
- Alert inbox rows reuse the same reason-label mapping as recommendation cards.
- Admin cockpit reads aggregate health metrics through small server helpers.
- Next.js route files should keep logic in `lib/` helpers and export only allowed route/page exports.

This keeps the loop explainable and testable:

```text
profile + policy data
  -> personalization scoring
  -> reason chips on homepage/recommendations
  -> alert inbox entries with the same reason language
  -> admin health metrics showing coverage and failure points
```

## Components

### User Recommendation Components

Expected component work:

- Add or extend a reusable `RecommendationReasonChips` component.
- Reuse it in homepage recommendation rows and alert inbox rows.
- Keep chip labels short and stable:
  - `지역`
  - `시군구`
  - `읍면동`
  - `나이`
  - `가구`
  - `소득`
  - `관심`
  - `마감`
  - `인기`
- Add a profile completion indicator near personalized homepage recommendations.

### Alert Inbox Components

Expected component work:

- Add inbox sections for new, urgent, and saved policies if the data supports them.
- Add read, save-for-later, and hide actions only when backed by existing persistence or a small scoped persistence helper.
- If persistence is not ready, render read-only explanation first and defer actions to a later implementation slice.

### Admin Cockpit Components

Expected component work:

- Add a personalization health card.
- Add an alert delivery health card.
- Add a regional coverage card.
- Use existing admin/autonomous visual patterns instead of redesigning the whole admin area.

## Data Flow

### Recommendation Reasons

The recommendation reason display should be derived from scored signals:

- `scoreProgram` or the existing recommendation helper returns signals.
- UI maps signal kinds to human-readable labels.
- Sensitive or uncertain matches should not be presented as guaranteed eligibility.
- Copy should use recommendation language such as `추천`, `관련`, and `확인 필요`, not final eligibility language.

### Alerts

The inbox should prefer existing alert data. If an alert row does not have explicit reason metadata, the page can resolve reasons from the linked policy and current profile at render time.

First-pass alert fields:

- policy id
- title
- alert status
- deadline or freshness label
- reason chips
- primary link

Avoid adding broad notification infrastructure in the first slice. This design is about making the existing alert experience understandable before expanding channels.

### Admin Metrics

Admin metrics should be aggregate and low risk:

- recommendation result count
- empty recommendation count
- top missing profile fields
- alert send failures
- stale alert rules
- recent collector freshness
- regional policy coverage gaps

The cockpit should surface next actions, but actions that affect production data, auth, secrets, destructive changes, or external publishing must continue through the existing risk gates.

## Error Handling

- If recommendation scoring fails, show the quiz/profile fallback instead of an empty recommendation panel.
- If reason signals are missing, show the policy without chips and avoid inventing a reason.
- If alert inbox aggregation fails, show a plain alert list with a short degraded-state message.
- If admin metrics fail, isolate the failed card and keep the rest of `/admin/autonomous` usable.
- If user profile data is missing, do not infer sensitive eligibility.

## Implementation Order

### Slice 1: Homepage Recommendation Explanation

Scope:

- Reusable reason-chip mapping
- Homepage recommendation chips
- Profile completion nudge
- Tests for sub-district reason display and incomplete-profile fallback

Why first:

- It directly uses the recent sub-district scoring work.
- It gives users visible value before changing alert or admin workflows.
- It has the smallest blast radius.

### Slice 2: Alert Inbox Explanation

Scope:

- `/alerts` layout upgrade
- Reason chips on alert rows
- New, urgent, and saved/read states where supported
- Tests for degraded behavior when reason metadata is missing

Why second:

- Alert explanations should use the same reason language introduced in Slice 1.
- It turns recommendation trust into repeat usage.

### Slice 3: Admin Personalization Cockpit

Scope:

- Personalization health card
- Alert delivery health card
- Regional coverage card
- Safe next-action display through existing admin risk rules
- Tests for metric helper fallbacks

Why third:

- Admin metrics should reflect the user-facing loop after recommendation and alert surfaces are clear.
- It avoids building operational dashboards before the product behavior is visible.

## Testing

Targeted tests:

- `sub_district` recommendation signals render as `읍면동`.
- Missing profile data renders a completion nudge.
- Anonymous users still see quiz/signup paths.
- Alert rows render reason chips when signals are available.
- Alert rows degrade without throwing when reason signals are missing.
- Admin metric helpers return safe defaults on query errors.
- High-risk admin actions remain gated by existing autonomous policy logic.

Validation commands for implementation slices:

- `npx vitest run <targeted tests>`
- `npx tsc --noEmit --pretty false`
- `npm run lint`
- `npm run ci` when shared recommendation, alert, or admin contracts change
- `npm run build` for route/page or Next.js boundary changes

## Non-Goals

- Do not replace the recommendation engine.
- Do not add a new external policy data source in this feature.
- Do not add broad new notification channels in the first alert inbox slice.
- Do not bypass admin automation risk gates.
- Do not claim guaranteed benefit eligibility from recommendation signals.
- Do not redesign every homepage, alert, or admin component at once.

## Acceptance Criteria

The upgrade is successful when:

- Users can see clear reasons for top recommendations.
- Sub-district personalization is visible where it affects ranking.
- The alert page feels like a personal policy inbox rather than a generic list.
- Admins can see whether recommendations and alerts are producing useful outcomes.
- Failures degrade locally without breaking the page.
- The implementation remains split into reviewable slices.
