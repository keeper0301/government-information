# Policy Personalization Loop Design

Date: 2026-05-21

## Goal

Build a visible policy personalization loop across the user homepage, personalized notification inbox, and admin operations dashboard.

The site already has recommendation scoring, profile loading, alert surfaces, and autonomous operations pages. The next upgrade should connect those pieces into one product loop:

1. Users see why a policy matches them.
2. Users receive and manage policy alerts that continue the recommendation experience.
3. Operators can see whether personalization and alerts are healthy.

This design covers options 1, 2, and 3 selected by the user:

- Neighborhood recommendation 2.0
- Personal policy notification inbox
- Admin autonomous operations cockpit

## Product Shape

### 1. Neighborhood Recommendation 2.0

Upgrade and reuse the existing homepage recommendation explanation surfaces so users understand the match reason, not just the policy title.

The homepage already has reason labels and a profile trust strip in `components/home-recommend-auto.tsx`. This slice should not rebuild that work. It should extract the useful pieces into clearer shared helpers and apply them consistently where recommendation results appear.

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

### 2. Personal Policy Notification Inbox

Upgrade the matched-policy notification experience into a personal policy inbox.

Important routing distinction:

- `/alerts` is the current deadline reminder screen for policies a user explicitly subscribed to through `alarm_subscriptions`.
- `/mypage/notifications` manages personalized alert rules through `user_alert_rules`.
- `/mypage/notifications/history` shows delivered personalized alerts through `alert_deliveries`.

The policy inbox should be centered on `/mypage/notifications/history`, with `/mypage/notifications` as the settings screen. `/alerts` can keep handling explicit deadline reminders or link users into the new inbox, but it should not be the primary data model for matched-policy notifications.

Expected behavior:

- Each notification item explains why the policy was sent.
- Users can understand why a notification was delivered.
- Read, save-for-later, and hide behavior requires new persistence and should be implemented only after the first inbox explanation slice.
- Notification items link back to the policy detail or recommendation result.
- The inbox should distinguish new, deadline-sensitive, and profile-matched policies.
- Notification settings should stay lightweight: region, category, and frequency are enough for the first pass.

Primary UI surfaces:

- `/mypage/notifications/history`
- `/mypage/notifications`
- `/alerts` as a separate deadline-reminder surface or cross-link
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
- Notification inbox rows reuse the same reason-label mapping as recommendation cards.
- Admin cockpit reads aggregate health metrics through small server helpers.
- Next.js route files should keep logic in `lib/` helpers and export only allowed route/page exports.

This keeps the loop explainable and testable:

```text
profile + policy data
  -> personalization scoring
  -> reason chips on homepage/recommendations
  -> notification inbox entries with the same reason language
  -> admin health metrics showing coverage and failure points
```

## Components

### User Recommendation Components

Expected component work:

- Extract or wrap the existing homepage reason-label logic into a reusable `RecommendationReasonChips` component.
- Reuse it in homepage recommendation rows and notification inbox rows.
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

### Notification Inbox Components

Expected component work:

- Improve `/mypage/notifications/history` as the first inbox surface.
- Add sections or filters for delivered, failed, pending, urgent, and recent notifications using existing `alert_deliveries` fields.
- Add reason chips when the linked policy and current profile can be resolved.
- Keep `/mypage/notifications` focused on rule editing.
- Keep `/alerts` focused on explicit deadline reminders.
- Add read, save-for-later, and hide actions only after adding a small scoped persistence helper or table.
- If persistence is not ready, render read-only explanation first and defer actions to a later slice.

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

The notification inbox should prefer existing personalized alert data. `alert_deliveries` is the correct first source for delivered matched-policy notifications. If a delivery row does not have explicit reason metadata, the page can resolve reasons from the linked policy and current profile at render time.

First-pass alert fields:

- program table and id
- snapshot title
- delivery status
- channel
- created or sent time
- deadline or freshness label
- reason chips
- primary link

Avoid adding broad notification infrastructure in the first slice. This design is about making the existing delivered-notification experience understandable before expanding channels or item-state persistence.

If read, saved, or hidden states are required, add a narrow persistence design first. A small table such as `notification_item_states` can store `user_id`, `delivery_id`, `read_at`, `saved_at`, and `hidden_at`, with RLS scoped to the owning user. Do not overload `alert_deliveries.status`, because that field describes send status, not user interaction state.

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
- If notification inbox aggregation fails, show a plain delivery list with a short degraded-state message.
- If admin metrics fail, isolate the failed card and keep the rest of `/admin/autonomous` usable.
- If user profile data is missing, do not infer sensitive eligibility.

## Implementation Order

### Slice 1: Homepage Recommendation Explanation Commonization

Scope:

- Extract the existing homepage reason-chip mapping into a reusable component or helper
- Keep current homepage recommendation chips working
- Keep the current profile completion nudge working
- Make the shared helper usable by notification history
- Tests for sub-district reason display and incomplete-profile fallback

Why first:

- It directly uses the recent sub-district scoring work.
- It turns existing homepage behavior into a reusable building block before changing alert or admin workflows.
- It has the smallest blast radius.

### Slice 2: Notification History Inbox Explanation

Scope:

- `/mypage/notifications/history` layout upgrade
- Reason chips on delivered notification rows
- Better filters or sections using existing delivery status, channel, and time fields
- Cross-links to `/mypage/notifications` for rule changes
- Preserve `/alerts` as explicit deadline reminder management
- Tests for degraded behavior when reason metadata is missing

Why second:

- Notification explanations should use the same reason language introduced in Slice 1.
- It turns recommendation trust into repeat usage.

### Slice 2B: Notification Item State Persistence

Scope:

- Add read, saved, and hidden state only if the inbox explanation slice proves useful.
- Store user interaction state separately from delivery send status.
- Add RLS and tests for owner-only access.
- Add UI actions after persistence exists.

Why separate:

- Current tables do not store these states.
- Separating this prevents fake buttons that do not survive refreshes.

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
- Notification history rows render reason chips when signals are available.
- Notification history rows degrade without throwing when reason signals are missing.
- `/alerts` continues to manage explicit deadline reminders.
- Read, saved, and hidden states persist only after the item-state persistence slice exists.
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
- Do not add broad new notification channels in the first notification inbox slice.
- Do not treat `/alerts` and `/mypage/notifications/history` as the same data model.
- Do not add read, saved, or hidden buttons without persistence.
- Do not bypass admin automation risk gates.
- Do not claim guaranteed benefit eligibility from recommendation signals.
- Do not redesign every homepage, alert, or admin component at once.

## Acceptance Criteria

The upgrade is successful when:

- Users can see clear reasons for top recommendations.
- Sub-district personalization is visible where it affects ranking.
- `/mypage/notifications/history` feels like a personal policy inbox rather than a generic delivery log.
- `/alerts` remains understandable as explicit deadline reminder management.
- Admins can see whether recommendations and alerts are producing useful outcomes.
- Failures degrade locally without breaking the page.
- The implementation remains split into reviewable slices.
