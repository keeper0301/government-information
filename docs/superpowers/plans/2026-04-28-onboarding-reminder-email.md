# 온보딩 미완 환영 이메일 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가입 후 24h~48h 미온보딩 사용자에게 매일 1회 cron 으로 환영 이메일 1회 발송 (dedup 테이블 사용).

**Architecture:** 마이그레이션 067 (onboarding_reminders 테이블) → cron 이 24h~48h 가입 + 미온보딩 + 미발송 사용자 추출 → INSERT 후 Resend 발송 → race condition 안전.

**Tech Stack:** Supabase admin client, Resend (lib/email.ts), Vercel cron + CRON_SECRET, getAuthUsersCached (react cache)

**Spec:** `docs/superpowers/specs/2026-04-28-onboarding-reminder-email-design.md`

---

## File Structure

| 파일 | 변경 종류 | 책임 |
|---|---|---|
| `supabase/migrations/067_onboarding_reminders.sql` | create | dedup 테이블 + RLS |
| `lib/email.ts` | modify | sendOnboardingReminderEmail 함수 추가 |
| `app/api/cron/onboarding-reminder/route.ts` | create | 매일 11:05 KST cron |
| `vercel.json` | modify | cron 등록 |

총 4 파일.

---

## Task 1: 마이그레이션 067 + prod apply

**Files:** `supabase/migrations/067_onboarding_reminders.sql` (신규)

- [ ] **Step 1.1: 마이그레이션 파일 생성**

```sql
-- 067_onboarding_reminders.sql
-- 온보딩 미완 환영 이메일 dedup. 1인 1회 발송 보장.
-- /api/cron/onboarding-reminder 가 INSERT (UNIQUE PK 위반 시 자동 skip).

CREATE TABLE IF NOT EXISTS public.onboarding_reminders (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.onboarding_reminders IS
  '온보딩 미완 환영 이메일 dedup. 1인 1회 발송 보장. /api/cron/onboarding-reminder 가 INSERT.';

ALTER TABLE public.onboarding_reminders ENABLE ROW LEVEL SECURITY;
-- 정책 미정의 → admin client (service role) 만 접근 가능. anon/authenticated 차단.
```

- [ ] **Step 1.2: prod DDL apply 명시 승인 받기**

사장님께 명시 승인 요청 ("승인" / "apply" / "테이블 생성 승인" 표현).

- [ ] **Step 1.3: prod apply (승인 후)**

mcp__plugin_supabase_supabase__apply_migration:
- name: `onboarding_reminders`
- query: 위 SQL 전체

- [ ] **Step 1.4: 검증**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'onboarding_reminders';
```

Expected: 1 row.

- [ ] **Step 1.5: 커밋**

```bash
git add supabase/migrations/067_onboarding_reminders.sql
git commit -m "migration(067): onboarding_reminders 테이블 (환영 이메일 dedup)"
```

---

## Task 2: lib/email.ts 에 sendOnboardingReminderEmail

**Files:** `lib/email.ts`

- [ ] **Step 2.1: 파일 끝에 함수 추가**

`lib/email.ts` 끝 (sendHealthAlertEmail 직후):

```ts
// ============================================================
// 온보딩 미완 환영 이메일 (가입 후 24h~48h 미온보딩 사용자 1회 발송)
// ============================================================

export async function sendOnboardingReminderEmail({
  to,
}: {
  to: string;
}): Promise<{ ok: boolean; error?: string }> {
  const subject = "[keepioo] 1분만 더! 맞춤 정책 받아보세요";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h1 style="color: #191F28; font-size: 22px; margin-bottom: 16px;">
        👋 keepioo 가입을 환영해요!
      </h1>
      <p style="font-size: 15px; color: #4E5968; line-height: 1.65;">
        가입 후 1분만 더 시간 내주시면 — 본인 자격에 맞는 정책만 골라 자동 알림으로 보내드려요.
      </p>
      <ul style="font-size: 14px; color: #4E5968; line-height: 1.6; padding-left: 20px;">
        <li>지역·연령·직업 등 5문항 (1분)</li>
        <li>매일 매칭 정책 1건 + 이메일 알림</li>
        <li>마감 임박 정책 자동 안내</li>
      </ul>
      <a href="https://www.keepioo.com/onboarding"
         style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #3182F6; color: #fff; text-decoration: none; border-radius: 12px; font-weight: 600;">
        1분 만에 시작하기 →
      </a>
      <p style="font-size: 12px; color: #8B95A1; margin-top: 32px; line-height: 1.5;">
        이 메일은 keepioo 가입 후 프로필 미작성 사용자에게 1회 발송되는 안내 메일입니다.
        수신을 원하지 않으시면 <a href="https://www.keepioo.com/mypage" style="color: #6B7684;">마이페이지</a> 에서 계정을 삭제하실 수 있습니다.
      </p>
    </div>
  `;

  const text = `keepioo 가입을 환영해요!\n\n가입 후 1분만 더 시간 내주시면 — 본인 자격에 맞는 정책만 골라 자동 알림으로 보내드려요.\n\n1분 만에 시작하기: https://www.keepioo.com/onboarding\n\n이 메일은 keepioo 가입 후 프로필 미작성 사용자에게 1회 발송되는 안내 메일입니다.`;

  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
    text,
  });

  return error ? { ok: false, error: error.message } : { ok: true };
}
```

- [ ] **Step 2.2: 타입 체크**

```bash
bunx tsc --noEmit 2>&1 | tail -5
```

Expected: error 0.

(commit 은 Task 3 와 함께)

---

## Task 3: /api/cron/onboarding-reminder/route.ts

**Files:** `app/api/cron/onboarding-reminder/route.ts` (신규)

- [ ] **Step 3.1: 파일 생성**

```ts
// app/api/cron/onboarding-reminder/route.ts
// 매일 11:05 KST cron — 가입 24h~48h 전 + 온보딩 미완 + 미발송 사용자에게
// 환영 이메일 1회 발송 (onboarding_reminders 테이블이 dedup).

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUsersCached } from "@/lib/admin-stats";
import { sendOnboardingReminderEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authorize(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

async function run() {
  const admin = createAdminClient();
  const since48Iso = new Date(
    Date.now() - 48 * 60 * 60 * 1000,
  ).toISOString();
  const since24Iso = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();

  // 24h~48h 전 가입 사용자 후보
  const users = await getAuthUsersCached();
  const candidates = users.filter(
    (u) =>
      u.created_at &&
      u.created_at >= since48Iso &&
      u.created_at < since24Iso &&
      !u.deleted_at &&
      u.email,
  );

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, total: 0 });
  }

  const candidateIds = candidates.map((u) => u.id);

  // user_profiles 미완 + onboarding_reminders 없는 사용자만 필터
  const [profilesData, remindersData] = await Promise.all([
    admin
      .from("user_profiles")
      .select("id, age_group, region, occupation")
      .in("id", candidateIds),
    admin
      .from("onboarding_reminders")
      .select("user_id")
      .in("user_id", candidateIds),
  ]);

  // user_profiles row 가 있고 1개 필드라도 채워져 있으면 "온보딩 완료" 로 간주
  const filledProfileIds = new Set(
    (profilesData.data ?? [])
      .filter(
        (p: {
          age_group: string | null;
          region: string | null;
          occupation: string | null;
        }) => p.age_group || p.region || p.occupation,
      )
      .map((p: { id: string }) => p.id),
  );
  const remindedIds = new Set(
    (remindersData.data ?? []).map((r: { user_id: string }) => r.user_id),
  );

  const targets = candidates.filter(
    (u) => !filledProfileIds.has(u.id) && !remindedIds.has(u.id),
  );

  // INSERT 먼저 → race condition 안전. INSERT 성공 후에만 발송.
  let sent = 0;
  let failed = 0;
  for (const u of targets) {
    const { error: insertError } = await admin
      .from("onboarding_reminders")
      .insert({ user_id: u.id });
    if (insertError) {
      failed++;
      continue;
    }
    const result = await sendOnboardingReminderEmail({ to: u.email! });
    if (result.ok) sent++;
    else failed++;
  }

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    total: targets.length,
  });
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}

export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}
```

- [ ] **Step 3.2: 빌드**

```bash
bunx tsc --noEmit 2>&1 | tail -5
bun run build 2>&1 | tail -5
```

Expected: error 0.

---

## Task 4: vercel.json cron 등록

**Files:** `vercel.json`

- [ ] **Step 4.1: cron 추가**

기존 `crons` 배열에 다음 라인 추가 (예: health-alert 직후):

```json
{ "path": "/api/cron/onboarding-reminder", "schedule": "5 2 * * *" }
```

(`5 2` UTC = 11:05 KST, 정시 회피)

- [ ] **Step 4.2: Task 2+3+4 한 commit**

```bash
git add lib/email.ts app/api/cron/onboarding-reminder/route.ts vercel.json
git commit -m "feat(cron): 온보딩 미완 환영 이메일 — 매일 11:05 KST 가입 24h~48h 미온보딩 사용자 1회 발송"
```

---

## Task 5: 검증 + push

- [ ] **Step 5.1: chrome 또는 curl 수동 trigger**

```bash
curl -X POST https://www.keepioo.com/api/cron/onboarding-reminder \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected: `{ ok: true, sent: N, total: N }`. 사장님 본인 (이미 온보딩 완) 안 받음 확인.

- [ ] **Step 5.2: untillthen0807 같은 케이스 검증**

DB 직접 확인:
```sql
SELECT * FROM onboarding_reminders ORDER BY sent_at DESC LIMIT 5;
```

Expected: 24h~48h 전 가입 + 미온보딩 사용자에게 row 추가됨.

- [ ] **Step 5.3: push (사장님 명시 후)**

```bash
git push origin master
```

- [ ] **Step 5.4: 메모리 갱신**

`project_keepioo_onboarding_reminder_2026_04_28.md` 신설 + MEMORY.md 인덱스.

---

## Self-Review

### 1. Spec 커버리지

| Spec section | Plan task | 커버 |
|---|---|---|
| Section 1 타이밍·로직 | Task 3 (run 함수) | ✅ |
| Section 2 마이그레이션 067 | Task 1 | ✅ |
| Section 3 이메일 내용 | Task 2 | ✅ |
| Section 4 구현 | Task 2·3 | ✅ |
| Section 5 cron 등록 | Task 4 | ✅ |
| Section 6 검증 | Task 5 | ✅ |

### 2. 회귀 가드
- 각 task 후 typecheck (Step 2.2·3.2)
- prod 영향: 컬럼 추가 0, 기존 cron 영향 0 (새 cron 만 추가)
- INSERT 먼저 → race condition 안전

### 3. Type 일관성
- onboarding_reminders 컬럼 (user_id·sent_at) — Task 1 정의, Task 3 INSERT
- sendOnboardingReminderEmail 시그니처 — Task 2 정의, Task 3 호출
- candidates·targets — auth User type 일관

### 4. 위험 요소

- prod DDL apply 명시 승인 필요 (Task 1.2)
- Resend 일일 한도 (free 100/day) — 24h~48h 사이 가입자 적어 안전
- INSERT 성공 후 발송 실패 시 row 만 남음 (사용자가 안 받음, 재시도 안 함) — 사장님이 매일 cron 결과 점검
- user_profiles row 자체가 없는 untillthen 케이스 → filledProfileIds 에 없음 → 발송 대상 (의도)

---

## 진행 후 보고

각 task 완료 후 짧게:
```
✅ Task N 완료
- 변경: <파일>, 커밋: <hash>
```

전체 완료 시:
```
✅ 온보딩 환영 이메일 시스템 완료
- 마이그레이션 067 prod apply
- 매일 11:05 KST cron 등록
- 사장님 외부 액션 0
- 다음 cron 1회 후 발송 결과 모니터링
```
