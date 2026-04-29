# Phase 5 — 마케팅 채널 implementation plan (2026-04-29)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** 자체 마케팅 채널 확보. SEO·SNS 외 트래픽 유입원 + retention.

**Architecture:**
- A4 = 주간 정책 다이제스트 (`/api/cron/weekly-digest`). **알림 규칙 없는 사용자** 만 대상 (alert-dispatch 와 중복 0). 매주 월요일 09:00 KST.
- A3 = Referral 시스템. 신규 `referrals` 테이블 + 마이페이지 코드 발급/공유 + 가입 흐름 ?ref= 처리 + Pro 1주 보상.

**Tech Stack:** Next.js 15 / Supabase / Resend / 기존 lib/email.ts·user_subscriptions.

---

## File Structure

### A4 — 주간 다이제스트 (3h)
- **Create:** `lib/digest/weekly.ts` — 이번 주 hot 5건 select + recipients (알림 규칙 없는 사용자)
- **Create:** `lib/email/weekly-digest.ts` — Resend 발송 (HTML template)
- **Create:** `app/api/cron/weekly-digest/route.ts` — cron handler (매주 월 09:00 KST)
- **Modify:** `vercel.json` — cron 등록
- **Test:** `__tests__/lib/digest/weekly.test.ts` — recipients 필터 + hot 정책 select 단위 테스트

### A3 — Referral 시스템 (4h)
- **Create:** `supabase/migrations/068_referrals.sql` — referrals 테이블 + RLS + 인덱스 (**DDL 명시 승인 필요**)
- **Create:** `lib/referrals.ts` — 코드 생성/조회/보상 적용 헬퍼
- **Create:** `app/api/referral/redeem/route.ts` — ?ref= 처리 (POST, 가입 callback 에서 호출)
- **Create:** `app/mypage/referral/page.tsx` — 코드 발급·공유·통계 페이지
- **Modify:** `app/mypage/tabs.tsx` — Referral 탭 추가
- **Modify:** `app/auth/callback/route.ts` — 가입 시 ?ref 쿠키 → redeem 호출
- **Test:** `__tests__/lib/referrals.test.ts` — 코드 생성 / 자기 추천 차단 / cap 10명 / Pro 1주 연장 단위 테스트

---

## Task 1: A4 주간 다이제스트 (10 step)

**Files:**
- Create: `lib/digest/weekly.ts`, `lib/email/weekly-digest.ts`, `app/api/cron/weekly-digest/route.ts`, `__tests__/lib/digest/weekly.test.ts`
- Modify: `vercel.json`

### - [ ] Step 1: 기존 alert-dispatch route 패턴 read

`app/api/alert-dispatch/route.ts` + `app/api/cron/onboarding-reminder/route.ts` 읽고 cron handler 패턴·이메일 발송·로깅 패턴 파악.

### - [ ] Step 2: lib/digest/weekly.ts 작성

```ts
// lib/digest/weekly.ts
// 주간 다이제스트 — 알림 규칙 없는 사용자에게 이번 주 hot 정책 5건 발송.
// alert-dispatch 와 중복 0 (alert 규칙 있는 사용자는 자동 제외).

export interface WeeklyDigestProgram {
  id: string;
  type: "welfare" | "loan";
  title: string;
  source: string | null;
  apply_end: string | null;
  benefit_tags: string[] | null;
}

export interface DigestRecipient {
  user_id: string;
  email: string;
}

// hot 정책 5건 select — 최근 7일 신규 + 활성 + duplicate_of_id IS NULL
//   기준: created_at desc 5건 (단순). 추후 view_count 가중 가능.
export async function loadHotPrograms(supabase: any): Promise<WeeklyDigestProgram[]> { ... }

// recipients — 이메일 마케팅 동의 + alert_rules 0건 사용자
export async function loadRecipients(supabase: any): Promise<DigestRecipient[]> { ... }
```

### - [ ] Step 3: 단위 테스트 (mock supabase + 5 case)
- hot 정책 5건 limit 정확
- duplicate_of_id IS NULL 필터 적용
- recipients: alert_rules 있는 사용자 제외
- recipients: 이메일 마케팅 동의 안 한 사용자 제외
- 빈 결과 graceful

### - [ ] Step 4: lib/email/weekly-digest.ts 작성

`lib/email.ts` 의 sendCustomAlertEmail 패턴 답습. HTML 템플릿:
- Hero: "이번주 hot 정책 5건"
- 정책 카드 5개 (title · source · 마감일 · CTA "자세히 보기")
- 푸터: 발송 사유 + 알림 규칙 등록 link + 수신 거부 link

### - [ ] Step 5: app/api/cron/weekly-digest/route.ts cron handler

다른 cron 패턴 (CRON_SECRET Bearer 인증 + try/catch + notifyCronFailure) 답습.
- loadHotPrograms + loadRecipients 병렬
- 각 recipient 에게 sendWeeklyDigestEmail (Promise batch 5건씩)
- alert_deliveries 테이블에 status='sent' 로깅 (또는 별도 weekly_digest_log 테이블 고려?)

선택: 첫 단계는 단순 발송만, 별도 로그 테이블 X. 사장님 dogfood 후 결정.

### - [ ] Step 6: vercel.json cron 등록

```json
{ "path": "/api/cron/weekly-digest", "schedule": "0 0 * * 1" }
```
KST 09:00 = UTC 00:00, 월요일 (cron 의 1).

### - [ ] Step 7: tsc + vitest 검증

```bash
npm run ci
```

### - [ ] Step 8: Commit (push 안 함)

```bash
git add lib/digest/weekly.ts lib/email/weekly-digest.ts \
  app/api/cron/weekly-digest/route.ts vercel.json \
  __tests__/lib/digest/weekly.test.ts
git commit -m "feat(digest): 주간 정책 다이제스트 — 알림 규칙 없는 사용자 대상 (Phase 5 A4)
..."
```

### - [ ] Step 9: spec + code quality reviewer dispatch

### - [ ] Step 10: 사장님 외부 액션 안내
- Resend domain 인증 (이미 standby) 확인
- /api/cron/weekly-digest 수동 호출 후 본인 메일 도달 확인

---

## Task 2: A3 Referral 시스템 (12 step) — DDL 명시 승인 필요

**Files:**
- Create: `supabase/migrations/068_referrals.sql` (**DDL — 사장님 명시 승인**)
- Create: `lib/referrals.ts`, `app/api/referral/redeem/route.ts`
- Create: `app/mypage/referral/page.tsx`
- Modify: `app/mypage/tabs.tsx`, `app/auth/callback/route.ts`
- Test: `__tests__/lib/referrals.test.ts`

### - [ ] Step 1: supabase/migrations/068_referrals.sql 작성

```sql
-- 068_referrals.sql
-- Phase 5 A3: Referral 시스템 — 가입 1명당 referrer 에게 Pro 1주 보상.
--
-- referrer_id: 추천한 사용자 (auth.users.id)
-- referred_id: 추천받아 가입한 사용자 (UNIQUE — 한 사용자는 한 referrer 만)
-- code: 추천 코드 (referrer 별 고유, slug-friendly)
-- status: pending (가입 대기) / completed (가입 + 보상 적용 완료)
-- reward_applied_at: Pro 1주 연장이 적용된 시점

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
  reward_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_self_referral CHECK (referrer_id != referred_id)
);

-- 한 referrer 가 여러 코드 발급 가능하지만, 코드는 referrer 별 unique
CREATE UNIQUE INDEX referrals_referrer_code_idx ON referrals (referrer_id, code) WHERE referred_id IS NULL;

-- 가입 시 코드 lookup 용
CREATE INDEX referrals_code_idx ON referrals (code) WHERE referred_id IS NULL;

-- 통계 query 용
CREATE INDEX referrals_referrer_status_idx ON referrals (referrer_id, status);

-- RLS
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- 본인 referrals 만 조회 (마이페이지 통계)
CREATE POLICY referrals_select_own ON referrals
  FOR SELECT TO authenticated
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- INSERT 는 admin (service_role) 만 — server action 에서 admin client 사용
-- (anon/authenticated 에 INSERT 금지로 임의 코드 생성 차단)
```

### - [ ] Step 2: 사장님 명시 승인 break

이 SQL 을 사장님께 보여드리고 "승인" / "apply" 표현 받기. 메모리 `feedback_prod_ddl_explicit_approval.md` 정책.

### - [ ] Step 3: prod Supabase 에 마이그레이션 apply (mcp tool)

`mcp__plugin_supabase_supabase__apply_migration` (사장님 승인 후만)

### - [ ] Step 4: lib/referrals.ts 작성

```ts
// lib/referrals.ts
// Referral 시스템 — 코드 생성·redeem·Pro 1주 보상.

const MAX_REFERRALS_PER_USER = 10; // 1 사용자당 cap (어뷰징 차단)
const REWARD_DAYS = 7;

export interface ReferralStats {
  total: number;
  pending: number;
  completed: number;
}

// 짧은 코드 생성 — 6자리 base32 (사용자 친화)
export function generateReferralCode(): string { ... }

// referrer 의 미사용 코드 발급 (이미 있으면 재사용)
export async function getOrCreateCode(adminClient, referrerId): Promise<string> { ... }

// 가입 시 ?ref=<code> 처리 — pending row 생성 후 reward 적용
export async function redeemReferral(
  adminClient,
  code: string,
  referredId: string,
): Promise<{ ok: boolean; reason?: string }> {
  // 1. 자기 자신 추천 차단 (referrer_id != referred_id)
  // 2. 이미 redeem 한 사용자 차단 (referred_id UNIQUE)
  // 3. cap 10명 도달한 referrer 차단
  // 4. user_subscriptions.expires_at += 7일 (없으면 새로 생성)
  // 5. referrals.status = 'completed', reward_applied_at = now()
  ...
}

// 통계 조회 (마이페이지)
export async function getReferralStats(client, userId): Promise<ReferralStats> { ... }
```

### - [ ] Step 5: 단위 테스트 (8 case)
- 코드 생성 unique·base32 길이
- 자기 추천 차단
- 이미 redeem 한 사용자 거부
- cap 10명 도달 시 거부
- user_subscriptions 신규 생성 (없는 사용자)
- expires_at += 7일 (있는 사용자)
- 만료된 subscription 갱신
- 통계 조회 (pending/completed/total)

### - [ ] Step 6: app/api/referral/redeem/route.ts

POST handler — auth.uid() 가져온 후 redeemReferral 호출. /auth/callback 에서 호출.

### - [ ] Step 7: app/mypage/referral/page.tsx

마이페이지 신규 탭 — 발급된 코드 표시 + 공유 link (/?ref=CODE) + 통계 카드 (pending/completed) + cap 10 안내.

### - [ ] Step 8: app/mypage/tabs.tsx 에 Referral 탭 추가

기존 4 탭 (profile/consents/account/business) → 5 탭.

### - [ ] Step 9: app/auth/callback/route.ts 에 ref 쿠키 처리

가입 시 url.searchParams.get('ref') 가 있으면 `redeemReferral` 호출 (POST 자체 호출 또는 server function 직접). 실패해도 가입은 정상 진행 (graceful).

### - [ ] Step 10: tsc + vitest 검증

### - [ ] Step 11: Commit (push 안 함)

```bash
git add supabase/migrations/068_referrals.sql \
  lib/referrals.ts app/api/referral/redeem/route.ts \
  app/mypage/referral/page.tsx app/mypage/tabs.tsx \
  app/auth/callback/route.ts \
  __tests__/lib/referrals.test.ts
git commit -m "feat(referral): 추천 코드 + Pro 1주 보상 시스템 (Phase 5 A3)
..."
```

### - [ ] Step 12: spec + code quality reviewer dispatch

---

## Task 3: Phase 5 마무리 (5 step)

### - [ ] Step 1: Phase 5 final reviewer dispatch
### - [ ] Step 2: master push (Task 1 + Task 2 묶음)
### - [ ] Step 3: 메모리 신규 작성 (`project_keepioo_phase5_marketing_channels.md`)
### - [ ] Step 4: MEMORY.md 추가
### - [ ] Step 5: 마스터 plan ✅ 표시

---

## 자체 리뷰 체크리스트

- [x] alert-dispatch 와 중복 0 (recipients 필터)
- [x] DDL 사장님 명시 승인 break (Task 2 Step 2)
- [x] 자기 추천 차단 (DB CHECK + lib 가드)
- [x] cap 10명 (어뷰징 차단)
- [x] graceful 실패 (사장님 cron 사고 대비)
- [x] 단위 테스트 (digest recipients + referrals 8 case)

---

## 사장님 외부 액션

Phase 5 push 후:
1. **Resend domain 인증 확인** (이미 standby — Resend 콘솔에서 keepioo.com DNS 확인)
2. **첫 weekly-digest cron 모니터링** (다음 주 월요일 09:00 KST)
3. **마이페이지 /mypage/referral 본인 코드 발급 + SNS 공유 dogfood**
4. **첫 referral redeem 사고 시 alert_dispatch 처럼 hot-fix 가능**

---

**Why:** Phase 2~4 의 트래픽·재방문 인프라 위에 자체 마케팅 채널 확보. A4 (다이제스트) 로 알림 규칙 없는 사용자 retention, A3 (referral) 로 가입 채널 확장.

**How to apply:** Task 1 (A4) 부터 진행. Task 2 의 DDL 만 사장님 명시 승인 break. 그 외는 phase 1~4 패턴 동일.
