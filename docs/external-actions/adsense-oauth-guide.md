# AdSense OAuth 발급 가이드 (사장님용)

자율 운영 마스터 Phase 3 외부 콘솔 점검에 AdSense 통합하려면 OAuth 자격 3종 (`ADSENSE_CLIENT_ID` / `ADSENSE_CLIENT_SECRET` / `ADSENSE_REFRESH_TOKEN`) 이 필요합니다. 1회 30분 작업으로 영구 가동 (refresh_token 만료 없음).

## 왜 필요한가

매일 KST 09:30 cron 이 AdSense 계정 상태와 24h 수익을 자동 점검하고, 이상 시 (계정 정지·수익 0 등) SMS 알림. 사장님이 AdSense 콘솔 매일 안 들어가도 문제 즉시 인지.

## 사전 조건

- AdSense 계정 승인 완료 (pub-... 형식 publisher ID 보유)
- Google Cloud Console 접근 가능 (gmail 계정으로 자동 로그인)

## Step 1 — Google Cloud 프로젝트 + AdSense API 활성화

1. https://console.cloud.google.com 접속
2. 상단 프로젝트 선택 → "새 프로젝트" → 이름 `keepioo-adsense` → 만들기
3. 좌측 메뉴 ☰ → "API 및 서비스" → "라이브러리"
4. 검색 "AdSense Management API" → 클릭 → **사용** 버튼 클릭

## Step 2 — OAuth 2.0 Client ID 발급

1. 좌측 "API 및 서비스" → "사용자 인증 정보" 클릭
2. 상단 "+ 사용자 인증 정보 만들기" → "OAuth 클라이언트 ID"
3. 처음 발급이면 동의 화면 구성 먼저 (User Type: 외부 → 앱 이름 `keepioo` → 사용자 지원 이메일 입력 → 저장)
4. 다시 "OAuth 클라이언트 ID 만들기"
5. 애플리케이션 유형: **데스크톱 앱**
6. 이름: `keepioo-adsense-cron`
7. 만들기 → **클라이언트 ID + 클라이언트 보안 비밀번호** 표시됨 (둘 다 복사해 따로 저장)
   - 이 두 값이 `ADSENSE_CLIENT_ID` + `ADSENSE_CLIENT_SECRET`

## Step 3 — refresh_token 발급 (OAuth Playground)

1. https://developers.google.com/oauthplayground 접속
2. 우측 상단 ⚙️ (설정 톱니) 클릭
3. "Use your own OAuth credentials" 체크 → 위 Step 2 의 ID + Secret 입력 → 저장
4. 좌측 사이드 "Step 1: Select & authorize APIs"
5. 검색창에 `https://www.googleapis.com/auth/adsense.readonly` 입력 → 직접 붙여넣기
6. "Authorize APIs" 클릭 → Google 로그인 → AdSense 계정 선택 → 권한 동의
7. "Step 2: Exchange authorization code for tokens" 자동 진행
8. 표시된 **Refresh token** 복사 (1회만 표시! 못 보면 1~7 다시)
   - 이 값이 `ADSENSE_REFRESH_TOKEN`

## Step 4 — Vercel 환경변수 등록

1. https://vercel.com/keeper0301-8938s-projects/government-information/settings/environment-variables 접속
2. "Add Environment Variable" 클릭. 3개 차례:
   - `ADSENSE_CLIENT_ID` = (Step 2 의 ID, sensitive 토글 OFF — 길지만 비밀 아님)
   - `ADSENSE_CLIENT_SECRET` = (Step 2 의 Secret, sensitive ON)
   - `ADSENSE_REFRESH_TOKEN` = (Step 3 의 Refresh token, sensitive ON)
3. Environments: Production + Preview 모두 체크
4. Save → "A new deployment is needed" 나오면 Redeploy

## Step 5 — 검증

Redeploy 완료 후 (~2분):

1. /admin/autonomous 접속
2. Phase 3 카드의 "통합 console" 에 `사이트+...+AdSense` 표시되면 성공
3. 매일 KST 09:30 cron 자동 가동 (수동 trigger 도 가능 — Vercel 콘솔 또는 텔레그램 봇)

## 비용

- AdSense Management API: 무료 (요청 한도 일 1만 — cron 1회/일 충분)
- Vercel function 비용: 미미 (cron 1회 ~5초)

## 보안

- refresh_token 자체가 영구 인증 — Vercel sensitive env 외 절대 노출 X
- 만료 가능 (사용자가 권한 철회·6개월 미사용 등) — alert 자동 표시 (`adsense_fetch_failed`)
- 만료 시 Step 3 만 재실행 (Step 1·2 재사용)

## 트러블슈팅

| 에러 | 원인 | 해결 |
|---|---|---|
| `token refresh 401` | client_id/secret 불일치 또는 refresh_token 만료 | env 재확인 → Step 3 재실행 |
| `AdSense 403` | API 활성화 안 됨 | Step 1 재확인 |
| `AdSense 계정 없음` | 계정 승인 보류 또는 publisher ID 미연결 | AdSense 콘솔에서 계정 상태 확인 |
| `adsense_fetch_failed` 매일 | refresh_token 6개월 미사용 만료 | Step 3 재실행 |
