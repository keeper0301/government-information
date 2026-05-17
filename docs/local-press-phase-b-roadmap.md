# Phase A district Phase B 로드맵 (G4, 2026-05-17)

Phase A 완료 (5/16): district 컬럼 + 7,272건 백필 + 순천시·광주광역시 collector 가동.

Phase B = **사용자 cohort 확장**: 핵심 광역·시 collector 추가 → 더 많은 사용자 거주지 정책 자동 수집.

## 현재 가동 collector (2종)

| 시·군 | URL 패턴 | CMS 특징 |
|---|---|---|
| 순천시 (전남) | https://www.suncheon.go.kr | table-based, suncheon.ts (182줄) |
| 광주광역시 | https://www.gwangju.go.kr | div.subject + JSON-LD, gwangju.ts (179줄) |

## 우선순위 추가 cohort (사용자 가입 추정 기준)

| 우선 | 광역/시 | URL | 비고 |
|---|---|---|---|
| 1 | 서울특별시 | https://opengov.seoul.go.kr/press/list | 인구 1위, SPA 일부 |
| 2 | 경기 수원시 | https://www.suwon.go.kr | 광역시 외 인구 1위 (120만) |
| 3 | 부산광역시 | https://www.busan.go.kr | 광역시 2위 |
| 4 | 대구광역시 | https://www.daegu.go.kr | 광역시 3위 |
| 5 | 경기 성남시 | https://www.seongnam.go.kr | 판교 etc |

## 신규 collector 추가 패턴 (체크리스트)

1. **lib/scraping/local-press/{city}.ts** 생성 (~180줄)
   - LIST_URL + DETAIL_BASE 상수
   - parseListPage(html) → 항목 list (seq/title/date/sourceUrl)
   - parseDetailBody(html) → 본문 string
   - scrape{City}AndInsert() → 등록 (status='active', region 자동)

2. **app/api/cron/scrape-local-press/route.ts**
   - COLLECTORS array 에 신규 추가

3. **vercel.json**
   - `/api/cron/scrape-local-press` 는 1개 cron 으로 모든 collector 처리

4. **test**
   - parseListPage / parseDetailBody fixture 추가

5. **검증**
   - dry-run: scrape{City}AndInsert({dryRun:true}) 로 selector 정확성
   - 실제 insert: status='active' 1주 모니터링

## 향후 추상화 spec (Phase B-2)

5+ 시·군 collector 가 같은 패턴 반복 시 helper 추출:

```ts
// lib/scraping/local-press/collector-factory.ts
type CollectorConfig = {
  cityName: string;
  region: string;
  listUrl: string;
  detailBase: string;
  itemRegex: RegExp;
  dateRegex: RegExp;
  bodyRegex: RegExp;
};
export function createPressCollector(cfg: CollectorConfig) { ... }
```

→ 각 시·군 = 5 const + 1 instance (~50줄). 5+ 시·군 추가가 1 차에 가능.

## 검증된 안전책

- press_ingest_candidates tier 시스템 (high/mid 자동 + low pending) — G2 reminder cron 으로 검수 부담 ↓
- AdminAction audit (local_press_scrape_run) — 사장님 가시화
- /admin/scrape-local UI — 결과 모니터링

## 사장님 결정 사항

이 spec 진행 시점:
- A. 즉시 (다음 차) — 서울특별시 1개 추가 + 검증
- B. helper 추출 먼저 → 5개 한 번에 (큰 차 1번)
- C. 사용자 cohort 데이터 누적 후 우선순위 결정

## 진행 이력 (2026-05-17)

- ✅ 5/17: 서울특별시 collector 추가 (commit `be45e65`)
- ✅ 5/17: helper 추출 (_factory.ts) + 수원·부산 (commit `bd89abb`) — 5 시·군 가동
- ✅ 5/17: 인천·대전·울산·고양·용인·청주·화성·전주·김해·남양주·세종 추가 — 16 시·군 가동
- ✅ 5/17: **평택시 추가** (commit 1f837b8) — SPA 우회 GET 성공. 17 시·군 가동.
  - 표면적 SPA (`yhLib.inline.post` + viewForm POST 추정) 였으나, `/view.do?bcIdx=90&mid=0402010000&idx={NNN}` GET 도 응답.
  - 직접 fetch 로 collector 추가 (Playwright 의존성 0).
- ✅ 5/17: **포항시 추가** (commit 73adfc2) — referer 가드 우회 + SI 표준 GET. 18 시·군 가동.
  - 초기 진단: `/list.do?bcIdx=644` 직접 GET → "잘못된 접근입니다" alert (referer 가드 추정).
  - 실제 원인: `mid=0102000000` 파라미터 누락. 홈 → 보도자료 link 에서 추출 후 정상 응답.
  - selector 차이: list 는 `<span class="tit">` + `<span class="date">` (평택은 `list_title`/`list_data`).
  - 본문 container 는 view_cont > mT10 (평택과 동일 SI 표준).
- ✅ 5/17: **익산시 추가** (commit 12d0ca4) — planweb 9is CMS. 19 시·군 가동.
  - 초기 진단: 9is 확장자 + JS 라우터 추정으로 보류.
  - 실제 원인: list 는 9is, detail 은 .do 직접 link. table-based (`<td data-cell-header="제목"/"작성일">`).
  - URL pattern: `/board/post/view.do?boardUid=...&menuUid=...&postUid={alphanumeric}`.
  - 본문 container: `hwp_editor_board_content` (한컴 hwp 변환) 우선 + `view_con` fallback.
- ✅ 5/17: **대구광역시 추가** (commit pending) — 보도자료 전용 sub-domain `info.daegu.go.kr`. 20 시·군 가동.
  - 초기 진단: www 사이트의 nttId hidden input (SPA) 보류.
  - 실제 원인: www 의 메뉴 link 가 외부 sub-domain (`info.daegu.go.kr/newshome/`) 으로 이동.
  - URL pattern: `mtnmain.php?mtnkey=articleview&aid={NNN}` (PHP-based, mtnkey 분기로 list/article).
  - 본문 container: `article_view_content`. list 에 date 없음 → `_factory` 가 now() fallback.
- ✅ 5/17: 대구광역시 **추가 완료** (위 항목 참조)
- ⏸ 5/17: 성남시 **보류** — Playwright 필요. SPA + AJAX (모든 link javascript:void).
- ⏸ 5/17: 천안시 **보류** — Playwright 필요. `fn_search_detail('alphanumeric')` JS 함수.
- ⏸ 5/17: 안산시 **보류** — Playwright 필요. fnGoPage pagination 만 노출.
- ⏸ 5/17: 창원시 **보류** — Playwright 필요. portal 메뉴 link 만 노출.
- ✅ 5/17: 포항시 **추가 완료** (위 항목 참조)
- ✅ 5/17: 익산시 **추가 완료** (위 항목 참조)

## 보류 누적 (4개) — Playwright 필요

성남·천안·안산·창원 — 4 시·군 모두 SPA 변형 또는 sitemap 부재.
대구는 5/17 sub-domain 발견으로 해소.
공통 의존성: `@sparticuz/chromium` (Vercel chromium runtime, ~50MB) + `playwright-core`.

### Playwright batch 도입 전 권장 사전 검증

1. **Vercel function size 영향** — `@sparticuz/chromium` 약 50MB 압축, 함수 size 25MB 한도 영향.
   대안: edge runtime + `chrome-aws-lambda` (deprecated) 또는 별도 worker (Cloudflare Workers + Browser Rendering API).
2. **수익 vs 비용** — 보류 7 시·군 총 인구 ~700만. 사용자 cohort 데이터 누적 후 우선순위 결정.
3. **부분 도입** — 포항(referer 가드) 만 `fetch` + Referer/Cookie 추가로 시도 가능. SPA 6개는 Playwright 필수.

## 다음 우선순위 (인구 순)

| 우선 | 시·군 | 비고 |
|---|---|---|
| 1 | 인천광역시 | 광역시 4위, CMS 단순 추정 |
| 2 | 대전광역시 | 광역시 5위 |
| 3 | 울산광역시 | 광역시 6위 |
| 4 | 성남시 (경기) | 판교 cohort |
| 5 | 고양시 (경기) | 인구 ↑ |
| 6 | **대구광역시 (재시도)** | SPA selector 분석 또는 Playwright |
