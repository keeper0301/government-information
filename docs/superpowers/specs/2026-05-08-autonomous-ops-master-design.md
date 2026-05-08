# 자율 운영 마스터 설계 (Phase 1~5)

작성일: 2026-05-08
관련 commit: af055ab (Phase 1 구현)
이전 spec: 2026-05-07-admin-automation-master-design.md (어드민 자동화 #3)

## 목적

사장님 단독 운영 keepioo 를 "최소 개입" 운영 모드로 전환. 매일 5분 → 평소 0분 (이상 시만 SMS), 매주 30분 → 매월 30분, 외부 액션도 가능한 한 위임.

## 현재 자동화 상태 (이미 도달)

- 데이터 수집·분류·정제·발송·로그·검증 모두 자동화됨
- 사장님 부담: 매일 5분 (SMS) + 매주 30분 (이메일 검수) ≈ 월 4~5시간
- 남은 개입 영역 5종: 외부 시스템·임계 결정·CS·사고 대응·비즈니스

## Phase 1: 사고 자동 진단 cron (✅ 2026-05-08 완료)

기존 `/api/cron/health-alert` (매일 09:00 KST) 를 강화 — 4종 자동 진단 + 권장 hot-fix 1줄.

**추가된 임계치**:
- `news_backlog` (≥1000) — news cron timeout / cap 부족 신호
- `press_pending` (≥10) — 광역 보도자료 검토 큐 적체 (4 layer fallback 후)
- `press_no_show` (≥36h) — press_l2_classify 흔적 없음 (Vercel cron path bug)
- `enrich_stuck` (≥100) — 외부 API 영구 skip 누적

**SMS 메시지 예시**:
```
[keepioo 운영] 2건 임계치 초과
- news 미분류 backlog 14,781건 (임계 1000+).
  → /admin/cron-trigger 에서 news-classify 수동 실행 또는
    news_classify_run audit 의 duration_ms 확인
- press_l2_classify 마지막 36h 전 (임계 36h+).
  → /admin/cron-trigger 에서 press-ingest 수동 실행 + ANTHROPIC_API_KEY 확인
```

**효과**: 사장님 SMS 만 봐도 즉시 hot-fix 액션 결정 가능. 정상 시 SMS 안 옴 (noise 0).

**환경변수 toggle**:
- `NEWS_BACKLOG_ALERT_FLOOR` (default 1000)
- `PRESS_PENDING_ALERT_FLOOR` (default 10)
- `PRESS_NO_SHOW_ALERT_HOURS` (default 36)
- `ENRICH_PERMANENT_SKIP_FLOOR` (default 100)

## Phase 2: SMS 결정 위임 (Solapi 양방향) — ✅ 코드 골격 완료

**상태**: 마이그레이션·라이브러리·webhook·unit test 모두 작성. **prod 활성화는 사장님 외부 액션 + 명시 승인 후**.

**완료된 코드** (commit pending):
- `supabase/migrations/075_decision_pending.sql` — 추적 테이블 (id·kind·prompt·context·decision·sender_phone 등)
- `lib/sms/decision-router.ts` — registerDecision / handleSmsReply / parseDecisionReply / isAllowedSender + DECISION_HANDLERS 매핑 (5 kind)
- `app/api/webhook/solapi-receive/route.ts` — HMAC-SHA256 서명 검증 + 화이트리스트 + handleSmsReply 호출
- `__tests__/lib/decision-router.test.ts` — 11 unit test (parse·whitelist·정규화)

**활성화 단계** (사장님 액션):

1. **prod DDL apply** (명시 승인 필요): `supabase/migrations/075_decision_pending.sql` apply
2. **Solapi 양방향 가입** ($1/월): Solapi 콘솔 → "양방향 SMS" 활성화
3. **수신 webhook URL 등록**: `https://www.keepioo.com/api/webhook/solapi-receive`
4. **Vercel env 3종 등록**:
   - `SOLAPI_WEBHOOK_SECRET` — Solapi 콘솔에서 발급한 webhook secret (HMAC 검증)
   - `SMS_DECISION_ALLOWED_FROM` — 사장님 휴대폰 번호 (csv 다중 가능)
   - 기존 `SOLAPI_API_KEY` / `SOLAPI_API_SECRET` 는 발송용으로 이미 등록됨
5. **테스트 시나리오**:
   - admin 페이지 또는 테스트 endpoint 에서 `registerDecision({ kind: 'dedupe_threshold_w2', prompt: '테스트', context: {} })` 호출
   - 사장님 휴대폰 SMS 수신 → "1" 답장
   - decision_pending row 갱신 + DECISION_HANDLERS 액션 result 확인

### DECISION_KINDS (현재 5종, 확장 가능)
- `dedupe_threshold_w2` / `_w3` / `_w4` — dedupe 점진 도입 임계 변경
- `spec_c_baseline_start` — welfare LLM 매칭 spec C 진입 (₩200K + 월 ₩30K)
- `news_cap_increase` — news cap 변경 (timeout audit 결과 기반)

**새 결정 추가 패턴**: `DECISION_KINDS` const 에 kind 추가 + `DECISION_HANDLERS` 에 액션 핸들러 등록 (approve 시만 호출). 위험 액션 (DDL·prod 데이터 변경) 은 spec 별도, 여기선 환경변수 toggle 같은 안전 액션만.

### 안전 가드
- **발신번호 화이트리스트**: env 미설정 시 모든 요청 reject (안전 default)
- **24h 만료**: DB level `expires_at` + cleanup cron 별도 (Phase 2.1 후속)
- **잘못된 답장 (1/2/3 외)**: 무시 (재발송 없음, 로그만)
- **HMAC-SHA256 timing-safe 검증**: timing attack 차단

### 의도

사장님 SMS 답장으로 임계 조정·승인 위임. 매주 명시 승인 (W2 dedupe / spec C 등) 을 휴대폰에서 1~2초로 처리.

**예시 흐름**:
```
[받는 SMS, 매주 화 09:00]
이번 주 dedupe 자동 confirm 5건 무작위 검수 — 모두 정상 분류.
W2 dedupe 임계 0.92 → 0.88 진행할까요?
1=승인 / 2=무시 / 3=상의

[사장님 답장]
1

[자동 처리]
DEDUPE_AUTO_CONFIRM_THRESHOLD=0.88 Vercel env 자동 등록 + Redeploy.
완료 SMS 발송.
```

### 외부 액션 (사장님 필요)

- **Solapi 양방향 SMS 가입** — Solapi 콘솔에서 "양방향" 기능 활성 ($1/월 추가)
- **수신 webhook URL 등록** — `/api/webhook/solapi-receive` (신규 endpoint)

### 코드 작업

1. `/api/webhook/solapi-receive/route.ts` — Solapi 수신 callback 처리
2. `lib/sms/decision-router.ts` — 답장 ID → 결정 액션 매핑
3. `decision_pending` 테이블 — 발송한 결정 요청 추적 (마이그레이션 신규)
4. SMS 발송 시 decision_id 함께 첨부 → 답장에 포함

### 위험·완화

- **사칭 위험**: 사장님 휴대폰 외 다른 번호에서 답장 시 reject. 발신번호 화이트리스트.
- **답장 늦음**: 24h timeout — 그 후 답장 무시 (재발송 cron)
- **잘못된 답장**: 1/2/3 외 텍스트 → 자동 응답 "1·2·3 중 선택" 안내

### 우선순위

🥈 — Phase 3 보다 먼저. SMS 양방향 1회 가입만 하면 큰 가치.

## Phase 3: 외부 콘솔 자동 점검 — ✅ 인프라 + 사이트 가용성 완료

**상태**: 인프라 + 사이트 가용성 점검 (즉시 가능, 외부 의존 0) 완료. AdSense·카카오·토스·GA4 통합은 사장님 OAuth·API key 외부 액션 후 별도 commit.

**완료된 코드**:
- `lib/external-console/types.ts` — ConsoleCheckResult / ConsoleAlert 공통 타입
- `lib/external-console/site-availability.ts` — 5 페이지 HEAD 점검 + 응답 시간 측정
- `app/api/cron/external-console-check/route.ts` — 통합 cron (Promise.allSettled 패턴 — 한 console 실패가 다른 점검 막지 않음)
- `vercel.json` — cron 등록 (매일 KST 09:30)
- `app/admin/cron-trigger/page.tsx` — UI 라벨
- `__tests__/lib/site-availability.test.ts` — 7 unit test PASS

**현재 점검 가능 (즉시 가동)**:
- **사이트 가용성** — 5 페이지 HEAD (홈·welfare·loan·news·blog) → `site_down` / `site_slow`
- **카카오 (Solapi)** — `/messages/v4/list` API 24h 통계 → `kakao_high_failure` (≥10%) / `kakao_pending_stuck` (≥10건)
- **토스** — DB subscriptions 24h funnel → `toss_high_churn` (해지 ≥ 활성 10%)
- 정상 → SMS 안 옴 (noise 0)
- env 미설정 시 자동 skip (Solapi/토스 모두 graceful degradation)

### 다음 console 통합 가이드 (사장님 외부 액션 동반)

**공통 패턴**:
1. `lib/external-console/<name>.ts` 신설 — `async function check<Name>(): Promise<ConsoleCheckResult>` export
2. `app/api/cron/external-console-check/route.ts` 의 `checks` 배열에 추가
3. 점검에 필요한 env Vercel 등록 (사장님)

#### 1단계 우선: AdSense

**옵션 A — Google AdSense Management API (권장, OAuth refresh token)**
- 사장님 외부 액션:
  1. Google Cloud Console → AdSense Management API 활성화
  2. OAuth 2.0 클라이언트 ID 생성 (Web application)
  3. https://developers.google.com/oauthplayground 에서 scope `https://www.googleapis.com/auth/adsense.readonly` 으로 refresh token 발급
  4. Vercel env: `GOOGLE_ADSENSE_CLIENT_ID` / `GOOGLE_ADSENSE_CLIENT_SECRET` / `GOOGLE_ADSENSE_REFRESH_TOKEN`
- 코드: refresh token → access token 교환 → `accounts.list` + `accounts.adclients.list` + `accounts.reports.generate` 호출
- 점검 항목: 승인 상태, 자동 광고 활성, 24h 노출/클릭/추정 수익

**옵션 B — chrome 자동화 (대안, OAuth 못 쓸 때)**
- GitHub Actions runner + Playwright + 사장님 cookies (GitHub Secret 으로 base64 저장)
- 부담 ↑, 깨지기 쉬움. 옵션 A 가 안 되는 경우만.

#### 2단계: 카카오 비즈

- 카카오 비즈 Open API 미공개 영역 — chrome 자동화 또는 Solapi 자체 API (이미 발송용으로 가입됨, 통계 endpoint 활용)
- Solapi `/messages/v4/list` API 로 24h 발송 통계·실패율 fetch (간단)
- 카카오 알림톡 템플릿 심사 상태는 Solapi 또는 카카오 비즈 콘솔 chrome 자동화 필요

#### 3단계: 토스 가맹점

- 토스 결제 API 의 거래 조회 endpoint 로 24h 결제 통계
- env: `TOSS_SECRET_KEY` (이미 결제용으로 등록)
- 정산 추세·webhook 도달 여부

#### 4단계: GA4

- Google Analytics Data API + service account 또는 OAuth refresh token
- 24h 핵심 funnel 이벤트 카운트 (signup_completed, checkout_completed, search_results_shown 등)
- 전환 이벤트 정의 누락 점검

### 안전 가드
- Promise.allSettled — 한 console 실패가 다른 점검 막지 않음
- 점검 자체 실패 (네트워크·인증 만료) 도 별도 alert 으로 처리 (`checker_error`)
- 정상 시 SMS 안 보냄 — sleeping noise 0
- 모든 점검 결과 NextResponse JSON 반환 (수동 trigger 시 즉시 진단 가능)

### 의도

사장님이 매일 들어가야 하는 외부 콘솔 (AdSense·카카오·토스·GA4·Vercel·Supabase) 을 chrome 자동화로 매일 1회 자동 점검. 이상 발견 시 SMS.

### 1단계: AdSense 콘솔 (가장 임팩트 큼)

매일 KST 09:30 cron:
1. chrome-in-chrome mcp 로 AdSense 로그인
2. "사이트" 탭 — keepioo.com 승인 상태 확인
3. "광고" 탭 — 자동 광고 활성 여부
4. "수익" 탭 — 24h 노출 수·CTR·예상 수익
5. 결과 SMS:
```
[AdSense 일일]
승인: ✅ / 자동광고: ✅
24h 노출 1,234회 / 클릭 12 / ₩340 추정
```

이상 시:
```
[AdSense 이상]
승인 거부됨 → 사유: 트래픽 부족
권장: /blog 콘텐츠 가속 + GA4 noindex 페이지 제외
```

### 2단계: 카카오 비즈 콘솔

- 알림톡 템플릿 심사 상태
- 24h 발송 통계·실패율

### 3단계: 토스 가맹점 콘솔

- 정산 상태·결제 추세
- webhook 정상 도달 여부

### 4단계: GA4 콘솔

- 24h 핵심 funnel 이벤트 카운트
- 전환 이벤트 정의 누락 점검

### 외부 액션 (사장님 필요)

- 각 콘솔 자동 로그인용 chrome 프로필 — 사장님 1회 chrome 자동화로 cookies 저장
- 또는 service account / API key 가능한 경우 별도 인증

### 코드 작업

1. `app/api/cron/external-console-check/route.ts` — 통합 cron
2. `lib/console-checks/adsense.ts`, `kakao.ts`, `toss.ts`, `ga4.ts` — 각 점검 로직
3. chrome mcp 호출 또는 Playwright 별도 워크플로우

### 위험·완화

- **콘솔 UI 변경**: 정기 selector 깨짐 → fallback selector + Sentry 알림
- **cookies 만료**: 자동 reauth 어려움 → 만료 감지 시 사장님 SMS 안내

### 우선순위

🥉 — Phase 2 다음. AdSense 1단계만 먼저 해도 큰 가치.

## Phase 4: AI 챗봇 CS 1차 응대 — ✅ Phase 4-A 완료

**상태**: 인프라 + intent 분류 + 큐 + admin 페이지 완료. RAG·SMS reminder 는 Phase 4-B/4-C 별도.

**완료된 코드** (commit pending):
- `supabase/migrations/076_support_tickets.sql` — 큐 테이블 (id·intent·status·auto_response·reply 등)
- `lib/support/intent.ts` — Claude Haiku 분류 + 9 intent + AUTO_REPLIES 매핑 + canAutoReply
- `app/api/support/submit/route.ts` — POST 접수 → 분류 → 큐 insert → 자동 응답
- `app/admin/support/page.tsx` — KPI 5종 + 답변 대기 큐 + 최근 30건 + 답변 폼
- `app/admin/support/reply-form.tsx` + `actions.ts` — 사장님 답변 server action
- `lib/admin/menu.ts` — 사이드 메뉴 "고객 문의 큐" 추가
- `__tests__/lib/support-intent.test.ts` — 12 unit test

**9 intent 분류**:
- `refund_request` (사장님 큐) / `refund_policy_question` (자동)
- `account_recovery` (자동) / `account_delete` (자동)
- `bug_report` (사장님 큐) / `feature_request` (사장님 큐)
- `policy_question` (RAG 별도) / `pricing_question` (자동)
- `other` (사장님 큐)

**자동 응답 가능 (confidence ≥ 0.7)**: 환불 정책 / 계정 복구 / 탈퇴 / 요금제 — 정해진 메시지 매핑.
**사장님 큐 (confidence < 0.7 또는 매핑 없음)**: status='open' 으로 /admin/support 표시.

### Phase 4-B: RAG 정책 검색 (다음 sub-spec)

`policy_question` intent 시 자동 정책 검색 답변. 작업:
- welfare/loan/news 임베딩 — pgvector 또는 외부 (선택)
- 사용자 query → 임베딩 매칭 top 3 → Claude 가 자연어 요약 + 매칭 url 첨부
- /api/support/submit 가 RAG 결과를 auto_response 에 채움

### Phase 4-C: SMS reminder cron (다음 sub-spec)

24h 무답변 ticket → 사장님 SMS. 작업:
- `/api/cron/support-reminder` 매일 KST 09:00 호출 (또는 health-alert 통합)
- support_tickets where status='open' AND created_at < now()-24h AND reminder_sent_at IS NULL
- SMS 발송 + reminder_sent_at update (중복 발송 방지)

### chatbot-panel 통합 (선택, 다음 spec)

기존 `components/chatbot-panel.tsx` 가 LLM 챗봇이라면 / 없으면 신규. /api/support/submit 호출하는 폼 컴포넌트 신설하면 사용자 진입점 자연.

### 의도

사용자 문의·질문·환불 요청을 Claude API + 정책 RAG 로 1차 자동 응대. 사장님 직접 응대 부담 ↓.

### 분류 + 응답 전략

| 문의 종류 | 1차 응답 | 2차 처리 |
|---|---|---|
| 정책 검색·요약 | Claude + RAG 즉시 답변 | — |
| 자격 진단 | quiz 페이지 안내 | — |
| 환불·결제 | 환불 정책 안내 + "사장님 검토 후 24h 안 답장" | admin/refund-queue 등록 |
| 계정 복구 | 자동 복구 가이드 (이메일 인증) | 실패 시 admin 큐 |
| 버그 리포트 | "확인 후 답변" + 자동 admin 큐 | Sentry 매칭 검색 |
| 기능 요청 | "검토 후 결정" + admin 큐 | 사장님 weekly 검수 |

### 코드 작업

1. 기존 `chatbot-panel.tsx` 강화 — RAG + 멀티턴 대화
2. `/api/chatbot` route 강화 — 분류 + 응답 + 큐 등록
3. `support_tickets` 테이블 — 사장님 큐 (마이그레이션 신규)
4. `/admin/support` 페이지 — 큐 목록·답변 작성·상태 변경
5. SMS 통합 — 24h 답변 안 하면 자동 reminder

### 비용

- Claude Haiku ~ $5/문의 대화 1회
- 월 100건 가정 → $5/월 (모니터링하며 cap)

### 우선순위

4번 — 트래픽 확보 후 의미 있어짐. 현재 24h 가입 0이라 우선순위 ↓.

## Phase 5: 마케팅 자동화 — ✅ Phase 5-A SEO long-tail 구현

**상태**: 5-A SEO long-tail (사장님 입력 기반 자동 글 생성) 구현. 5-B (SNS 자동 게시) / 5-C (외부 글쓰기 확장) spec.

### Phase 5-A 완료된 코드

- `lib/blog-publish.ts` — pickProgramsForKeyword + publishKeywordPost + inferCategoryFromKeyword 추가
  - 기존 publishWithCandidate (Claude 호출 + 품질 가드 + DB insert + naver-blog 큐 + WordPress) 그대로 재활용
  - keyword → 매칭 정책 검색 → top 3 candidate → 품질 가드 retry loop
- `app/admin/long-tail/page.tsx` + `long-tail-form.tsx` + `actions.ts` — 사장님 입력 폼 + 7d 발행 목록
- `lib/admin/menu.ts` — "long-tail SEO 글 생성" 메뉴 추가 (콘텐츠 그룹)

**사장님 사용 흐름**:
1. /admin/long-tail 접속
2. 부족한 검색어 입력 (예: "60대 부산 노인 의료비 지원")
3. 카테고리 자동 추정 또는 명시 선택
4. "글 생성" 클릭 → Claude 가 매칭 정책 + SEO 본문 작성 → blog_posts insert (10~20초)
5. /blog/[slug] 즉시 노출 + sitemap + IndexNow 자동
6. 매주 5~10개 입력만 하면 long-tail 트래픽 가속

**기존 publishOnePost (요일 카테고리) 와 차이**:
- 카테고리 (요일) ↔ 키워드 (사장님 입력) 진입점만 다름
- 본문 생성·품질 가드·DB insert·외부 발행은 모두 동일 (DRY)
- 다음 cron 자동 발행 (KST 15:07) 과 충돌 없음 (source_program_id 중복 방지)

### Phase 5-B: SNS 자동 게시 (다음 sub-spec)

매주 신규 발행 블로그 글을 트위터·인스타·페이스북·스레드 자동 게시.

**사장님 외부 액션**:
- 각 SNS 플랫폼 OAuth 앱 등록 + access_token 발급 (4종)
- Vercel env: TWITTER_ACCESS_TOKEN / INSTAGRAM_TOKEN / FACEBOOK_TOKEN / THREADS_TOKEN

**구현 항목**:
- `lib/sns/twitter.ts` / `instagram.ts` / `facebook.ts` / `threads.ts` — 플랫폼별 publish
- `app/api/cron/sns-publish-weekly/route.ts` — 매주 일 22:00 cron (블로그 발행 후)
- `sns_publish_log` 테이블 (마이그레이션 신규) — 중복 방지 + 통계
- 카드 자동 생성: blog_posts.cover_image + Claude 캡션 + 해시태그

### Phase 5-C: 외부 글쓰기 확장 (다음 sub-spec)

이미 가동 중인 워드프레스 자동 발행 외 다른 플랫폼 확장.

**대상 플랫폼**:
- 티스토리 (OAuth + Open API) — 한국 SEO 영향 큼
- 브런치 (인증 어려움 — 우선순위 낮음)

**구현 항목**:
- `lib/external-publish/tistory.ts` — Open API 통합
- 기존 `lib/wordpress/publisher.ts` 패턴 재활용
- blog_publish.ts 의 publishWithCandidate 끝에 외부 발행 호출 추가

### 의도

트래픽 확보 자동화. SNS 자동 게시 + SEO long-tail 신규 페이지 자동 생성.

### 1단계: SNS 자동 게시

매주 신규 발행된 블로그 글을 트위터·인스타·페이스북·스레드에 자동 게시.

- **카드 자동 생성**: 블로그 cover_image + 타이틀로 SNS 카드 PNG (이미 blog-cover.ts 가 만듦)
- **자동 캡션**: Claude 가 SEO·해시태그·CTA 포함 캡션 작성
- **OAuth 연동**: 각 플랫폼 1회 인증 + 토큰 저장

### 2단계: SEO long-tail 자동 생성

매주 1회 GA4·검색엔진 자료 분석 → 부족한 검색어 발견 → 자동 페이지 생성.

- 예: "60대 부산 노인 의료비 지원" 검색 1주 5회 발생, 매칭 페이지 X → 자동 페이지 생성
- 페이지 구성: 매칭 정책 카드 + Claude 작성 가이드 + JSON-LD FAQ

### 3단계: 외부 자동 글쓰기 확장

이미 외부 워드프레스 자동 글쓰기 가동 중 (memory 의 external_auto_publish). 같은 패턴 다른 플랫폼 (티스토리·브런치 등) 으로 확장.

### 코드 작업

신규 마이그레이션·OAuth 연동·플랫폼별 SDK 통합 등 큰 작업. 별도 sub-spec 분리.

### 외부 액션

- 각 SNS 플랫폼 OAuth 앱 등록 (사장님 1회)
- 토큰 저장·갱신 인프라 준비

### 우선순위

5번 — 가장 큰 작업. 트래픽 확보 본질이라 가치는 큼. spec C welfare LLM 매칭 (사장님 비용 동의 대기 중) 과 비슷한 우선순위. 별도 세션에서 진행.

## 진행 로드맵

| Phase | 상태 | 예상 작업량 | 외부 액션 | 비용 |
|---|---|---|---|---|
| 1 사고 자동 진단 | ✅ 완료 (2026-05-08) | — | — | $0 |
| 2 SMS 결정 위임 | spec 완료 | 1~2 commit | Solapi 양방향 가입 | +$1/월 |
| 3 외부 콘솔 자동 점검 | spec 완료 (1단계 prototype 권장) | 5+ commit | chrome 프로필 | $0 |
| 4 AI 챗봇 CS | spec 완료 | 10+ commit | — | LLM ~$5/월 |
| 5 마케팅 자동화 | spec 완료 (3 sub-phase) | 별도 spec 다수 | SNS OAuth × 4 | LLM ~$10/월 |

## 다음 세션 진행 가이드

1. **즉시 가능**: Phase 1 효과 모니터링 (다음 health-alert cron 실행 시 4 신규 임계치 정상 fire 확인)
2. **사장님 명시 승인 후**: Phase 2 (Solapi 양방향) — 코드 변경은 작지만 외부 가입 동반
3. **Phase 3 1단계 (AdSense)**: chrome 자동화 prototype — 사장님 cookies 저장 1회만 하면 가능
4. **Phase 4·5**: 별도 세션에서 sub-spec 으로 분해 진행

## 운영 안전 원칙 (불변)

- 자동 처리 결과는 admin_actions audit 로그 (회귀 추적)
- 임계치는 모두 환경변수 toggle (1분 rollback)
- 외부 액션 대행 시 사장님 cookies·토큰은 Vercel env (RLS 외 저장 X)
- 사고 자동 진단은 권장 hot-fix 만, 자동 적용은 W1~W4 점진 도입 같은 명시 spec 만
