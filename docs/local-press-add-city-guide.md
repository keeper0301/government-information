# 시·군 보도자료 collector 추가 self-service 가이드

5/17 4 commit (평택·포항·익산·대구) 으로 발견한 진단 룰 4가지 + 신규 시·군
추가 단계별 체크리스트. 사장님이 다음 시·군 보고 싶을 때 클로드 없이도
어떤 단계 거치면 되는지 참조.

현재 가동: 20 시·군. 코드 위치 = `lib/scraping/local-press/{city}.ts`.
등록부 = `lib/scraping/local-press/_registry.ts` (single source).

## 1단계 — 사이트 진단 (5분)

신규 시·군 시청 사이트 보도자료 URL 을 확인할 때, 먼저 직접 fetch 해보고
정상 응답인지 4가지 진단 룰 순서대로 시도.

### 진단 룰 1: mid / menu_id 파라미터 누락 (포항 사례)

```bash
curl -sL --max-time 10 "https://www.{city}.go.kr/{path}/list.do?bcIdx={N}"
```

응답이 196 byte 또는 "잘못된 접근입니다." alert 면 → mid 파라미터 누락.

**해결**: 시청 홈에서 보도자료 link 추출 →

```bash
curl -sL "https://www.{city}.go.kr/" | grep -oE "href=\"[^\"]+\"[^>]*>[^<]*보도자료[^<]*</a>"
```

추출된 URL 에 mid=XXXX 가 붙어있으면 정상. 그 URL 로 다시 fetch → 30KB+ 응답이면 성공.

### 진단 룰 2: detail URL 이 .do 표준 link (익산 사례)

list page 가 9is / .web / .jsp 확장자라도, 안의 article anchor 는 `.do` 표준 일 수 있음.

```bash
curl -sL "{list URL}" | grep -oE "href=\"[^\"]*view\.do\?[^\"]+\"" | head -3
```

`/board/post/view.do?...postUid=...` 같은 직접 link 가 나오면 → SPA 우회 가능.

### 진단 룰 3: 보도자료 sub-domain 별도 호스팅 (대구 사례)

www 사이트의 SPA 가 진짜 차단이 아닐 수도. www 의 메뉴 link 가 외부 sub-domain 으로 이동.

```bash
curl -sL "https://www.{city}.go.kr/" | grep -oE "href=\"http://[a-z]+\.{city}[^\"]+\""
```

`info.daegu.go.kr/newshome/` 같은 외부 sub-domain 이 나오면 그쪽이 진짜 list URL.

### 진단 룰 4: SPA 표면 우회 GET (평택 사례)

list page 에 `yhLib.inline.post(this)` + `data-req-form-id="viewForm"` 같은 SPA 표현이 있어도, detail URL 이 GET 도 응답할 가능성.

```bash
# data-req-get-p-idx 추출
curl -sL "{list URL}" | grep -oE "data-req-get-p-idx=\"[0-9]+\"" | head -3
# viewForm action 추출  
curl -sL "{list URL}" | grep -oE "action=\"[^\"]*view\.do\?[^\"]*\"" | head -3
```

action URL + `&idx={NNN}` 추가해서 GET 시도. 30KB+ 응답이면 우회 성공.

### 4가지 모두 fail = 진짜 SPA (Playwright 필요)

`docs/local-press-phase-b-roadmap.md` 의 "보류 누적" 섹션에 추가.
Playwright 도입은 별도 spec (`@sparticuz/chromium` 의존성 검토 필요).

## 2단계 — collector 작성 (10분)

기존 17 시·군 중 유사한 CMS 의 collector 를 복사해서 시작:

| CMS 패턴 | 참조 collector |
|---|---|
| SI 표준 (`yhLib.inline.post` + viewForm) | `pyeongtaek.ts`, `pohang.ts` |
| planweb 9is + table 기반 | `iksan.ts` |
| PHP-based (`mtnmain.php`) | `daegu.ts` |
| table-based (`<td data-cell-header>`) | `sejong.ts`, `iksan.ts` |
| `BD_selectBbs.do` SI 표준 | `hwaseong.ts`, `cheongju.ts` |

복사 후 변경:

1. `LIST_URL`, `DETAIL_BASE` 상수
2. `LIST_ITEM_REGEX` — title + idx + date selector
3. `BODY_REGEX` — 본문 container
4. `decodeEntities` — 사이트별 HTML entity 검토
5. `createPressCollector({ cityName, region, ministry, sourceOutlet, ... })`

## 3단계 — test 추가 (5분)

`__tests__/lib/scraping/local-press/{city}.test.ts` 신규 — 최소 케이스:

- parseListPage: idx + title + date 매핑
- parseListPage: 같은 idx 중복 단일화
- parseDetailBody: 정상 본문 추출
- parseDetailBody: entity 디코딩 (`&middot;`, `&hellip;` 등)
- parseDetailBody: container 없음 → null

```bash
npx vitest run __tests__/lib/scraping/local-press/{city}.test.ts
```

## 4단계 — _registry 등록 (1줄)

`lib/scraping/local-press/_registry.ts` 의 `CITY_REGISTRY` 배열에 추가:

```ts
{
  key: "{cityKey}", // CityKey union 에 추가
  city: "{시명}",
  ministry: "{시명}청",
  ministryAliases: ["{시명}"], // 광역시면 외부 언론 path 매칭용
  siteUrl: "{시청 보도자료 URL}",
  fn: scrape{City}AndInsert,
},
```

`CityKey` union 에도 추가:

```ts
export type CityKey = "suncheon" | "gwangju" | ... | "{cityKey}";
```

이거 1줄 추가로 cron + `/admin/scrape-local` UI + autonomous hub LocalPressCard 모두 자동 반영.

## 5단계 — 검증 + commit (5분)

```bash
npx tsc --noEmit   # 0 error
npx vitest run __tests__/lib/scraping/local-press/  # 전체 통과
```

commit + push 후 다음 KST 09:00 cron 자동 가동.

## 6단계 — 1주 모니터링 (운영)

autonomous hub LocalPressCard 에서 신규 시·군 카드 색깔 확인:
- emerald (정상): inserted ≥1 + errors 0
- amber (오류): errors > 0 → fetchPage 가드 (alert/redirect 감지) 발화
- slate (유휴): inserted 0 — 신규 가동 baseline 정상

3일 연속 stale → `local_press_stale` health-alert 자동 발화 (사장님 SMS).

## 안전망 5 layer 자동 가동

신규 시·군도 기존 안전망 자동 적용:
1. cron 자동 가동 (`/api/cron/scrape-local-press`)
2. 수동 호출 UI (`/admin/scrape-local`)
3. autonomous hub LocalPressCard 시각화
4. `local_press_stale` 능동 알림 (3일 stale 시)
5. `fetchPage` 가드 (redirect/alert silent fail 차단)

자세한 commit 이력 + 보류 시·군 사유 = `docs/local-press-phase-b-roadmap.md`.

## 알려진 일관성 부채 (5/17 spec)

helper 비사용 7 collector (suncheon·gwangju·seoul·busan·incheon·daejeon·ulsan)
(수원은 2026-06-02 Playwright 경로 이관 → cities.mjs scrapeSuwon)
는 자체 inline `.replace(/&xxx;/g, ...)` 5 entity 만 처리. helper (10 entity) 가
처리하는 `&lsquo;/&rsquo;` `&ldquo;/&rdquo;` `&hellip;` `&middot;` `&#NNN;` 은
raw 노출 가능. baseline 영향 작아 일괄 batch 미룸 (회귀 위험 vs 가치 보수적 판단).

향후 batch 적용 시:
1. 각 collector 자체 구조 검토 (suncheon 은 SuncheonNewsItem 자체 type 등 다양)
2. parseDetailBody 의 inline replace chain → `decodeBasicEntities` 호출 교체
3. import 추가만 — `_factory` 의 createPressCollector 와 무관 (helper 만 사용 가능)
4. parseListItems 의 title 매칭은 entity 거의 없는 사이트라 보수적 유지 권장

