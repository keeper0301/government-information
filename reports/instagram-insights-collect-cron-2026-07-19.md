# Instagram 일반글 인사이트 자동 수집 cron 추가

## 목적

자동 발행량을 늘린 뒤 게시물별 성과 병목을 추적한다.

수집 대상:

- 최근 발행된 `blog_posts.instagram_media_id` 보유 일반글
- 기본 lookback: 3일
- 기본 limit: 30건, 최대 50건

## 새 endpoint

```text
/api/cron/instagram-insights-collect
```

인증:

- `CRON_SECRET` 필수
- `dry=1` 지원

동작:

1. `instagram_oauth_tokens`에서 유효 토큰 로드
2. 최근 발행 일반글 media id 조회
3. Instagram Graph insights 조회
4. `reach`, `saved`, `shares`, `profile_activity`, `total_interactions` 집계
5. dry-run이 아니면 `admin_actions`에 `instagram_insights_collect` 감사 로그 저장

## schedule

```text
17 */6 * * *
```

6시간마다 1회. 15분 발행 cron과 분산되도록 17분에 실행.

## 수동 실행

GitHub Actions `manual-site-cron.yml`에 추가:

```text
instagram-insights-collect-dry
instagram-insights-collect
```

## 검증

```text
npx tsc --noEmit
npx vitest run __tests__/lib/instagram-insights.test.ts __tests__/app/instagram-insights-collect-route.test.ts __tests__/app/instagram-publish-route.test.ts
node vercel.json cron 확인
git diff --check
```

결과:

```text
11 passed
instagram insights cron ok: 17 */6 * * *
git diff --check pass
```

## 리스크

- Graph API metric 지원은 media type별로 다르므로 metric set fallback을 둠.
- `impressions`는 일반 carousel FEED에서 미지원 사례가 있어 기본 수집에서 제외.
- DB 본문은 변경하지 않고 audit log에 compact metrics만 저장.
