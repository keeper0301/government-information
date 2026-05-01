# 정책알리미 업데이트 방향 autoresearch 노트

작성일: 2026-05-01

## 목적

정책알리미를 단순 정책 목록 사이트가 아니라, 사용자가 받을 수 있는 지원을 놓치지 않고 실제 신청 행동까지 이어지게 하는 개인 정책 실행 도구로 발전시킨다.

현재 운영 신호는 가입과 활성 사용이 약하다. 그래서 다음 업데이트는 새 기능 수를 늘리는 방향보다, 첫 방문자가 자신의 조건을 저장하고 다시 돌아올 이유를 만드는 방향이어야 한다.

## autoresearch 적용 방식

`autoresearch-skill`은 원래 특정 `SKILL.md`를 반복 실험으로 개선하는 도구다. 이번 작업에는 사이트 전략에 같은 형식을 적용했다.

- 입력: 현재 코드베이스, 기존 사업계획/phase 문서, 최근 운영 알림, 공식 외부 자료
- 평가 방식: 업데이트 후보를 binary eval 기준으로 점검
- 산출물: 다음 6주 업데이트 방향과 바로 실행할 백로그

## 평가 기준

각 업데이트 후보는 아래 질문에 "예"라고 답할 수 있어야 우선순위가 높다.

1. 첫 방문자가 60초 안에 자기 조건을 저장하게 만드는가?
2. 저장 후 7일 안에 다시 방문하거나 알림을 열 이유를 만드는가?
3. 정책 정보의 신뢰도와 최신성을 화면에서 증명하는가?
4. 사용자가 다음 행동, 즉 신청, 비교, 저장, 상담 중 하나를 하게 만드는가?
5. Google AI 검색과 일반 검색 모두에서 인용되기 쉬운 구조를 갖추는가?
6. 운영자가 데이터 실패, 중복, 분류 오류를 하루 안에 발견하고 복구할 수 있는가?
7. 유료 전환 또는 상담 전환과 직접 연결되는가?

## 외부 신호

- Google Search Central은 AI 검색 시대에도 보이는 콘텐츠와 일치하는 구조화 데이터, 고품질 이미지/영상, 방문 후 전환 지표를 중요하게 보라고 안내한다.
- 정부24/디지털정부 자료는 정부 서비스의 방향이 "서비스 통합", "맞춤안내", "생활정보/혜택 찾기", "공공 마이데이터"로 가고 있음을 보여준다.
- 2026년 청년정책 시행계획은 중앙부처 기준 389개 과제, 약 30조원 규모로 추진된다. 청년/주거/일자리/교육/복지 카테고리는 SEO와 알림 소재가 계속 나온다.

## 현재 코드베이스 판단

강점:

- `welfare`, `loan`, `news`, `blog`, `guides`, `eligibility`, `compare`, `recommend` 등 공개 페이지 표면이 이미 넓다.
- Supabase 기반 수집기, dedupe, enrich, press-ingest L2 confirm, admin health가 있어 데이터 운영 기반이 있다.
- billing, subscription, alert, referral, weekly digest, onboarding reminder가 이미 들어와 있어 수익화와 retention 실험의 재료가 있다.

약점:

- 첫 방문자가 "왜 가입해야 하는지"보다 "목록을 둘러보는 경험"이 더 강하다.
- 정책 상세가 신청 행동 체크리스트라기보다 정보 페이지에 가깝다.
- 운영 알림상 24h 신규 가입과 7d 활성 사용자가 낮다. SEO 추가보다 활성 루프 개선이 먼저다.
- 수집/분류 자동화는 강해졌지만, 사용자에게 "이 정보가 최신이고 믿을 만하다"는 신호가 충분히 전면화되어 있지 않다.

## 전략 결론

브랜드는 계속 "전국민 정책알리미"로 유지하되, 제품 업데이트와 마케팅 실험은 두 개 레인으로 분리한다.

1. SEO 유입 레인: 청년, 주거, 복지, 지역 롱테일 페이지를 계속 확장한다.
2. 전환 레인: 소상공인/예비창업자 정책자금과 정부지원사업을 유료 전환 후보로 집중한다.

이유:

- 청년/복지 키워드는 유입이 넓고 콘텐츠 소재가 많다.
- 소상공인/예비창업자는 정책자금, 사업공고, 마감, 서류 준비 니즈가 강해서 알림과 유료 전환에 더 가깝다.
- 현재 코드에도 `business`, `loan`, `bizinfo`, `kstartup`, `sbiz24`, `semas-policy-fund` 수집 기반이 있다.

## 6주 업데이트 방향

### 1주차: 가입 funnel 계측과 첫 조건 저장 강화

목표: 24h 신규 가입 0 상태를 깨고, 온보딩 완료율을 볼 수 있게 만든다.

작업:

- GA4/내부 이벤트를 `landing_view`, `profile_start`, `profile_saved`, `recommend_view`, `alert_created`, `signup_started`, `signup_completed`로 정리
- 홈/추천/검색에서 "내 조건 저장하면 새 지원금 알림" CTA를 하나의 문구로 통일
- 로그인 전에도 지역, 나이대, 관심분야를 임시 저장하고 가입 후 profile로 승격
- `/admin/health`에 funnel 카드 추가

성공 기준:

- 7일 안에 `profile_saved / landing_view` 비율 확인 가능
- 신규 가입이 없어도 어디서 이탈하는지 보임

### 2주차: 정책 상세를 "신청 액션카드"로 재설계

목표: 상세 페이지를 읽기 페이지에서 신청 준비 페이지로 바꾼다.

작업:

- `welfare/[id]`, `loan/[id]` 상단에 신청 액션카드 추가
- 액션카드 항목: 신청 가능 여부, 마감 D-day, 신청 링크, 필요서류, 대상 조건, 출처, 최신 확인 시각
- 신청 URL 없는 정책은 "원문 확인 필요"로 분리하고 자동 알림/추천 가중치 낮춤
- visible content와 일치하는 구조화 데이터 검토

성공 기준:

- 상세 페이지에서 `apply_click`, `bookmark_added`, `alert_created` 이벤트가 증가
- 사용자에게 최신성/출처가 첫 화면에서 보임

### 3주차: 소상공인/예비창업자 wedge landing

목표: 유료 전환 후보 세그먼트를 명확히 만든다.

작업:

- `/business`를 "소상공인 정책자금 알림" 랜딩+대시보드로 강화
- 사업자 프로필 필드 추가 검토: 업종, 사업지역, 창업연차, 매출구간, 고용인원
- `bizinfo`, `kstartup`, `sbiz24`, `semas` 수집 실패를 admin에서 소스별로 분리 표시
- "이번 주 신청 가능한 사업자 지원사업" digest 생성

성공 기준:

- business profile 저장 이벤트 생성
- 사업자 정책 상세 apply click 추적 가능

### 4주차: 알림을 retention core로 이동

목표: 사용자가 다시 돌아올 이유를 만든다.

작업:

- `/alerts`를 단순 설정이 아니라 "내 조건에 걸린 새 정책" inbox로 확장
- weekly digest 메일에 개인화 top 3 + 마감 임박 top 3 구성
- 알림 히스토리에 "왜 이 정책이 나에게 왔는지" reason 표시
- onboarding reminder를 profile incomplete / no alert rule / no bookmark 별로 분리

성공 기준:

- 7d active 사용자 수 증가
- digest open 이후 상세 진입 이벤트 확인

### 5주차: 신뢰/품질 레이어 전면화

목표: 자동 수집 사이트가 아니라 검수되는 정책 데이터베이스로 보이게 한다.

작업:

- 상세에 `출처`, `마지막 확인`, `자동수집/관리자확인`, `중복 정리됨` 배지 추가
- press-ingest L2 confirm 결과를 admin dashboard KPI에 연결
- cron 실패가 사용자 노출 데이터에 영향을 주는지 health에서 구분
- 신청 URL 없는 후보, 오래된 후보, 중복 의심 후보를 admin triage queue로 묶음

성공 기준:

- 관리자 triage가 하루 운영 루틴으로 가능
- 사용자 화면에서 신뢰 신호가 첫 화면에 노출

### 6주차: 유료 전환 전 실험

목표: 결제 구현보다 먼저 지불 의사를 검증한다.

작업:

- Pro CTA를 "카카오/이메일 즉시 알림", "서류 체크리스트", "마감 전 재알림" 중심으로 재작성
- 가격 페이지에서 실제 결제 전 `checkout_intent` 수집
- 사업자 세그먼트에 "월간 정책자금 브리핑" lead magnet 추가
- 유료 기능 일부는 waitlist로 열어 conversion copy A/B 테스트

성공 기준:

- checkout intent 또는 waitlist 등록이 발생
- 어떤 가치 문구가 클릭되는지 확인

## 바로 실행할 백로그

1. `lib/analytics.ts` 이벤트 taxonomy 정리
2. `/admin/health`에 가입 funnel 카드 추가
3. `welfare/[id]`, `loan/[id]` 신청 액션카드 컴포넌트 도입
4. 상세 페이지 source freshness 배지 도입
5. `/business`를 소상공인 정책자금 중심으로 재배치
6. 수집 소스별 health: `bizinfo`, `kstartup`, `sbiz24`, `semas`, `press-ingest`
7. weekly digest 개인화 reason 추가
8. alert inbox에 "왜 추천됐는지" 표시
9. Pro CTA 문구를 알림/마감/서류 중심으로 재작성
10. checkout intent 이벤트 추가

## 하지 말아야 할 것

- 새 SEO 페이지를 계속 늘리기만 하고 가입/저장/알림 루프를 방치하지 않는다.
- 결제부터 완성하지 않는다. 먼저 지불 의사와 전환 문구를 검증한다.
- 모든 세그먼트를 동시에 공략하지 않는다. 유입은 넓게, 전환 실험은 소상공인/예비창업자에 집중한다.
- LLM 자동 등록을 사용자 노출까지 완전 자동화하지 않는다. 정책 데이터는 confirm과 신뢰 배지가 핵심이다.

## 다음 구현 추천

가장 먼저 할 작업은 "가입 funnel + 신청 액션카드"다.

이 두 작업은 신규 가입 0 문제와 상세 페이지 전환 문제를 동시에 건드린다. 또한 이후 유료 전환, 알림, SEO 개선의 측정 기반이 된다.

권장 첫 PR:

- `components/program-action-card.tsx`
- `lib/analytics.ts` 이벤트 추가
- `app/welfare/[id]/page.tsx`, `app/loan/[id]/page.tsx` 상단 액션카드 삽입
- `/admin/health` funnel 지표 카드 추가
- 테스트: action card rendering, analytics event constants

## 참고한 외부 자료

- Google Search Central, "Top ways to ensure your content performs well in Google's AI experiences on Search", 2025-05-21  
  https://developers.google.com/search/blog/2025/05/succeeding-in-ai-search
- 정부24: 보조금24 맞춤안내, 원스톱 서비스, 공공 마이데이터 등 통합 정부서비스 방향  
  https://m.gov.kr/portal/main
- 대한민국 정책브리핑, 2026년 청년정책 시행계획: 중앙부처 389개 과제, 약 30조원 규모  
  https://admin.korea.kr/news/pressReleaseView.do?newsId=156758855&pWise=mSub&pWiseSub=C8
- 중소벤처24: 중소벤처기업 통합 로그인, 정책금융안내, 사업 정보 제공 방향  
  https://www.smes.go.kr/main/
