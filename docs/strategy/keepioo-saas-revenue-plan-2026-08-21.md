# keepioo SaaS·수익창출 플랜 — 2026-08-21

## 결론

키피오의 첫 수익화는 **광고가 아니라 “자영업자 정책 마감·자격 알림 SaaS”** 로 잡는다. 이미 코드에 `free/basic/pro`, `/pricing`, TossPayments, 마감 알림, business profile, policy monitor 자산이 있으므로 **신규 대형 제품보다 결제 가능한 1개 문제를 선명하게 묶는 것** 이 우선이다.

## 북극성

- 90일 목표: 유료 100명 또는 MRR 50만 원
- 1차 ICP: 1인 자영업자·소상공인·프리랜서 사업자
- 구매 이유: “내가 받을 수 있는 돈/대출/세금 혜택을 놓치지 않기”
- 핵심 약속: “지역·업종·마감 기준으로 사장님에게 해당 가능성 높은 정책만 알려준다”

## 현재 자산

- 요금제 코드: `lib/subscription.ts`
  - Free / Basic 4,900원 / Pro 9,900원
  - feature gate: recommend, email_alarm, sms, ai_unlimited
- 전환 페이지: `app/pricing/page.tsx`
- 결제 후보: `app/checkout`, `app/mypage/billing`, TossPayments dependency
- 프로필/자격 데이터: `app/mypage/business`, `app/api/business-profile`
- 알림 자산: `app/alerts`, `app/api/alarm`, `app/api/alert-dispatch`
- 콘텐츠/SEO 자산: welfare/loan/guides/news/region pages
- B2B/콘텐츠 후보: `app/policy-monitor/page.tsx`, AIHub policy monitor export

## 포지셔닝

### 한 줄

**사장님 정책 마감 알림 SaaS — 내 업종·지역에 맞는 지원금·대출·세금 혜택을 놓치지 않게.**

### 팔지 않을 것

- “AI가 모든 정책을 대신 신청” — 과장 위험
- “100% 받을 수 있음” — 법/자격 리스크
- “정부 공식 대행” — 신뢰 리스크

### 팔 것

- 마감 알림
- 자격 확인 체크포인트
- 신청 준비물 체크리스트
- 정책별 원문 링크와 확인 가이드
- 사장님 상황 기반 우선순위

## 수익 모델 우선순위

### 1순위 — B2C Micro-SaaS 구독

| 플랜 | 가격 | 누구 | 핵심 가치 |
|---|---:|---|---|
| Free | 0원 | 탐색 사용자 | 검색, 지역/업종 정책 보기, AI 상담 제한 |
| Basic | 4,900원/월 | 일반 사장님 | 사업자 프로필 기반 정책 매칭 + 이메일 마감 알림 |
| Pro | 9,900원/월 | 적극 신청자 | 알림톡/SMS, AI 신청 준비 초안, 상담 제한 완화 |

첫 매출은 Basic 중심. Pro는 나중에 “신청서 초안/알림톡”이 안정화되면 강화한다.

### 2순위 — 리드/제휴 수익

- 세무사/노무사/정책자금 컨설턴트 연결
- 수수료 방식: 상담 예약 1건당 CPA 또는 월 스폰서
- 단, 신뢰도 보호를 위해 “광고/제휴” 표시 필수

### 3순위 — B2B 데이터/모니터링

- 대상: 지역 소상공인 센터, 세무사무소, 프랜차이즈 본사, 창업 커뮤니티
- 상품: 지역 정책 마감 캘린더, 키워드 export, 주간 리포트
- 가격: 5만~30만 원/월
- 현재 `policy-monitor/export.json`, `export.csv`를 seed로 발전 가능

### 4순위 — 광고/AdSense

- 보조 수익만.
- AdSense 승인 전에는 review surface 보호가 우선.
- 광고 때문에 SaaS 전환 흐름을 해치지 않는다.

## 30일 실행 플랜

### Week 1 — 결제 가능한 가치 명확화

목표: “왜 4,900원을 내는지”를 한 화면에서 설명.

작업:
1. `/pricing` 카피 수정
   - Basic CTA: “내 사업자 정책 알림 시작”
   - Pro CTA: “신청 준비까지 도움받기”
2. `/mypage/business` 입력 항목을 수익화 중심으로 정리
   - 지역, 업종, 사업자 형태, 직원 수, 창업 시점, 관심 분야
3. Free limit 명확화
   - 무료: AI/추천 1일 5회
   - Basic: 관심 정책/마감 알림 무제한
4. 전환 이벤트 정의
   - pricing_viewed
   - business_profile_completed
   - alert_created
   - checkout_started
   - payment_completed

성공 기준:
- 결제 전 퍼널이 끊기지 않음
- 신규 사용자 1명이 business profile → alert 생성까지 self-serve 가능

### Week 2 — Basic MVP 완성

목표: Basic 4,900원 결제 이유를 실제 기능으로 증명.

작업:
1. Basic gate 점검
   - 마감 이메일 알림
   - 관심 정책 무제한
   - business profile 기반 추천
2. 결제 dry-run/readback
   - checkout → success → subscription active
   - mypage billing에서 현재 플랜 표시
3. 정책 매칭 품질 개선
   - 지역/업종/benefit tag 기반 TOP 5
   - 자격 모호 시 “확인 필요” 표시
4. 운영자 대시보드
   - 결제 사용자 수
   - alert 생성 수
   - 마감 알림 발송 수

성공 기준:
- Basic 결제 1건 end-to-end 가능
- 결제 후 사용자가 체감하는 unlock이 1개 이상 있음

### Week 3 — 유입/전환 실험

목표: 인스타/Threads/SEO에서 Basic 전환을 만든다.

채널:
1. Instagram Reels
   - CTA: “댓글에 지역 남기면 받을 정책 알려드림”
   - DM draft는 검토 게이트 유지
2. Threads
   - 자영업자 실제 상황형 글
   - CTA: “마감 알림은 키피오에서 설정”
3. SEO guides
   - 정책별 하단 CTA: “내 지역 마감 알림 받기”
4. Naver blog
   - 승인/검토 게이트 유지
   - top CTA는 keepioo backlink로 명확히

실험 3개:
- A: “지원금 놓치지 않기” 후크
- B: “마감 7일 전 알림” 후크
- C: “내 업종 자격 체크” 후크

성공 기준:
- pricing CTR 2%+
- business profile completion 20명+
- checkout started 3건+

### Week 4 — 유료화 판단

목표: 유지할 모델/버릴 모델 결정.

체크:
- Free→Profile 완료율
- Profile→Alert 생성율
- Alert→Pricing 진입율
- Pricing→Checkout 진입율
- Checkout→결제 완료율
- 환불/해지 사유

결정:
- 결제 3건 이상: Basic 강화
- checkout 10건 이상, 결제 0건: 가격/신뢰/결제 UX 문제
- profile 20건 미만: 유입/온보딩 문제
- alert 생성 적음: 핵심 가치 전달 실패

## 90일 로드맵

### 0~30일: Basic MVP

- 결제 플로우 안정화
- 마감 알림/프로필 기반 추천 선명화
- SNS/SEO CTA 연결

### 31~60일: Pro 가치 추가

- 알림톡 또는 SMS
- AI 신청 준비 체크리스트
- 서류 준비물 자동 정리
- 정책별 “내 상황에서 확인할 질문 5개”

### 61~90일: B2B/제휴 실험

- 세무사/노무사 lead partner 3곳
- 지역 정책 리포트 샘플 PDF
- `policy-monitor` export를 “주간 정책 레이더”로 상품화

## 가격 전략

초기 가격은 유지한다.

- Basic 4,900원: 심리적 진입 낮음
- Pro 9,900원: 알림톡/SMS/신청서 초안이 붙은 뒤 의미 있음

할인:
- 첫 달 0원보다 “첫 달 1,000원”이 낫다. 완전 무료는 결제 의지를 검증하지 못함.
- 인스타 유입에는 `KEEPER1000` 같은 쿠폰 가능.

## MVP 범위

### 반드시 포함

- 사업자 프로필
- 맞춤 정책 추천 TOP 5
- 관심 정책 저장
- 마감 7일 전 이메일 알림
- Toss 결제 active readback
- 내 구독 페이지

### 제외

- 자동 신청 대행
- 전화 상담 예약 자동화
- SMS 대량 발송
- 정책자금 전문가 매칭 자동 배정
- 라이브 SNS 자동 DM 발송

## 리스크와 대응

| 리스크 | 대응 |
|---|---|
| 자격 오판 | “자격 요건 확인 필요” 표시, 공식 링크 우선 |
| 정책 데이터 오래됨 | 마감/원문 readback timestamp 노출 |
| 결제 신뢰 부족 | 환불/해지 안내, Toss 결제 문구 명확화 |
| AdSense 저품질 리스크 | SaaS CTA와 review-mode surface 분리 |
| SNS 신뢰 하락 | 자동 발행/자동 DM 금지, 관철 검토 게이트 유지 |

## 다음 구현 TOP 5

1. `/pricing`을 “정책 마감 알림 SaaS” 중심으로 재작성
2. `/mypage/business` 완료 후 `/recommend` 또는 `/alerts`로 이어지는 onboarding CTA 정리
3. Basic 권한 unlock readback 테스트 추가
4. `payment_completed → subscription active → tier badge` end-to-end smoke 추가
5. SEO/인스타 CTA를 `/pricing?source=instagram&recommended=basic`로 통일

## PM 판단

지금은 “콘텐츠 사이트로 돈 벌기”보다 **정책 알림 SaaS로 결제 이유를 만드는 것** 이 빠르다. AdSense는 승인되면 보조 수익이고, 메인 매출은 Basic 4,900원 구독으로 검증한다.
