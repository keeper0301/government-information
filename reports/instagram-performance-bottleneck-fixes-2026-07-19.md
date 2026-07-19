# Instagram 일반글 성과 병목 3종 개선안

## 배경

자동 발행량과 후보 재고 병목은 해소됐다. 남은 병목은 다음 3개다.

1. 첫 장 카드 hook 약함
2. 성과 추적 자동화 없음
3. 카테고리 쏠림

## 1. 첫 장 카드 hook 개선

파일:

```text
app/api/instagram-card/[slug]/[index]/route.tsx
```

변경:

- 카드 1 표지에 저장/공유 이유를 주는 hook strip 추가.
- 제목만 크게 보여주던 구조에서 `저장 포인트`를 먼저 보여줌.

예시 hook:

```text
저장 포인트 · 대상 · 기간 · 공식 신청처
저장 포인트 · 대상 · 금액 · 신청기간
저장 포인트 · 대상 · 서류 · 신청기간
공유 포인트 · 대상 나이 · 기간 · 신청처
```

## 2. 인사이트 자동 수집 cron

파일:

```text
app/api/cron/instagram-insights-collect/route.ts
lib/instagram/insights.ts
vercel.json
.github/workflows/manual-site-cron.yml
```

변경:

- `/api/cron/instagram-insights-collect` 추가.
- 6시간마다 실행: `17 */6 * * *`
- `reach`, `saved`, `shares`, `profile_activity`, `total_interactions` 수집.
- dry-run 지원.
- 수동 workflow 선택지 추가.

## 3. 카테고리 쏠림 완화

파일:

```text
app/api/cron/instagram-publish/route.ts
```

변경:

- 후보 scan: 10건 → 20건.
- 첫 approved 후보가 `소상공인`이면, 가까운 FIFO 안의 `청년`, `주거`, `육아·가족`, `노년`, `학생·교육` 후보를 우선 선택.
- 1회 발행 1건은 그대로 유지.

목적:

- 계정이 `소상공인 지원금 복붙 계정`처럼 굳는 리스크 완화.
- 후보 재고 568건 중 소상공인 275건 쏠림을 완충.

## 검증

```text
npx tsc --noEmit
npx vitest run __tests__/app/instagram-publish-route.test.ts __tests__/lib/instagram-insights.test.ts __tests__/app/instagram-insights-collect-route.test.ts __tests__/lib/instagram-policy-copy.test.ts __tests__/lib/instagram-caption.test.ts
node vercel.json cron 확인
git diff --check
```

결과:

```text
29 passed
/api/cron/instagram-publish */15 * * * *
/api/cron/instagram-insights-collect 17 */6 * * *
git diff --check pass
```

## 배포 전 주의

- Production cron 추가 및 발행 후보 선택 정책 변경이므로 배포 승인 필요.
- 외부 발행 자체는 하지 않음.
