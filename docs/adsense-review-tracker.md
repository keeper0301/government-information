# AdSense 재심사 추적 보드

- 상태: **심사 대기**
- 기준 시각: 2026. 9. 23. 12시 35분 32초
- 대상 사이트: https://www.keepioo.com
- 최신 커밋: `18a1c6bc fix(adsense): make default og copy editorial`

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
