# 페이지·기능·GA4 전환 추적 맵

## 목적

기본 GA4 page_view 만으로는 “어떤 유입이 결제 전환까지 이어졌는지”와 “어떤 버튼에서 이탈했는지”를 보기 어렵다. 이 문서는 키피오 공개/회원/결제 영역의 주요 페이지와 커스텀 이벤트를 한곳에 정리한다.

관리자(`/admin`)와 `/login?next=/admin...` 운영 점검 트래픽은 기존 정책대로 GA4 전송에서 제외한다.

## 전체 페이지/기능 구조

### 공개 랜딩·탐색
- `/` 홈: 검색, 1분 진단 CTA, 추천/인기 정책, 지역 탐색, 블로그/뉴스 진입.
- `/pricing`: 무료/Basic/Pro 요금제 비교, 결제 시작 CTA.
- `/about`, `/help`, `/terms`, `/privacy`, `/refund`: 신뢰/법적 고지.
- `/search`: 통합 검색 결과와 빈 결과율 측정.
- `/popular`, `/calendar`, `/compare`, `/consult`: 탐색 보조 페이지.

### 정책/콘텐츠 SEO
- `/welfare`, `/welfare/[id]`, `/welfare/age/[age]`, `/welfare/region/[code]`: 복지 정책 목록/상세/세그먼트.
- `/loan`, `/loan/[id]`, `/loan/age/[age]`, `/loan/region/[code]`: 대출·지원 정책 목록/상세/세그먼트.
- `/policy`, `/eligibility`, `/eligibility/[slug]`, `/eligibility/cross/[income]/[household]`: 조건/자격 기반 탐색.
- `/blog`, `/blog/[slug]`, `/blog/category/[category]`, `/news`, `/news/[slug]`, `/news/keyword/[keyword]`, `/guides`, `/guides/[slug]`, `/c/[category]`: 콘텐츠 유입과 내부 전환.

### 가입·활성화
- `/signup`, `/signup/sent`, `/login`, `/forgot-password`, `/reset-password`: 인증 funnel.
- `/quiz`: 익명 1분 진단 → 가입 유도.
- `/onboarding`, `/onboarding/topics`: 가입 후 프로필 입력.
- `/recommend`: 맞춤 추천 제출/조회.
- `/alerts`: 알림 설정.

### 계정·구독·결제
- `/mypage`, `/mypage/business`, `/mypage/bookmarks`, `/mypage/notifications`, `/mypage/notifications/history`: 계정/프로필/알림 관리.
- `/mypage/billing`: 현재 구독, 카드 변경, 해지, 결제 후 activation CTA.
- `/checkout?tier=basic|pro`: 카드 등록/토스 billing auth 시작.
- `/checkout/success`: 서버 처리 후 `/mypage/billing?welcome=1`로 redirect.
- `/checkout/fail`: 카드 등록 실패 사유와 재시도 CTA.

### 관리자/운영
- `/admin/**`: 운영자 대시보드, 블로그 품질, 네이버 큐, SNS, cron, 사용자, health 등. GA4 공개 전환 분석에서 제외한다.

## 신규/정리된 GA4 이벤트

### 전역 wrapper 이벤트
- `site_page_viewed`
  - 모든 공개/회원 페이지 route change 마다 1회.
  - params: `page_path`, `page_category`, UTM context.
- `traffic_attribution_captured`
  - UTM/referrer/click id context 저장 후 route 진입 시 보조 이벤트.
  - params: `page_path`, `page_category`, UTM context.
- `cta_clicked`
  - `data-ga-event`, `data-ga-label`, `data-ga-location`, `data-ga-params`가 붙은 핵심 CTA 클릭.

### 결제 funnel 이벤트
- `pricing_viewed`: `/pricing` 진입. `source`, `recommended_tier`, `pricing_variant`.
- `pricing_plan_selected`: 유료 요금제 CTA 클릭.
- `checkout_started`: 결제 시작 클릭. 로그인 여부와 요금제 분리.
- `checkout_terms_toggled`: 약관/정기결제 체크박스 토글.
- `checkout_card_registration_clicked`: 카드 등록 버튼 클릭. 약관 미동의 block도 기록.
- `checkout_toss_redirect_failed`: Toss SDK 시작/리다이렉트 전 실패.
- `checkout_failed`: Toss fail callback. `reason`.
- `checkout_completed`: `/mypage/billing?welcome=1`에서 구독 시작 확인.
- `subscription_active`: trialing/active 시작.
- `post_checkout_activation_clicked`: 결제 직후 다음 행동 CTA.
- `subscription_cancelled`: 구독 해지 성공.

## UTM/출처 파라미터

전역 wrapper가 `localStorage`에 first/last touch를 저장하고 모든 커스텀 이벤트에 붙인다.

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_term`
- `utm_content`
- `utm_id`
- `click_id_type`: `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid` 중 감지된 값의 종류만 저장
- `click_id_present`: 광고 click id 존재 여부. 실제 click id 값은 GA4 이벤트에 보내지 않는다.
- `landing_path`
- `initial_referrer`
- `traffic_source_type`

## 현재 직접 계측한 핵심 버튼

- 홈 hero 1차 CTA: `cta_clicked`, `cta_location=home_hero_primary`.
- Pricing 무료 시작 CTA: `cta_clicked`, `cta_location=pricing_free_plan`.
- Pricing 유료 플랜 CTA: `cta_clicked` + `pricing_plan_selected` + `checkout_started`.
- Checkout 약관 체크박스: `checkout_terms_toggled`.
- Checkout 카드 등록 버튼: `checkout_card_registration_clicked`.
- Toss SDK 시작 실패: `checkout_toss_redirect_failed`.
- Billing 카드 변경: `cta_clicked`, `cta_location=billing_card_change`.
- Billing 무료 사용자 요금제 보기: `cta_clicked`, `cta_location=billing_free_user`.
- Billing 해지 의도/성공: `cta_clicked` + `subscription_cancelled`.

## 운영 팁

- GA4 맞춤 측정기준에는 최소 `page_category`, `cta_location`, `plan/tier`, `pricing_variant`, `utm_campaign`, `utm_content`, `traffic_source_type`를 등록한다.
- 결제 전환율은 `pricing_viewed → pricing_plan_selected → checkout_started → checkout_card_registration_clicked → checkout_completed` 순서로 본다.
- 다크패턴성 과잉 계측을 피하기 위해 일반 스크롤/마우스 이동/모든 버튼은 추적하지 않고, 전환 판단에 필요한 CTA와 checkout 단계만 추적한다.
