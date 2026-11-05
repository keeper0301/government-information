# AdSense 재심사 추적 보드

- 상태: **2026-10-12 광고 게재 불승인 통지 수신 / 구체 반려 사유 미확인**
- 기준 시각: 2026-10-13 11:50 KST
- 대상 사이트: https://www.keepioo.com
- 실제 반려 사유: AdSense Sites 상세 화면 확인 필요. 현재 조사 브라우저에는 로그인 세션이 없음.
- 운영 deployment: `dpl_FVkEuLQW6TasA1oDZQbFUAMU8acr`, READY, SHA `82165673e108c424d65cf1bd06941477bf5be5e6`
- PR #366·#367은 운영 커밋에 포함. PR #365의 readiness 가드는 미병합·운영 미반영.
- 광고 모드 전환·재심사 요청·DB 변경은 실행하지 않음.
- 상세 조사: [2026-10-13 조사 기록](adsense-rejection-investigation-20261013.md)

아래 9월 기록은 과거 점검 결과이며 현재 심사 상태나 콘텐츠 품질을 증명하지 않습니다.

## 심사 대기 체크

- AdSense review preflight: **통과**
- GitHub CI: **success** — https://github.com/keeper0301/government-information/actions/runs/35697712374
- Search Console sitemap 제출: **success** — https://github.com/keeper0301/government-information/actions/runs/35805172928

## live sitemap / guide 품질

- sitemap URL 수: **45**
- guide URL 수: **31**
- guide quality 통과: **31**
- guide quality issues: **0**

## 신뢰 페이지 readback

- `/editorial-policy`: HTTP 200, robots `index, follow`
- `/source-policy`: HTTP 200, robots `index, follow`
- `/correction-policy`: HTTP 200, robots `index, follow`

## AdSense 콘솔에서 할 일

1. 현재 사이트는 재심사 요청 제출 후 Google 심사 대기 상태로 관리합니다.
2. 새 거절 문구가 나오면 해당 문구와 indexed URL 기준으로 다시 진단합니다.
3. 승인되면 `docs/adsense-approval-recovery-checklist.md` 기준으로 review-mode 복구 절차를 진행합니다.
4. 승인 전에는 pricing/SaaS surface, ad script, 대량 funnel 문구를 다시 노출하지 않습니다.

## 실패 시 우선 확인

- preflight 실패: `ADSENSE_REVIEW_STRICT_LINKS=1 npm run diagnose:adsense-review`
- sitemap 재제출: GitHub Actions `Manual Site Cron Trigger` → `search-console-sitemap-submit`
- 승인 후 복구: `docs/adsense-approval-recovery-checklist.md` 기준으로 pricing/SaaS/sitemap/ad-script 복구 readback 후 진행
