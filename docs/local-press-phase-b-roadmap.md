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
