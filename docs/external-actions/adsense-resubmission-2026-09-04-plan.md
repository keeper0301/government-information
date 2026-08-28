# AdSense 재신청 플랜 — 2026-09-04

## 현재 반려 상태

- 사이트: `keepioo.com`
- AdSense 콘솔 사유: `정책 위반이 발견되었습니다` / `가치가 별로 없는 콘텐츠`
- 재검토 가능일: 2026-09-04
- 사이트 소유권: 확인 완료

## 2026-08-28 live readback

- `https://www.keepioo.com` HTTP 200
- `/sitemap.xml` URL 수: 32
- review-mode sitemap excluded family count: `/news`, `/blog`, `/welfare`, `/loan`, `/calendar`, `/recommend`, `/popular`, `/consult`, `/alerts`, `/pricing`, `/eligibility` 모두 0
- `robots.txt`: `Mediapartners-Google` allow 확인
- 핵심 trust pages: `/about`, `/help`, `/privacy`, `/terms`, `/contact`, `/guides`, `/c/*` 모두 200 + `index, follow`
- mass-list pages: `/welfare`, `/loan`, `/blog`, `/news` 200 + `noindex, follow`
- guard test: `npx vitest run __tests__/adsense-approval-guards.test.ts` → 16 passed

## 발견된 위험 신호

1. Homepage review surface에 `/pricing` 내부 링크 1개 잔존
   - `ADSENSE_REVIEW_STRICT_LINKS=1 npm run diagnose:adsense-review` 실패
   - 실패: `FAIL / review link leak /pricing: 1`
   - 원인 후보: `components/home-cta.tsx`가 review mode에서도 `buildBasicPricingHref("home")` CTA를 노출

2. Homepage에 자동화/상업성으로 보일 수 있는 문구 잔존
   - live probe hit: `자동 발송`
   - 원인 후보: `components/home-value-props.tsx`의 `이메일 자동 발송`
   - AdSense 반려 문맥에서는 자동생성/자동운영 인상을 줄 수 있음

3. Review-mode 메인 내러티브가 여전히 서비스/가입 CTA 중심
   - Hero: `/quiz`, SearchBox, profile/personalization CTA 노출
   - page-end CTA: pricing funnel로 연결
   - AdSense 심사 시에는 SaaS funnel보다 대표 가이드/운영자 편집/공식 출처/정정 창구가 더 앞에 보여야 함

4. noindex mass-list pages는 접근 가능하며 자체 내부 링크가 매우 많음
   - `/welfare` 내부 `/welfare` 링크 40개
   - `/loan` 내부 `/loan` 링크 39개
   - `/blog` 내부 `/blog` 링크 59개
   - `/news` 내부 `/news` 링크 55개 + `/blog` 1개
   - sitemap에서 제외되어도 크롤러가 발견하면 thin/mass-list 인상 가능. review 기간에는 robots/noindex 정책은 유지하되 내부 진입 경로와 CTA를 더 줄이는 편이 안전

## 재신청 전 수정 플랜

### P0 — review-mode strict preflight 통과

- `components/home-cta.tsx`
  - `ADSENSE_REVIEW_MODE`일 때 pricing CTA를 `/guides` 또는 `/c/business`로 전환
  - CTA 문구도 `내 정책 마감 알림 시작하기` 대신 `대표 가이드부터 확인하기` 계열로 변경
  - 승인 후 복구 구조 유지: `NEXT_PUBLIC_ADSENSE_REVIEW_MODE=adsense-approved-live-ads`로 바꾸면 `ADSENSE_REVIEW_MODE=false`가 되어 기존 `/pricing?from=home&recommended=basic` CTA가 자동 복구됨
- `components/home-value-props.tsx`
  - `이메일 자동 발송` → `마감 전 확인 안내` 같은 표현으로 완화
- `__tests__/adsense-approval-guards.test.ts`
  - review-mode HomeCTA가 pricing으로 가지 않는 guard 추가
  - 승인 후 live-mode pricing funnel 복구 스위치 guard 추가
  - `자동 발송` 문구 금지 guard 추가
- 검증
  - `ADSENSE_REVIEW_STRICT_LINKS=1 npm run diagnose:adsense-review`
  - `npx vitest run __tests__/adsense-approval-guards.test.ts`

### P1 — 심사 표면을 “큐레이션 가이드 서비스”로 더 명확히 전환

- homepage review mode에서 SaaS/가입/자동추천 중심 요소를 더 약화
  - `SearchBox`, `/quiz` funnel, personalization CTA가 심사 첫 화면에서 과하게 보이면 가이드/공식출처 안내 아래로 내리거나 review mode에서 숨김 검토
- `ReviewModeHomeBody`를 보강
  - 공식 출처 확인 방식
  - 운영자 편집·정정 기준
  - 신청 전 체크리스트 가치
  - 대표 가이드 4개 + 카테고리 허브 중심
- `/about`에 검수/정정/출처 기준을 더 상단 배치

### P2 — 대표 가이드 품질 신호 강화

- sitemap에 들어간 대표 가이드 20개는 본문 길이는 충분함
- 다음을 각 가이드/가이드 목록에서 더 명확히 보여주기
  - 공식 출처 확인 안내
  - 신청 전 확인 항목
  - 자격/서류/마감/중복제한 구조
  - “원문 복붙이 아니라 신청 판단 보조” 메시지

### P3 — 재신청 직전 checklist

1. live deploy 후 확인
   - `/` `/about` `/help` `/guides` `/c/youth` `/c/senior` `/c/business` `/c/housing` 200 + index
   - `/welfare` `/loan` `/blog` `/news` noindex 유지
   - sitemap URL 32 전후, excluded families 0
   - `Mediapartners-Google` allow
   - homepage `/pricing` link leak 0
   - homepage risky phrase `자동 발송`, `자동 수집`, `매일 7글`, `최근 정책 소식` 0
2. Google Search Console에서 `https://www.keepioo.com/sitemap.xml` 제출
3. AdSense 콘솔에서 2026-09-04 이후 재검토 요청

## 안전선

- 코드 수정/테스트/배포/readback은 승인 후 진행
- GSC sitemap 제출과 AdSense 재검토 요청은 사장님 계정에서 최종 승인 후 진행
- DB/env/admin mutation 및 외부 SNS 발행과 무관
