# AdSense 검수 결과 Gmail 자동 파싱 spec (D 옵션, 보강)

> **작성일**: 2026-05-18
> **상태**: 사장님 Gmail OAuth 등록 액션 대기 — 코드 미작성
> **목적**: AdSense Management API state 전환 감지 (commit 7d34fc2) 와 더불어 keeper0301@gmail.com 의 AdSense 이메일 자동 파싱 → 2 채널 검수 결과 모니터링

## 배경

5/18 AdSense 재신청 후 검수 5~14일. 결과 통보:
1. AdSense 콘솔 `account.state` 전환 — 신규 cron `adsense-review-watch` 가동 (commit 7d34fc2)
2. `keeper0301@gmail.com` 으로 Google 알림 이메일 도착 — **현 미감지**

이메일 발신: `noreply-googleads@google.com` 또는 `adsense-noreply@google.com`

이메일 제목 keyword:
- "AdSense 사이트 승인" / "AdSense site approved"
- "AdSense 거절" / "AdSense not approved"
- "정책 위반" / "policy violation"

## D 옵션 구현 spec (사장님 OAuth 등록 후)

### Phase 1 — Gmail OAuth 등록 (사장님 외부 액션)

1. https://console.cloud.google.com → keepioo 프로젝트 → API 사용 설정 → **Gmail API**
2. OAuth 2.0 Client ID 생성 (Web application)
3. Authorized redirect URI: 사장님 메모리 [OAuth 3종 완전 마무리 2026-05-11] 의 redirect 패턴 동일
4. https://developers.google.com/oauthplayground 에서 scope `https://www.googleapis.com/auth/gmail.readonly` 로 refresh_token 발급
5. Vercel env 등록:
   - GMAIL_CLIENT_ID
   - GMAIL_CLIENT_SECRET
   - GMAIL_REFRESH_TOKEN

### Phase 2 — 코드 구현 (사장님 OAuth 등록 후)

#### `lib/external-console/gmail-adsense-watch.ts` (신규)

```typescript
// gmail.users.messages.list ?q="from:noreply-googleads@google.com newer_than:1d"
// 또는 q="from:adsense-noreply@google.com"
// 결과 message[].id 별로 messages.get → subject 추출
//
// 제목 keyword 매칭 → 승인/거절/경고 분류
// admin_actions.adsense_gmail_match audit + sendOpsAlertMultichannel
```

#### `app/api/cron/adsense-gmail-watch/route.ts` (신규)

- 매일 KST 10:10 (`10 1 * * *`) — adsense-review-watch (10:05) 와 5분 간격
- gmail-adsense-watch 호출 → 신규 이메일 감지 시 알림
- audit: `admin_actions.adsense_gmail_match` (sender, subject, snippet)

#### `lib/admin-actions.ts`

- AdminActionType 에 `adsense_gmail_match` 추가
- ACTION_LABELS 에 "AdSense Gmail 자동 파싱" 매핑

#### `vercel.json`

```json
{ "path": "/api/cron/adsense-gmail-watch", "schedule": "10 1 * * *" }
```

#### 회귀 안전망

- 동일 message_id 중복 알림 방지: admin_actions audit 의 message_id 매칭으로 dedup
- OAuth env 미설정 시 graceful skip (kakao.ts·adsense.ts 패턴)
- API rate limit: 일 1회 호출 (검수 14일이라 일 1회 충분)

## 우선순위

1. **현 commit 7d34fc2 가동 후 1주 효과 검증** — adsense-review-watch state 전환 감지가 충분히 신뢰 가능하면 D 옵션 불필요할 수 있음
2. AdSense state 전환과 이메일 도착 시점 차이 (state 가 늦게 전환되는 경우 이메일이 먼저) 가 명백할 때 D 옵션 진행

## 참조

- 코드 (이미 가동): `app/api/cron/adsense-review-watch/route.ts` (commit 7d34fc2)
- 메모리: [[keepioo-oauth-complete-2026-05-11]] — OAuth 3종 등록 패턴
- 메모리: [[keepioo-adsense-resubmission-failed-2026-05-18]] — 5/18 재신청 + 검수 대기
