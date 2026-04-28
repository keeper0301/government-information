# 온보딩 미완 환영 이메일 (가입자 이탈 회복)

**작성일**: 2026-04-28
**대상**: keepioo.com 가입 후 24h 미온보딩 사용자
**범위**: 매일 1회 cron + 1인 1회 발송 (dedup 테이블)

---

## 1. 동기

사고 보고 (2026-04-28): untillthen0807@gmail.com 이 17:03 KST 정상 가입했지만 user_profiles 미작성 (온보딩 화면에서 이탈). 추적 누락 사고는 d450dcf 로 fix (admin 카드 수정).

남은 가치: **이탈 사용자 회복**. 가입 후 24h 안 돌아오면 자동 환영 이메일 → 온보딩 완료 유도.

---

## 2. Section 1 — 타이밍·로직

### 2.1 cron 스케줄

**경로**: `/api/cron/onboarding-reminder`
**스케줄**: 매일 11:05 KST = `5 2 * * *` UTC (정시 회피)

### 2.2 발송 조건 (모두 충족)

| 조건 | 의미 |
|---|---|
| `auth.users.created_at` 24h ~ 48h 전 | 가입 후 1~2일 사이 |
| `user_profiles.id` 없거나 모두 null | 온보딩 미완 (region·age_group·occupation 모두 null) |
| `onboarding_reminders.user_id` 없음 | 이전에 환영 메일 발송 안 함 |
| `auth.users.deleted_at` null | 활성 사용자만 |
| `auth.users.email` 있음 | 발송 대상 가능 |

### 2.3 dedup

같은 사용자에게 2번 발송 금지 → `onboarding_reminders` 테이블 (UNIQUE PK).
INSERT 성공 후에만 이메일 발송 (race condition 시 한 번만 발송 보장).

---

## 3. Section 2 — 마이그레이션 067

```sql
-- 067_onboarding_reminders.sql
CREATE TABLE IF NOT EXISTS public.onboarding_reminders (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.onboarding_reminders IS
  '온보딩 미완 환영 이메일 dedup. 1인 1회 발송 보장. /api/cron/onboarding-reminder 가 INSERT.';

-- RLS — admin client 만 접근 (정책 X, RLS 활성화로 anon/authenticated 차단)
ALTER TABLE public.onboarding_reminders ENABLE ROW LEVEL SECURITY;
```

---

## 4. Section 3 — 이메일 내용

### Subject
`[keepioo] 1분만 더! 맞춤 정책 받아보세요`

### Body (HTML, Resend)

```html
<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
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
```

### Plain text fallback
이메일 클라이언트 HTML 미지원 시.

---

## 5. Section 4 — 구현

### 5.1 lib/email.ts 신규 함수

```ts
export async function sendOnboardingReminderEmail({
  to,
}: {
  to: string;
}): Promise<{ ok: boolean; error?: string }> {
  const subject = "[keepioo] 1분만 더! 맞춤 정책 받아보세요";
  // ... HTML body 위 ...

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

### 5.2 /api/cron/onboarding-reminder/route.ts

```ts
export async function GET(request: Request) {
  // CRON_SECRET 검증

  const since48Iso = ... // 48h 전
  const since24Iso = ... // 24h 전

  // 24h~48h 전 가입 사용자
  const users = await getAuthUsersCached();
  const candidates = users.filter(
    (u) =>
      u.created_at &&
      u.created_at >= since48Iso &&
      u.created_at < since24Iso &&
      !u.deleted_at &&
      u.email,
  );

  if (candidates.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  // user_profiles 미완 + onboarding_reminders 없는 사용자만 필터
  const candidateIds = candidates.map((u) => u.id);

  const [profilesData, remindersData] = await Promise.all([
    admin.from("user_profiles").select("id, age_group, region, occupation").in("id", candidateIds),
    admin.from("onboarding_reminders").select("user_id").in("user_id", candidateIds),
  ]);

  const filledProfileIds = new Set(
    (profilesData.data ?? [])
      .filter((p) => p.age_group || p.region || p.occupation)
      .map((p) => p.id),
  );
  const remindedIds = new Set(
    (remindersData.data ?? []).map((r) => r.user_id),
  );

  const targets = candidates.filter(
    (u) => !filledProfileIds.has(u.id) && !remindedIds.has(u.id),
  );

  // 발송 + INSERT (race condition 안전 위해 INSERT 먼저)
  let sent = 0;
  let failed = 0;
  for (const u of targets) {
    const { error: insertError } = await admin
      .from("onboarding_reminders")
      .insert({ user_id: u.id });
    if (insertError) {
      failed++;
      continue; // INSERT 실패 (UNIQUE 위반 등) → skip
    }
    const result = await sendOnboardingReminderEmail({ to: u.email! });
    if (result.ok) sent++;
    else failed++;
  }

  return NextResponse.json({ ok: true, sent, failed, total: targets.length });
}
```

### 5.3 vercel.json cron 등록

```json
{ "path": "/api/cron/onboarding-reminder", "schedule": "5 2 * * *" }
```

---

## 6. 검증·롤백

### 검증
- 마이그레이션 067 prod apply (DDL 명시 승인)
- typecheck/build 통과
- cron 수동 trigger (사장님 본인은 이미 온보딩 완 → 발송 안 됨 확인)
- untillthen0807 같은 케이스 → 발송 + onboarding_reminders 1 row 추가 확인 (사장님 본인이 새 테스트 계정 생성 후 24h 후 검증 또는 임시 sql 로 24h 시뮬)

### 롤백 trigger
- 발송 폭주 (의도와 다르게 모든 사용자에게) → cron path 변경 + INSERT row 정리
- 이메일 spam 신고 → 발송 중단 후 본문 재검토

### Resend 한도
- free 100/day. 사장님 사이트 24h~48h 전 가입자가 100 미만이라 안전.

---

## 7. 의존성·리스크

### 의존성
- Resend (기존)
- auth.users 의 created_at 정확성 (Supabase 보장)
- user_profiles 미완 정의 (age_group·region·occupation 모두 null)

### 리스크

| 리스크 | 완화책 |
|---|---|
| INSERT 후 발송 실패 시 row 만 남음 → 재시도 안 됨 | 발송 실패율 매일 확인. 대량 실패 시 수동 row 삭제 |
| race condition (cron 동시 실행) | INSERT UNIQUE PK 가 자동 차단 |
| 너무 일찍 발송 (가입 1h 후) | 24h 조건이 차단 |
| 사용자가 받기 싫어함 | 푸터에 "마이페이지에서 계정 삭제 가능" — 한 번뿐이라 spam 위험 작음 |
| Phase 6 의 health-alert cron 와 충돌 | 다른 path·다른 시간 — 충돌 0 |

---

## 8. 성공 기준

- ✅ 마이그레이션 067 prod apply
- ✅ cron 매일 11:05 KST 자동 실행
- ✅ 24h~48h 전 가입 + 미온보딩 사용자에게 1회 발송
- ✅ onboarding_reminders 테이블이 dedup 보장
- ✅ Resend 발송 성공 (free 한도 안전)
- ✅ chrome console 에러 0
