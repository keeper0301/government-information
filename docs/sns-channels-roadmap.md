# SNS 채널 로드맵 (2026-05-17)

keepioo.com 의 SNS 자동 발행 채널 가동 상태와 신규 채널 도입 우선순위를
한 곳에 정리. 사장님이 자율 운영 hub `/admin/autonomous` 에서 현재 상태를
보고, 이 문서로 다음 액션을 결정.

## 현재 가동 중 (5 채널)

| 채널 | 발행 트리거 | 상태 점검 |
|------|------------|-----------|
| **Twitter (X)** | sns-publish-blog cron (매일 KST 11:00) + sns-publish-popular-policy cron (매주 월 KST 10:00) | env 4개 (TWITTER_API_KEY/SECRET + ACCESS_TOKEN/SECRET) |
| **Facebook** | 동일 | env 2개 (FACEBOOK_PAGE_ID + PAGE_ACCESS_TOKEN) |
| **Threads** | 동일 | env 2개 (THREADS_USER_ID + THREADS_ACCESS_TOKEN, Instagram OAuth 와 같은 token 재사용 가능) |
| **Instagram** | instagram-publish cron (매시간, DB-based OAuth) | instagram_oauth_tokens DB row + 시간대·cap·ramp-up |
| **Naver Blog** | 사장님 PC Chrome Extension (Vercel 차단으로 pivot) | 본체 PC 24/7 가동 |

각 채널 발행 결과는 `admin_actions` 테이블 audit + `/admin/autonomous` SnsPublishCard 에 30일 통계.

## 신규 채널 도입 후보 분석

### ⚠️ KakaoStory — 권장 안 함 (deprecated)

KakaoStory 는 2020년 이후 신규 OAuth 발급 사실상 중단. 비즈 채널 등록도 어려움.
**대안**: 이미 가동 중인 Kakao 알림톡 (Solapi) 으로 회원 대상 푸시 — 사장님이 활용 가능.
- 비용: Solapi 알림톡 ~10원/건
- 가동 조건: 사장님 카카오 비즈 채널·템플릿 심사 통과 (memory reference_kakao_business)

### ⚠️ LinkedIn — 우선순위 낮음

LinkedIn 한국 사용자 = ~300만 (X 의 1/8). keepioo.com 타겟 (복지/정책 정보) 과 매치 ↓.
**대안**: 직장인 cohort 사용자 ↑ 시 재검토.
- OAuth 발급 난이도: 중 (Marketing Developer Platform 신청 필요)
- env: LINKEDIN_PERSON_URN + LINKEDIN_ACCESS_TOKEN

### ✅ 권장 다음 작업 (코드 없이 가치 ↑)

1. **현재 5 채널 env 미설정 우선 해결** — `/admin/autonomous` SnsEnvGuide 에서 부족한 env 확인 후 발급
2. **Threads 즉시 가동** — Instagram OAuth 와 같은 Meta token 재사용 가능. 사장님 외부 액션 0~1
3. **B 2차 SnsPublishCard 1주 모니터링** — 어느 채널이 실제 트래픽 만드는지 데이터로 결정

## 채널별 발급 1줄 가이드

### Twitter
1. https://developer.x.com — Developer Portal 가입 (Free tier OK)
2. App 생성 → Settings → User authentication settings → Read+Write 권한
3. Keys and tokens 탭 → API Key/Secret + Access Token/Secret 4개 발급
4. Vercel env 등록 (Production + Preview 양쪽)

### Facebook
1. https://developers.facebook.com — Meta for Developers 가입
2. 앱 생성 → Facebook Login + Pages API 추가
3. Page Access Token (장기) 발급 → keepioo 페이지 선택
4. Vercel env 등록 (FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN)

### Threads
1. Meta for Developers — Threads API access (Instagram 과 같은 Meta 앱)
2. THREADS_USER_ID = @keepioo_official Instagram user id (이미 보유)
3. THREADS_ACCESS_TOKEN = Instagram graph API token (재사용)
4. Vercel env 등록

### Instagram
1. `/admin/instagram-oauth` 에서 OAuth flow 진행 (메모리 project_keepioo_instagram_oauth_phase1_2026_05_11)
2. instagram_oauth_tokens 테이블에 row 자동 저장
3. 별도 env 등록 불필요

## 액션 우선순위 (사장님)

1. **즉시**: 5 채널 중 미설정 채널 env 발급 (autonomous hub 참고)
2. **1주 후**: SnsPublishCard 30일 데이터로 실제 효과 검증
3. **재검토**: LinkedIn / KakaoStory 는 사용자 cohort 추세 변화 시 (현재는 권장 안 함)
