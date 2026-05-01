# Homepage Personalized Dashboard Design

## Goal

Upgrade the homepage into a personalized policy dashboard that improves recommendation trust, policy discovery, and repeat usage. The homepage should make it clear that recommendations are filtered by the user's mypage profile, while still giving anonymous or incomplete-profile users a useful path into diagnosis and browsing.

Primary outcomes:

- Logged-in users understand why each homepage recommendation is relevant.
- Ineligible or sensitive cohort policies are not promoted in personalized homepage areas.
- Anonymous users are guided into the 1-minute diagnosis or signup flow.
- Users can quickly browse welfare, loan, region, target, urgent, and newly added policies.
- The page communicates data freshness and source trust without overwhelming the first screen.

## Current Context

The homepage already has these building blocks:

- `app/page.tsx` as the dynamic homepage server component.
- `HomeRecommendAuto` for logged-in recommendations and anonymous fallback.
- `QuizInlineWizard` for diagnosis-style onboarding.
- `HomeTargetCards`, `RegionMap`, `AlertStrip`, `PopularPicksRow`, and `HomePopularPicks` for discovery.
- `HeroStats`, `getProgramCounts`, and `getDataFreshness` for freshness and volume signals.
- `loadUserProfile` for profile-derived recommendation signals.

Recent fixes strengthened recommendation safety:

- `/recommend` now uses full mypage profile signals.
- Shared personalization gates block disability, justice reentry, protected-youth, and income-mismatched policies from personalized results.

The upgrade should reuse these foundations rather than create a separate recommendation system.

## Homepage Structure

### 1. Hero: Personalized Value First

The first screen should communicate the core promise:

> 내 조건에 맞는 정책만 먼저 보여드릴게요.

The hero should remain direct and action-oriented. It should not become a marketing landing page. The primary job is to get the user into a useful policy workflow immediately.

Hero content:

- Primary headline focused on profile-based filtering.
- Short supporting copy that mentions region, income, household, occupation, and deadlines.
- Primary CTA:
  - Logged-in with usable profile: `내 맞춤 정책 전체 보기`
  - Logged-in with incomplete profile: `마이페이지 보완하기`
  - Anonymous: `1분 진단 시작하기`
- Secondary CTA: `정책 직접 찾아보기`

### 2. Personalized Preview Card

The right side of the desktop hero, and the first follow-up block on mobile, should show a personalized preview.

States:

- Logged-in with complete or usable profile:
  - Show 3 to 5 recommended policies.
  - Show compact match reasons per item, such as `지역`, `소득`, `가구`, `관심분야`, `마감임박`.
  - Show a trust line: `마이페이지 정보로 필터링됨`.
  - Link to `/recommend` for the full result set.
- Logged-in with incomplete profile:
  - Show a profile completion prompt.
  - Mention that income and household information reduce irrelevant recommendations.
  - Link to `/mypage`.
- Anonymous:
  - Show `1분 진단` entry.
  - Mention that signup enables daily new-policy alerts.
  - Link to `/quiz` and `/signup`.

The preview must use the same eligibility gates as the rest of personalized recommendations. It must not show disability-only, reentry, protected-youth, or income-mismatched policies unless the user's profile explicitly qualifies.

### 3. Discovery Hub

Below the hero, group existing discovery components into one coherent hub. The goal is to reduce scattered sections and make policy exploration feel intentional.

Hub sections:

- Welfare support
- Policy loans and funds
- Region-based policies
- Target-based policies
- Urgent deadlines
- Newly added this week

Implementation should prefer reusing existing components:

- `HomeTargetCards` for target-based entry points.
- `RegionMap` for region navigation.
- `AlertStrip` for urgent deadlines.
- `PopularPicksRow` for popular policy entry.

If layout changes are needed, create wrapper sections rather than rewriting these components from scratch.

### 4. Trust And Freshness Strip

Add a compact trust/freshness strip after the main discovery path.

Signals:

- Today's new policy count.
- This week's new policy count.
- Last data collection time.
- A short list of source types or ministries.
- A simple flow: `수집 -> 내 조건 필터링 -> 알림 발송`.

This section should be visually quieter than the personalized preview. It supports confidence but should not compete with the primary CTA.

### 5. Repeat Usage Hooks

The homepage should create reasons to return.

Hooks:

- `이번 주 새 정책`
- `마감 임박`
- `내 조건에 새로 맞는 정책`
- `알림 신청`

These should connect to existing pages and alert flows rather than introducing a separate notification model.

## Data Flow

The homepage server component should fetch only first-screen user state and profile state before returning the shell:

- Supabase auth user
- `loadUserProfile` when logged in
- lightweight freshness/count data inside Suspense where possible

Below-the-fold sections should stay in async server children under `Suspense` so they do not block the first response.

Recommendation data should come from the existing personalization path:

- Use `loadUserProfile().signals`.
- Apply `scoreAndFilter` or existing recommendation helpers with shared eligibility gates.
- Preserve the recent profile cohort and income mismatch fixes.

If match reasons are needed in the UI, expose the existing `signals` already returned by `scoreProgram` rather than adding a separate reason generator.

## Components

Expected component changes:

- `HomePersonalizedPreview`
  - Server component.
  - Accepts loaded profile state or fetches through cached `loadUserProfile`.
  - Renders the three profile states: usable, incomplete, anonymous.
  - Displays policy rows with match reasons.
- `HomeDiscoveryHub`
  - Thin layout wrapper around existing discovery components.
  - Keeps sections grouped and scannable.
- `HomeTrustStrip`
  - Server component using `getProgramCounts` and `getDataFreshness`.
  - Compact metrics and source trust display.

Existing components should remain reusable outside the homepage.

## Error Handling

- If recommendation fetch fails, show the diagnosis/profile CTA rather than a blank hero card.
- If counts or freshness fetch fails, hide or degrade the trust strip.
- If the user is logged in but has no profile, do not attempt to infer sensitive eligibility.
- If match reasons are unavailable, show the policy row without reasons, but never bypass eligibility gates.

## Testing

Add or update tests for:

- Logged-in profile preview does not show income-mismatched policies.
- Logged-in profile preview does not show blocked cohort policies.
- Incomplete profile state renders the mypage completion CTA.
- Anonymous state renders the diagnosis/signup CTA.
- Discovery hub links target the expected routes.
- Trust strip handles missing freshness/count data without throwing.

Run before completion:

- `npm.cmd run lint`
- `npm.cmd run test`
- `npm.cmd run build`

## Non-Goals

- Do not redesign every homepage component from scratch.
- Do not introduce a new recommendation engine.
- Do not add new sensitive profile fields in this pass.
- Do not make the homepage a marketing-only landing page.
- Do not require client-side JavaScript for the first personalized preview.

## Implementation Notes

- The first implementation should focus on structure and trust. Animations and decorative polish are secondary.
- The recommendation preview should cap item count tightly to keep the hero dense and useful.
- The UI copy should avoid overpromising eligibility. Use language like `추천`, `조건에 가까움`, and `확인 필요` where appropriate.
