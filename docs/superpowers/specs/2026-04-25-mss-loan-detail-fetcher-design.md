# mss loan detail-fetcher (Phase 2)

> **한 줄 요약**: `loan_programs` 의 mss source 549건이 `raw_payload` 에 보존된 List API 응답에서 `eligibility / contact_info / detailed_content` 3개 컬럼을 외부 호출 없이 채우는 detail-fetcher 추가. youthcenter 패턴 그대로.

## 배경·목적

keepioo 의 loan_programs 테이블에는 mss (중소벤처기업부) source 549건 (전체 loan 의 35%)이 있다. 현재 채움률은 description 100%, loan_amount 38%, interest_rate 29%, **eligibility / apply_method / contact_info / detailed_content 0%** 이다. 즉 List API 가 채워주는 기본 필드만 있고, 사용자 상세 페이지에서 보여줄 풍부한 본문이 비어있다.

mss data.go.kr API 는 별도 Detail 엔드포인트를 제공하지 않는다 (2026-04-24 Exa 검증). 그러나 **List API 응답 자체가 이미 풍부한 필드** (지원조건·모집분야·담당부서 등) 를 포함한다. 기존 collector 인 `lib/collectors/loans-mss.ts` 가 2026-04-24 Phase 1 (커밋 `66b97aa`) 에서 응답 XML 의 모든 태그를 dict 로 `raw_payload` JSONB 컬럼에 보존하도록 확장됐다.

이 spec 은 그 다음 단계 — **`raw_payload` 에서 추가 필드를 추출해 3개 컬럼을 채우는 detail-fetcher** 를 정의한다. 이미 가동 중인 youthcenter detail-fetcher (`lib/detail-fetchers/youthcenter.ts`, 커밋 `be3e5dc`) 와 100% 동일한 패턴을 사용한다.

### 왜 지금인가

사장님이 자영업자 1명한테 keepioo 를 보여주려고 할 때 (office-hours 2026-04-25 결론), mss 공고 상세 페이지가 **"제목·요약만 있는 빈 박스"** 인 vs **"지원대상·연락처·신청 절차가 분리된 풍부한 박스"** 인 차이가 인터뷰 결과를 가른다. 이 fetcher 는 사용자 1명을 만나기 전에 데이터가 두꺼워져 있도록 하는 사전 작업이다.

---

## 1. 데이터 모델

**변경 없음.** 컬럼 추가·인덱스 추가·RLS 변경 모두 없음.

기존 `loan_programs` 테이블의 다음 컬럼들이 이 fetcher 의 결과로 채워진다 (모두 nullable text 컬럼, 이미 존재):

- `eligibility` — 지원 대상·자격 요건
- `contact_info` — 담당 부서·문의처
- `detailed_content` — 모집 분야·지원 조건·신청 절차·모집 기간 등 풍부한 본문

`last_detail_fetched_at` 컬럼은 마이그레이션 020 으로 이미 존재하며, `/api/enrich` cron 이 이 컬럼을 기준으로 row 를 골라온다. fetcher 가 update 시 `now()` 로 갱신한다 (이 동작은 enrich route 가 처리, fetcher 책임 아님).

---

## 2. 컴포넌트

### 2.1 신규 파일: `lib/detail-fetchers/mss.ts`

`DetailFetcher` 인터페이스 (`lib/detail-fetchers/index.ts` 정의) 구현. youthcenter.ts 의 골격을 그대로 따른다.

#### 함수 구조

| 함수 | 역할 |
|---|---|
| `isMeaningful(raw)` | "해당없음", "-", "", "미정", "추후공지" 등 무의미 값 필터. youthcenter 의 SKIP set + mss 만의 무의미 패턴 1~2개 추가 |
| `str(raw)` | `isMeaningful` 통과 시 trim 한 문자열, 아니면 null |
| `buildEligibility(payload)` | `writerPosition` + raw_payload 의 자격 요건 관련 태그 조합 → `"대상: ...\n자격: ..."` 형식 문자열 또는 null |
| `buildContactInfo(payload)` | 담당부서·문의처 관련 태그 조합 → `"담당부서: ...\n연락처: ..."` 형식 문자열 또는 null |
| `buildDetailedContent(payload)` | `dataContents` + 모집분야·신청절차·모집기간 원문 등 풍부한 본문 → `"▸ 지원 내용\n...\n\n▸ 신청 절차\n..."` 형식 문자열 또는 null |
| `fetcher` | `DetailFetcher` 객체 — sourceCode='mss', enabled() always true, applies(row), fetchDetail(row) |

#### `applies(row)` 조건

다음을 모두 만족할 때만 처리:

1. `row.source_code === 'mss'`
2. `row.source_id` truthy (mss List 응답의 viewUrl 마지막 segment 또는 title)
3. `row.raw_payload` 가 truthy 한 object

세 조건 중 하나라도 실패하면 false → enrich route 가 skipped 로 기록.

#### `fetchDetail(row)` 동작

```ts
const payload = row.raw_payload as MssItem | null;
if (!payload) return null;

const eligibility = buildEligibility(payload);
const contact = buildContactInfo(payload);
const detailed = buildDetailedContent(payload);

if (!eligibility && !contact && !detailed) return null;

return { eligibility, contact_info: contact, detailed_content: detailed };
```

3개 다 null 이면 update 자체를 안 한다 (불필요한 DB write 방지).

### 2.2 레지스트리 등록: `lib/detail-fetchers/index.ts`

기존 fetcher 배열 (`youthcenter`, `bokjiro`) 옆에 `mss` import + 등록. 한 줄.

---

## 3. 데이터 흐름

```
[기존 cron] /api/enrich (6회/일)
  ↓
loan_programs row 후보 SELECT
  - last_detail_fetched_at 이 가장 오래된 (또는 NULL) 순
  - 한 번에 N건 (기존 정책 유지)
  - source_code 'naver-news-*' 는 제외 (기존, 2026-04-25 30ee9a0)
  ↓
[신규] fetcher = mss fetcher 가 applies(row) 통과
  - youthcenter / bokjiro / mss 중 first match wins
  ↓
fetcher.fetchDetail(row)
  - raw_payload 에서 의미있는 필드 추출
  - 3컬럼 빌드 (eligibility, contact_info, detailed_content)
  - 셋 다 null 이면 null 반환 → skipped
  ↓
[기존] loan_programs UPDATE
  - 반환된 컬럼만 update
  - last_detail_fetched_at = now()
```

**외부 HTTP 호출 0건.** API 쿼터·rate limit 무관. Vercel Hobby 60s maxDuration 안에서 안전 (DB query 만, 매우 빠름).

---

## 4. 수용 기준 (Acceptance Criteria)

구현 완료 판단. 하나라도 안 맞으면 미완.

1. `lib/detail-fetchers/mss.ts` 가 `DetailFetcher` 인터페이스를 만족한다 (TypeScript 컴파일 통과).
2. `lib/detail-fetchers/index.ts` 의 fetcher 레지스트리에 mss 가 등록되어 있다.
3. `/admin/enrich-detail` 수동 트리거를 `source_code='mss'` 필터로 5건 실행했을 때, **3건 이상** 에서 `eligibility`·`contact_info`·`detailed_content` 중 **최소 1개** 컬럼이 NULL 에서 의미있는 텍스트로 채워진다.
4. mss row 중 `raw_payload` 가 NULL 인 것은 fetcher 가 skipped 로 처리하고 update 하지 않는다 (`applies()` false 통과 검증).
5. 같은 mss row 를 다시 enrich 했을 때 `last_detail_fetched_at` 만 갱신되고 3컬럼 내용은 변하지 않는다 (멱등성, raw_payload 가 그대로면 추출 결과도 그대로).
6. youthcenter / bokjiro fetcher 의 동작에 영향이 없다 (회귀 없음).

---

## 5. 범위 밖 (의도적 제외)

| 항목 | 이유 |
|---|---|
| Hard-coded 새 컬럼 추가 | youthcenter 와 동일한 3컬럼만 사용. 신규 마이그레이션 불필요 |
| 외부 HTTP fetch (mss.go.kr 게시판 본문) | data.go.kr Detail API 미제공 + 2026-04-24 PoC 에서 SPA 차단 + ROI 낮음 (raw_payload 가 이미 충분) |
| LLM 정규화 (Gemini 등) | 2026-04-24 Gemini 의존성 0 정책 |
| smes.go.kr Open API 별도 인증키 도입 | 메모리 노트 — ROI 낮음 (welfare 대비 10% 데이터양), 외부 인증키 추가 운영 부담 |
| 자동 unit test | 외부 호출 0 + 단순 함수 4개. 진짜 검증 = prod DB 실데이터 dryrun. 구현 plan 의 검증 단계에서 처리 |
| 549건 즉시 100% 백필 | raw_payload NULL row 는 다음 cron 자연 채움 (며칠). office-hours 의 인터뷰 시점 (1주일 내) 에 충분 |

---

## 6. 구현 작업 단위

| # | 파일 | 작업 |
|---|---|---|
| 1 | `lib/detail-fetchers/mss.ts` (신규) | 함수 4개 + fetcher 객체. youthcenter.ts 골격 복제 후 mss 매핑 적용 |
| 2 | `lib/detail-fetchers/index.ts` | mss fetcher import + 레지스트리 등록 한 줄 |
| 3 | (검증) | DB 에서 mss raw_payload 1건 SELECT → 실제 태그명 확인 → 매핑 가설 보정 |
| 4 | (검증) | `/admin/enrich-detail` 수동 5건 dryrun → 결과 sanity check |

**구현 순서:** #3 (DB 한 건 봐서 raw_payload 의 실제 태그명 확정) → #1 → #2 → #4. 

#3 을 먼저 하는 이유: spec 단계에서 mss raw_payload 의 정확한 태그명은 가설. youthcenter 는 List API 응답 필드명이 공식 문서로 확정돼 있어 직접 매핑 가능했지만, mss 는 응답 XML 의 실제 태그가 어떻게 구성되는지 모름 (collector 가 `parseAllTags` 로 unknown shape 으로 보존 중). 첫 1건만 보면 매핑 확정 가능.

---

## 7. 리스크·주의사항

| 리스크 | 영향 | 대응 |
|---|---|---|
| raw_payload 의 실제 태그명 가설이 틀림 | 매핑 코드가 빈 결과 반환 → 모든 mss row skipped | 작업 #3 (DB 1건 SELECT) 으로 spec 단계 가설 사전 검증. 구현 시작 전에 매핑 확정 |
| mss 만의 무의미 패턴 누락 | 사용자 화면에 "신청기간: 추후공지" 같은 소음 노출 | 첫 dryrun 결과 보고 `isMeaningful` SKIP set 확장 |
| 549건 처리 속도 | enrich cron 6회/일 × N건이라 며칠 소요 | 외부 호출 0이라 batch 크기 늘릴 수 있음 (구현 plan 에서 검토) |
| youthcenter / bokjiro 회귀 | 다른 fetcher 의 applies() 와 충돌 | DetailFetcher 의 first-match-wins 구조 유지. mss applies() 가 source_code 기준 strict 매치라 충돌 불가능 |
| Phase 1 적용 전 수집된 raw_payload NULL row 가 영원히 안 채워짐 | mss 549건 중 일부 영구 skip | mss collector 의 upsert 가 같은 source_id 면 raw_payload 갱신 → 다음 cron 라운드부터 자동 채움. 일주일 내 549건 모두 채워질 전망 |

---

## 8. 검증 절차 (구현 plan 단계에서 수행)

1. **raw_payload 매핑 확정** — Supabase 대시보드 또는 MCP 로 1건 SELECT:
   ```sql
   SELECT raw_payload FROM loan_programs WHERE source_code='mss' AND raw_payload IS NOT NULL LIMIT 1;
   ```
   응답의 실제 태그명을 보고 buildEligibility / buildContactInfo / buildDetailedContent 의 태그 매핑 코드 작성.

2. **로컬 dry-run** — 가능하면 Node script 또는 임시 API endpoint 로 fetcher 를 1건 row 에 호출 → 추출 결과 3개 컬럼을 console.log → 사람 눈으로 검토. 만족 시 다음 단계.

3. **prod 5건 dryrun** — 사장님이 `/admin/enrich-detail` 로 5건 수동 트리거. `/admin/news` 의 enrich 통계 또는 `loan_programs` 직접 SELECT 로 3컬럼이 채워졌는지 확인.

4. **prod 모니터링** — 다음 enrich cron 1~2회 자동 실행 후 mss row 의 3컬럼 채움률 변화 확인. 기대치: 며칠 내 549건 중 raw_payload 가 채워진 row (= Phase 1 적용 후 1회 이상 collector 에 의해 갱신된 row) 100% 가 3컬럼 중 최소 1개 채움.

5. **사용자 임팩트 검증 (사장님 office-hours assignment 와 연동)** — 자영업자 1명한테 keepioo 의 mss 상세 페이지 보여주기. "지원 대상" 박스가 분리돼 보이는지 + 5초 안에 "내가 신청 가능한지" 판단 나오는지 관찰.
