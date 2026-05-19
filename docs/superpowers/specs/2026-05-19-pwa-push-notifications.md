# PWA 푸시 알림 시스템 spec (2026-05-19)

> **작성일**: 2026-05-19
> **목적**: 사장님 사이트 사용자가 매일 새 정책 알림 받음 (이메일·SMS 외 채널 확대)
> **비용**: VAPID 자체 무료, Web Push API 무료
> **사장님 외부 액션**: VAPID keys 생성 + Vercel env 3종 (15분)

## 1. 사고 동기

기존 알림 채널:
- 이메일 — 사장님이 inbox 안 보는 경향
- SMS (Solapi) — 잔액 의존, 가끔 disabled
- 카카오톡 알림톡 — v3 활성, 단 사용자 카카오 친구 추가 필요

**PWA 푸시 장점**:
- 사용자 브라우저 권한 1회 동의로 영구
- 비용 0 (Web Push API 무료)
- 사용자 카카오·SMS 의존 X

## 2. Architecture

```
[사용자 사이트 방문] → 알림 권한 요청
                  ↓
       service worker (public/sw.js) 등록
                  ↓
       subscription (endpoint + p256dh + auth) 생성
                  ↓
       POST /api/push/subscribe
                  ↓
       Supabase push_subscriptions row INSERT
                  ↓
[사장님 정책 발행 시] → /api/push/send (admin)
                    ↓
       push_subscriptions row 순회
                    ↓
       Web Push API → 사용자 device
```

## 3. 사장님 외부 액션 (15분)

### Step 1 — VAPID keys 생성
```bash
npx web-push generate-vapid-keys
```
출력: publicKey + privateKey

### Step 2 — Vercel env 등록 (3종)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (publicKey, Production)
- `VAPID_PRIVATE_KEY` (privateKey, Production, sensitive)
- `VAPID_SUBJECT` = `mailto:keeper0301@gmail.com`

### Step 3 — DDL apply (사장님 명시 승인 필요)
```sql
-- migrations/091_push_subscriptions.sql
CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  last_sent_at timestamptz
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
```

사장님 "DDL 091 apply" 명시 후 supabase MCP apply.

### Step 4 — Redeploy + 사용자 권한 동의 UI
첫 사용자 만 권한 요청 (5/19~).

## 4. 코드 구현 (이번 commit)

### 4-1. `public/sw.js` — Service Worker
push 이벤트 수신 + notification 표시.

### 4-2. `lib/push/subscribe.ts` — server-side 구독 관리
- subscribeUser(user_id, endpoint, p256dh, auth_key, user_agent)
- listSubscriptions()
- removeSubscription(endpoint)

### 4-3. `app/api/push/subscribe/route.ts`
POST endpoint — frontend 가 호출.

### 4-4. `app/api/push/send/route.ts` (admin only)
사장님 푸시 발송.

### 4-5. `components/push-permission-prompt.tsx`
사용자 권한 동의 UI (선택, 다음 commit).

## 5. 사장님 발송 시나리오 (W2)

- 매일 새 정책 1건 자동 발송
- 사장님 admin 페이지에서 수동 발송
- A/B 테스트 — 발송 시간대별 클릭률 비교

## 6. 회귀 안전망

- 사용자 권한 거부 시 graceful (구독 row 안 생김)
- VAPID env 미설정 시 service worker 등록 안 함
- DB 실패 시 graceful (사이트 가동 영향 0)
- 사용자 unsubscribe 시 endpoint DELETE

## 7. 우선순위

W1 (이번 commit): spec + service worker + subscribe endpoint + 코드 prep
W2 (다음): 사용자 동의 UI + admin 발송 페이지 + 매일 자동 발송 cron

## 참조
- Web Push API: https://web.dev/articles/notifications
- VAPID: https://datatracker.ietf.org/doc/html/rfc8292
