# AdSense 승인 후 복구 체크리스트

AdSense 재심사가 승인된 뒤 review-mode로 숨겨 둔 상업·SaaS 표면을 복구할 때 쓰는 운영 체크리스트입니다. 승인 전에는 실행하지 않습니다.

## 1. 승인 확인

- AdSense 콘솔에서 사이트 상태가 승인 또는 광고 게재 가능 상태인지 확인합니다.
- 승인 확인 화면이나 알림의 시각을 운영 로그에 남깁니다.
- 새 거절 문구가 남아 있으면 복구하지 않고 `npm run diagnose:adsense-review`부터 다시 실행합니다.

## 2. 환경값 전환

- `NEXT_PUBLIC_ADSENSE_REVIEW_MODE=adsense-approved-live-ads`로 전환합니다.
- Vercel production env를 바꾸는 작업은 별도 승인 후 진행합니다.
- DB, 결제, 외부 발행 설정은 이 체크리스트 범위가 아닙니다.

## 3. 배포 전 로컬 검증

```bash
npm run diagnose:adsense-review
npm run diagnose:guide-quality
npm run diagnose:naver-seo-html
npm run typecheck
npx vitest run __tests__/adsense-approval-guards.test.ts
```

## 4. 배포 후 공개 readback

- `/`, `/pricing`, `/search`, `/quiz`, `/guides`, `/about`, `/contact` HTTP 상태를 확인합니다.
- sitemap URL 수와 guide URL 수가 의도와 맞는지 확인합니다.
- AdSense script가 승인 후 의도한 위치에만 노출되는지 확인합니다.
- review-mode 기간에 금지했던 표현이 승인 후 정상 surface에서만 돌아왔는지 확인합니다.

## 5. 복구 완료 기준

- production deploy가 READY입니다.
- 공개 HTML readback에서 pricing/SaaS surface가 의도대로 보입니다.
- `/news`, `/blog`처럼 심사 중 숨겼던 thin/archive surface는 별도 의사결정 전 무리하게 복구하지 않습니다.
- 최종 상태를 운영 로그에 기록합니다.