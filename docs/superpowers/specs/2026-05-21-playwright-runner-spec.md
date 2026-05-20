# Playwright runner 인프라 spec (#45 완전 해결 path)

작성: 2026-05-21
배경: [[project_local_press_big_city_findings_2026_05_21]] — 큰 시 16 batch 정찰 결과 다수가 SPA. 정적 fetch 한계.

## 목적

전국 226 시·군·구 batch 완성을 위한 Playwright (또는 Puppeteer) runner 인프라 spec. 현재 collector 29개 모두 정적 fetch 패턴이라 SPA site 처리 불가.

## 옵션 비교

### 옵션 1 — Vercel cron 에 Playwright 통합

**불가**. 메모리 [[project_naver_rpa_pivot_local_runner_2026_05_12]] 기록:
- Vercel chromium 데이터센터 IP 차단 (naver 등)
- 패키지 크기 lambda 50MB cap 초과
- cold start 5초+

### 옵션 2 — 사장님 PC runner (naver Extension 패턴)

**가능**. 이미 인프라 검증 완료:
- naver Extension 도 사장님 PC Chrome 에서 동작
- Task Scheduler 또는 background script 로 매시간 실행
- `playwright/runner.mjs` 작성 + 결과 POST → keepioo `/api/admin/import-press-batch`

**장점**:
- IP 차단 0
- 비용 0 (PC 24/7)
- 디버깅 쉬움

**단점**:
- 사장님 PC 가동 필요 (24/7 모니터링)
- 외부 변경 시 사장님 PC 직접 update

### 옵션 3 — GitHub Actions runner

**가능**. ubuntu 환경:
- `playwright/test` 패키지 활용
- workflow_dispatch + schedule 매시간
- 결과 POST → keepioo endpoint

**장점**:
- 사장님 PC 무관
- 비용 0 (open source 무료)
- 디버깅 GitHub UI

**단점**:
- GitHub IP 가 일부 정부 site 차단 가능 (이미 5/12 사고: naver 가 GH/Vercel IP 차단)
- 정부 시청 site 는 보통 차단 X (광범위 사용)

### 옵션 4 — Render Web Service (Codex sidecar 패턴 확장)

**가능**. 메모리 [[project_codex_autonomous_phase6_w0_2026_05_18]] 의 Render service srv-d84vlgek1jcs73andjbg 이미 존재. Chromium docker 추가 가능.

**장점**:
- 클로드/Codex 가 직접 deploy 관리
- Render API 로 monitoring

**단점**:
- $7/월 Starter plan (현재 free)
- cold start

## 권장 안

**옵션 3 (GitHub Actions) → 옵션 2 (사장님 PC) fallback** 순서.

이유:
1. GitHub Actions 가 운영 부담 최소 (사장님 액션 0)
2. 정부 site 는 GH IP 차단 위험 낮음 (vs naver / 쇼핑몰)
3. 차단 시 사장님 PC runner 도입 (이미 검증된 path)

## 구현 spec (옵션 3)

### 1. 디렉터리 구조

```
playwright/
  ├── runner-big-cities.mjs  # 큰 시 16 collector
  ├── lib/
  │   ├── changwon.mjs
  │   ├── seongnam.mjs
  │   ├── ansan.mjs
  │   └── ... (15개)
  └── package.json
```

### 2. 각 시 collector (Playwright)

```js
// playwright/lib/changwon.mjs
import { chromium } from 'playwright';

export async function scrapeChangwon(limit = 10) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://www.changwon.go.kr/cwportal/10310/10429/10432.web');
  await page.waitForSelector('table.boardList tr', { timeout: 10000 });

  const items = await page.$$eval('table.boardList tr', (rows, limit) => {
    return rows.slice(0, limit).map(tr => {
      const a = tr.querySelector('a');
      const tds = tr.querySelectorAll('td');
      return {
        title: a?.textContent.trim(),
        url: a?.href,
        publishedDate: tds[3]?.textContent.trim(),
      };
    });
  }, limit);

  // 각 detail page 본문 추출
  for (const item of items) {
    await page.goto(item.url);
    item.body = await page.$eval('.view_cont', el => el.textContent);
  }

  await browser.close();
  return items;
}
```

### 3. GitHub Actions workflow

```yaml
# .github/workflows/big-cities-press.yml
name: Big Cities Press Scraping
on:
  schedule:
    - cron: '0 1,7,13,19 * * *'  # 매 6시간 (KST 10/16/22/4)
  workflow_dispatch:

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
        working-directory: playwright
      - run: npx playwright install chromium
        working-directory: playwright
      - run: node runner-big-cities.mjs
        working-directory: playwright
        env:
          KEEPIOO_API_URL: ${{ secrets.KEEPIOO_API_URL }}
          KEEPIOO_API_KEY: ${{ secrets.KEEPIOO_API_KEY }}
```

### 4. keepioo 신규 endpoint

```ts
// app/api/admin/import-press-batch/route.ts
// POST { city, items: [{title, url, publishedDate, body}] }
// API_KEY 인증 (사장님만)
// news_posts insert 또는 dedupe
```

### 5. registry 통합 가시화

`/admin/autonomous` hub 또는 `/admin/press` 페이지에 "GitHub Actions runner" 카드 추가:
- 최근 24h 실행 횟수
- 실행 실패율
- 시·군별 inserted count

## 작업량 추정

| 단계 | 시간 |
|---|---|
| playwright 디렉터리 + lib 1차 시 4개 collector | 4시간 |
| keepioo /api/admin/import-press-batch endpoint + dedupe | 2시간 |
| GitHub Actions workflow + secrets 설정 | 1시간 |
| 검증 + 첫 cron run + 사고 fix | 2시간 |
| 나머지 12 시 collector | 12시간 |
| **합계** | **21시간** |

= 1.5~2주 사이드 작업.

## 위험 / 의문

1. **GH IP 차단 가능성** — 1차 시 4개 (창원/성남/안산/천안) deploy 후 1주 모니터링. 차단 시 옵션 2 (사장님 PC) 로 pivot.
2. **시청 마다 selector 다양성** — 226 시·군·구 자동화 무리. Phase 1 큰 시 16 만 우선.
3. **dedupe + insert 정책** — 정적 collector 와 같은 endpoint 재사용? 또는 별도? batch 가 더 안전.
4. **사장님 거주지 (전남 순천) 무관** — 큰 시 16 은 사장님 직접 가치 0. SEO + 사이트 coverage 목적.

## 다음 세션 진입점

사장님 결정 사항:
- [ ] 옵션 3 (GitHub Actions) 진행 vs 옵션 2 (사장님 PC) vs #45 보류
- [ ] 1차 시 4개 (창원/성남/안산/천안) 우선
- [ ] $7/월 Render plan 검토 (옵션 4)

관련: [[project_local_press_big_city_findings_2026_05_21]] · [[project_naver_rpa_pivot_local_runner_2026_05_12]] · [[project_codex_autonomous_phase6_w0_2026_05_18]]
