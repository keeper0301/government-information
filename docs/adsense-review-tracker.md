# AdSense 재심사 추적 보드

- 상태: **준비 완료**
- 기준 시각: 2026. 9. 20. 1시 17분 13초
- 대상 사이트: https://www.keepioo.com
- 최신 커밋: `9219f3dc fix(adsense): avoid risky trust-page wording`

## 제출 전 체크

- AdSense review preflight: **통과**
- GitHub CI: **success** — https://github.com/keeper0301/government-information/actions/runs/35453614621
- Search Console sitemap 제출: **success** — https://github.com/keeper0301/government-information/actions/runs/35452045774

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

1. AdSense 콘솔에서 사이트 심사 상태를 확인합니다.
2. 사이트가 준비됨 상태라면 재심사 요청 버튼을 누릅니다.
3. 제출 후 이 파일의 기준 시각과 Search Console 제출 run을 운영 기록으로 남깁니다.
4. 승인되면 `NEXT_PUBLIC_ADSENSE_REVIEW_MODE=adsense-approved-live-ads` 복구 절차로 전환합니다.

## 실패 시 우선 확인

- preflight 실패: `ADSENSE_REVIEW_STRICT_LINKS=1 npm run diagnose:adsense-review`
- sitemap 재제출: GitHub Actions `Manual Site Cron Trigger` → `search-console-sitemap-submit`
- 승인 후 복구: pricing/SaaS/sitemap/ad-script 복구 readback 후 진행
