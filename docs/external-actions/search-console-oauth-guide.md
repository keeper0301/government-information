# Search Console OAuth 발급 가이드 (사장님용)

자율 운영 마스터 Phase 3 외부 콘솔 점검에 Search Console 통합하려면 OAuth 자격 4종 (`SC_SITE_URL` + `SC_CLIENT_ID` + `SC_CLIENT_SECRET` + `SC_REFRESH_TOKEN`) 이 필요합니다. AdSense·GA4 가이드와 동일 패턴 (1회 30분).

## 왜 필요한가

매일 KST 09:30 cron 이 Search Console 최근 3일 클릭·노출·CTR·평균 순위를 자동 점검 → **클릭 0 (색인 사고 의심) / CTR < 0.5% (제목 매력 저하) 시 SMS**.

특히 **AdSense 재거절 시 원인 추적**에 핵심:
- AdSense 거절 → 색인 제외 가능성 의심 → Search Console 데이터로 즉시 확인
- 검색 트래픽 사고 → keepioo 가입·노출 모두 감소 → 큰 사고 사전 차단

## 사전 조건

- Search Console 에 keepioo.com 사이트 등록 + 소유권 확인 완료 (이미 됨)
- Property type 확인:
  - **Domain property** (sc-domain:keepioo.com): 모든 sub·protocol 통합
  - **URL prefix property** (https://www.keepioo.com/): 단일 prefix 만

## Step 1 — Google Cloud 프로젝트 + Search Console API 활성화

AdSense·GA4 와 같은 Google Cloud 프로젝트 (`keepioo-adsense`) 재사용 가능 — 새로 만들 필요 X.

1. https://console.cloud.google.com 접속 → 프로젝트 선택 (`keepioo-adsense` 또는 새 프로젝트)
2. ☰ → "API 및 서비스" → "라이브러리"
3. 검색 "Google Search Console API" → 클릭 → **사용** 버튼

## Step 2 — OAuth 2.0 Client ID

AdSense·GA4 발급 시 만든 OAuth Client ID (`keepioo-adsense-cron`) **그대로 재사용 가능**. AdSense·GA4 env 의 CLIENT_ID/SECRET 그대로 SC env 에도 등록하면 됨.

→ 새 Client 만드는 경우만:
1. "사용자 인증 정보" → "+ 사용자 인증 정보 만들기" → "OAuth 클라이언트 ID"
2. 애플리케이션 유형: **데스크톱 앱**
3. 이름: `keepioo-search-console-cron`
4. 만들기 → 클라이언트 ID + 클라이언트 보안 비밀번호 복사

## Step 3 — refresh_token 발급 (OAuth Playground)

AdSense·GA4 와 동일 흐름. **scope 만 다름**.

1. https://developers.google.com/oauthplayground 접속
2. ⚙️ → "Use your own OAuth credentials" 체크 → CLIENT_ID + SECRET 입력
3. 좌측 사이드 입력창 아래 **"Input your own scopes"** 텍스트박스에 다음 입력:
   ```
   https://www.googleapis.com/auth/webmasters
   ```
   - 조회만 할 때는 `webmasters.readonly`도 가능하지만, sitemap 제출 자동화까지 쓰려면 반드시 `webmasters`가 필요합니다.
4. "Authorize APIs" → Google 로그인 → Search Console 가 등록된 계정 선택 → 동의
5. "Step 2: Exchange authorization code for tokens" 자동 진행
6. **Refresh token** 복사 (1회만 표시)

## Step 4 — Vercel 환경변수 등록

1. https://vercel.com/keeper0301-8938s-projects/government-information/settings/environment-variables
2. "Add Environment Variable" 클릭. 4개 차례:
   - `SC_SITE_URL` = `sc-domain:keepioo.com` (Domain property 인 경우, sensitive OFF)
     - 또는 `https://www.keepioo.com/` (URL prefix property, 끝에 / 필수)
   - `SC_CLIENT_ID` = (Step 2, sensitive OFF)
   - `SC_CLIENT_SECRET` = (Step 2, sensitive ON)
   - `SC_REFRESH_TOKEN` = (Step 3, sensitive ON)
3. Environments: Production + Preview 모두
4. Save → Redeploy

## Step 5 — 검증

Redeploy 완료 후 (~2분):

1. /admin/autonomous 접속
2. Phase 3 카드의 "통합 console" 에 `+Search Console` 표시되면 성공
3. 다음 KST 09:30 cron 부터 자동 점검 가동 (또는 /admin/cron-trigger 에서 수동 trigger 가능)

## 비용

- Search Analytics API: 무료 (요청 한도 일 1,200 — cron 1회/일 충분)

## 보안

- `webmasters` scope — Search Analytics 조회 + sitemap 제출 가능
- `webmasters.readonly` scope — 읽기만 가능, sitemap 제출 불가
- refresh_token 만료: AdSense·GA4 와 동일 (6개월 미사용 시)

## 트러블슈팅

| 에러 | 원인 | 해결 |
|---|---|---|
| `Search Console 403` | API 활성화 안 됨 또는 사이트 권한 없음 | Step 1 + Search Console 사이트 추가·소유권 확인 |
| `Search Console 404` | SC_SITE_URL 형식 오타 | `sc-domain:keepioo.com` 또는 `https://www.keepioo.com/` (끝 / 필수) |
| `token refresh 401` | refresh_token 만료 또는 권한 철회 | Step 3 재실행 |
| `sc_no_clicks` 매일 | 색인 제외 또는 robots.txt 차단 | Search Console → 색인 생성 범위 + robots.txt 확인 |
