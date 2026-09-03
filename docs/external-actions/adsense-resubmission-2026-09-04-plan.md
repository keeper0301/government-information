# AdSense 재신청 플랜 — 2026-09-04

## 현재 반려 상태

- 사이트: `keepioo.com`
- AdSense 콘솔 사유: `정책 위반이 발견되었습니다` / `가치가 별로 없는 콘텐츠`
- 재검토 가능일: 2026-09-04
- 사이트 소유권: 확인 완료
- 2026-09-03 12:21 KST 기준: 재신청 전 코드/문서상 남은 작업은 외부 제출 절차 분리와 readback 기록 정리다. review surface 진단은 현재 통과 상태다.

## 2026-09-03 live readback — current OK

명령:

```bash
npm run diagnose:adsense-review
ADSENSE_REVIEW_STRICT_LINKS=1 npm run diagnose:adsense-review
```

결과:

- normal preflight: `status=ok`
- strict link preflight: `status=ok`
- `/sitemap.xml` URL 수: 32
- sitemap excluded family count: `/news`, `/blog`, `/welfare`, `/loan`, `/calendar`, `/recommend`, `/popular`, `/consult`, `/alerts`, `/pricing`, `/eligibility` 모두 0
- review sitemap core: `/guides` 21개, `/c/*` 4개
- `robots.txt`: `Mediapartners-Google` allow 확인
- 핵심 trust/review pages: `/`, `/about`, `/guides`, `/help`, `/privacy`, `/terms`, `/contact`, `/c/youth`, `/c/senior`, `/c/business`, `/c/housing` 모두 200 + `index, follow`
- mass-list pages: `/welfare`, `/loan`, `/blog`, `/news` 200 + `noindex, follow`
- strict link leak: home/help/category review surface에서 `/pricing`, `/recommend`, `/alerts` 포함 주요 funnel/mass-list 링크 0
- risky phrase guard: `자동 수집`, `매일 14편`, `최근 정책 소식`, `진행 중 지원 공고`, `대량 상세 목록`, `블로그 카테고리` failure 없음

## 2026-08-28 live readback — baseline

- `https://www.keepioo.com` HTTP 200
- `/sitemap.xml` URL 수: 32
- review-mode sitemap excluded family count: `/news`, `/blog`, `/welfare`, `/loan`, `/calendar`, `/recommend`, `/popular`, `/consult`, `/alerts`, `/pricing`, `/eligibility` 모두 0
- `robots.txt`: `Mediapartners-Google` allow 확인
- 핵심 trust pages: `/about`, `/help`, `/privacy`, `/terms`, `/contact`, `/guides`, `/c/*` 모두 200 + `index, follow`
- mass-list pages: `/welfare`, `/loan`, `/blog`, `/news` 200 + `noindex, follow`
- guard test: `npx vitest run __tests__/adsense-approval-guards.test.ts` → 16 passed

## 발견된 위험 신호와 현재 상태

1. Homepage review surface의 `/pricing` 내부 링크 잔존 — **resolved**
   - 과거 실패: `ADSENSE_REVIEW_STRICT_LINKS=1 npm run diagnose:adsense-review` → `FAIL / review link leak /pricing: 1`
   - 현재 결과: strict preflight `status=ok`
   - 현재 readback: `/.links./pricing=0`, `/help.links./pricing=0`, `/c/* .links./pricing=0`
   - 복구 구조: AdSense 승인 후 `NEXT_PUBLIC_ADSENSE_REVIEW_MODE=adsense-approved-live-ads`로 바꾸면 live-mode pricing funnel이 복구되는 구조 유지

2. Homepage의 자동화/상업성 위험 문구 — **resolved**
   - 과거 hit: `자동 발송`
   - 현재 risky phrase guard: failure 없음
   - 현재 진단 대상 위험 문구: `자동 수집`, `매일 14편`, `최근 정책 소식`, `진행 중 지원 공고`, `대량 상세 목록`, `블로그 카테고리`

3. Review-mode 메인 내러티브가 서비스/가입 CTA 중심 — **resolved for current review pass**
   - 현재 `/` required phrase `신청 판단`, `대표 가이드` 통과
   - `/about` required phrase `공식 출처`, `대표 가이드`, `편집·검수 기준` 통과
   - `/guides` required phrase `대표 주제별 가이드` 통과
   - SaaS 전환 표면은 review-mode에서 link leak 0으로 분리됨

4. noindex mass-list pages의 자체 내부 링크 다수 — **accepted with guard**
   - `/welfare`, `/loan`, `/blog`, `/news`는 접근 가능하지만 sitemap 제외 + `noindex, follow` 유지
   - review surface에서 이들 mass-list로 들어가는 strict link leak은 0
   - 현 단계에서는 삭제/robots 차단보다 noindex 유지 + review surface 진입 경로 차단이 안전

## 재신청 전 남은 체크리스트

### P0 — review-mode strict preflight 통과 — 완료

- `ADSENSE_REVIEW_STRICT_LINKS=1 npm run diagnose:adsense-review` → `status=ok`
- homepage/category/help review surface의 pricing/funnel/mass-list link leak 0
- 위험 문구 failure 없음
- sitemap 32, `/guides` 21개, `/c/*` 4개 유지

### P1 — 심사 표면을 “큐레이션 가이드 서비스”로 전환 — 완료

- `/`는 신청 판단/대표 가이드 중심 phrase 통과
- `/about`은 공식 출처/대표 가이드/편집·검수 기준 phrase 통과
- `/guides`는 대표 주제별 가이드 phrase 통과
- `/welfare`, `/loan`, `/blog`, `/news` mass-list는 noindex 유지

### P2 — 대표 가이드 품질 신호 강화 — 현재 통과, 추가 보강 후보

현재 상태:

- sitemap review core는 `/guides` 21개 + `/c/*` 4개
- AdSense preflight에서 guide/category hub는 200 + index + link leak 0

추가 보강 후보:

- 대표 가이드별 공식 출처/신청 전 확인/자격·서류·마감/중복제한 누락 탐지 CLI
- 누락 가이드 3개 우선 보강
- guide body quality gate 테스트 추가

이 작업은 재신청 필수 blocker는 아니고, `가치가 별로 없는 콘텐츠` 반려 재발 리스크를 낮추는 후속 개선이다.

### P3 — 외부 final brake

아래 2개는 코드가 아니라 외부 콘솔 작업이므로 사장님 최종 승인 후 진행한다.

1. Google Search Console에서 `https://www.keepioo.com/sitemap.xml` 제출 또는 재제출
2. AdSense 콘솔에서 2026-09-04 이후 재검토 요청

## 재신청 직전 readback 명령

```bash
npm run diagnose:adsense-review
ADSENSE_REVIEW_STRICT_LINKS=1 npm run diagnose:adsense-review
npm run smoke:conversion-funnel
npm run cache:guard
```

통과 기준:

- AdSense normal/strict preflight 둘 다 `status=ok`
- `/pricing` review link leak 0
- sitemap excluded family 0
- trust/review pages 200 + `index, follow`
- mass-list pages 200 + `noindex, follow`
- `Mediapartners-Google` allow
- 전환 퍼널 smoke 6/6 통과

## 안전선

- 문서 수정/테스트/readback은 안전한 로컬 작업
- GSC sitemap 제출과 AdSense 재검토 요청은 사장님 계정에서 최종 승인 후 진행
- DB/env/admin mutation 및 외부 SNS 발행과 무관
- AdSense 승인 후 정상 SaaS 표면 복구는 별도 작업: `NEXT_PUBLIC_ADSENSE_REVIEW_MODE=adsense-approved-live-ads` 설정 + production redeploy/readback
