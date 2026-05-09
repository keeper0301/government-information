# GA4 OAuth 발급 가이드 (사장님용)

자율 운영 마스터 Phase 3 외부 콘솔 점검에 GA4 통합하려면 OAuth 자격 4종 (`GA4_PROPERTY_ID` + `GA4_CLIENT_ID` + `GA4_CLIENT_SECRET` + `GA4_REFRESH_TOKEN`) 이 필요합니다. AdSense 가이드와 거의 동일 (1회 30분).

## 왜 필요한가

매일 KST 09:30 cron 이 GA4 24h 트래픽·세션·이탈률을 자동 점검 → **사용자 0명 / 이탈률 90%+ 시 SMS**. 사장님이 GA4 대시보드 매일 안 들어가도 트래픽 사고 즉시 인지.

## 사전 조건

- GA4 property 생성 + 측정 ID (G-XXXXXXXXXX) 사이트 적용 완료
- Property ID 확인 가능 (Admin → Property Settings → Property ID, 9자리 숫자)

## Step 1 — Google Cloud 프로젝트 + Analytics Data API 활성화

AdSense 와 같은 Google Cloud 프로젝트 (`keepioo-adsense`) 재사용 가능 — 새로 만들 필요 X.

1. https://console.cloud.google.com 접속 → 프로젝트 선택 (`keepioo-adsense` 또는 새 프로젝트)
2. ☰ → "API 및 서비스" → "라이브러리"
3. 검색 "Google Analytics Data API" → 클릭 → **사용** 버튼

## Step 2 — OAuth 2.0 Client ID

AdSense 발급 시 만든 OAuth Client ID (`keepioo-adsense-cron`) **그대로 재사용 가능**. AdSense env 의 CLIENT_ID/SECRET 그대로 GA4 env 에도 등록하면 됨. (다른 Client 만들어도 OK)

→ 새 Client 만드는 경우만 다음 단계.

1. "사용자 인증 정보" → "+ 사용자 인증 정보 만들기" → "OAuth 클라이언트 ID"
2. 애플리케이션 유형: **데스크톱 앱**
3. 이름: `keepioo-ga4-cron`
4. 만들기 → 클라이언트 ID + 클라이언트 보안 비밀번호 복사

## Step 3 — refresh_token 발급 (OAuth Playground)

AdSense 와 동일 흐름. **scope 만 다름**.

1. https://developers.google.com/oauthplayground 접속
2. ⚙️ → "Use your own OAuth credentials" 체크 → CLIENT_ID + SECRET 입력
3. 좌측 사이드 입력창 아래 **"Input your own scopes"** 텍스트박스에 다음 입력:
   ```
   https://www.googleapis.com/auth/analytics.readonly
   ```
4. "Authorize APIs" → Google 로그인 → GA4 가 등록된 계정 선택 → 동의
5. "Step 2: Exchange authorization code for tokens" 자동 진행
6. **Refresh token** 복사 (1회만 표시)

## Step 4 — Vercel 환경변수 등록

1. https://vercel.com/keeper0301-8938s-projects/government-information/settings/environment-variables
2. "Add Environment Variable" 클릭. 4개 차례:
   - `GA4_PROPERTY_ID` = (사전 조건의 9자리 숫자, sensitive OFF)
   - `GA4_CLIENT_ID` = (Step 2, sensitive OFF)
   - `GA4_CLIENT_SECRET` = (Step 2, sensitive ON)
   - `GA4_REFRESH_TOKEN` = (Step 3, sensitive ON)
3. Environments: Production + Preview 모두
4. Save → Redeploy

## Step 5 — 검증

Redeploy 완료 후 (~2분):

1. /admin/autonomous 접속
2. Phase 3 카드의 "통합 console" 에 `+GA4` 표시되면 성공

## 비용

- Analytics Data API: 무료 (요청 한도 일 25,000 — cron 1회/일 충분)

## 보안

- `analytics.readonly` scope — 읽기만 가능, 데이터 수정 불가
- refresh_token 만료: AdSense 와 동일 (6개월 미사용)

## 트러블슈팅

| 에러 | 원인 | 해결 |
|---|---|---|
| `GA4 403` | API 활성화 안 됨 또는 property 권한 없음 | Step 1 + GA4 Admin → Property Access Management 확인 |
| `GA4 404` | GA4_PROPERTY_ID 오타 | Property Settings 에서 9자리 숫자 재확인 |
| `token refresh 401` | refresh_token 만료 또는 권한 철회 | Step 3 재실행 |
| `ga4_no_traffic` 매일 | 측정 ID 미적용 또는 광고 차단 확장 | 사이트에 G-XXX 코드 삽입 확인 |
