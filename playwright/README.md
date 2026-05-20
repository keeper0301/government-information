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

- `lib/_factory.mjs` — `makeScraper({ listUrl, cityName })` 표준 selector 분기
- `lib/cities.mjs` — 4 city config (창원·성남·안산·천안) export
- `runner.mjs` — entry, COLLECTORS 순서대로 scrape + POST

## manual test

```bash
node lib/cities.mjs changwon   # 또는 seongnam / ansan / cheonan
# 또는 npm script
npm run test:changwon
```

## GitHub Actions

`.github/workflows/big-cities-press.yml` — KST 10/16/22/4 cron + workflow_dispatch.

secrets 등록 (사장님 GitHub repo settings → Secrets and variables → Actions):
- `KEEPIOO_API_URL=https://www.keepioo.com`
- `KEEPIOO_API_KEY=<Vercel env IMPORT_PRESS_API_KEY 와 동일 값>`

## 회귀 안전

- 기존 정적 collector 29개 (`lib/scraping/local-press/_registry.ts`) 영향 0
- 같은 source_url 중복 시 keepioo endpoint 가 dedupe (UNIQUE constraint 활용)
- 시·군 1개 selector 변경 시 다른 시·군 영향 0 (격리)
