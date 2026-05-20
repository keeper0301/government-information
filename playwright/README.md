# keepioo Playwright runner — 1차 시 batch (#45)

SPA 시청 보도자료 scrape 후 keepioo `/api/admin/import-press-batch` 로 POST. 정적 collector (`lib/scraping/local-press/`) 가 처리 못 하는 SPA / AJAX 시·도청 보완.

## 설치

```bash
cd playwright
npm install
npx playwright install chromium
```

## 실행

```bash
export KEEPIOO_API_URL=https://www.keepioo.com
export KEEPIOO_API_KEY=<keepioo /api/admin/import-press-batch 인증 키>

node runner.mjs
```

## 디렉터리

- `lib/changwon.mjs` — 1차 시 1개. `scrapeChangwon({ limit, headless })` export
- `runner.mjs` — entry, COLLECTORS 순서대로 scrape + POST
- 다음 세션 추가 예정: `lib/{seongnam,ansan,cheonan}.mjs`

## manual test

```bash
node lib/changwon.mjs  # 3건 list + body 길이 출력
```

## GitHub Actions (다음 세션)

`.github/workflows/big-cities-press.yml` 추가 예정. 매 6시간 (KST 10/16/22/4) cron + workflow_dispatch.

secrets:
- `KEEPIOO_API_URL`
- `KEEPIOO_API_KEY`

## 회귀 안전

- 기존 정적 collector 29개 (`lib/scraping/local-press/_registry.ts`) 영향 0
- 같은 source_url 중복 시 keepioo endpoint 가 dedupe (UNIQUE constraint 활용)
- 시·군 1개 selector 변경 시 다른 시·군 영향 0 (격리)
