# 분류 체계 통일 + 통합 검색·추천 강화 설계

작성일: 2026-04-25
상태: 초안 — 사장님 검토 대기
사용자 결정: **옵션 A (분류 체계 통일) + 옵션 C (통합 검색·추천 강화)**

---

## 1. 문제 정의 (점검 결과 요약)

DB 와 UI 를 실측한 결과, keepioo.com 의 카테고리 분류는 **4개 페이지마다 다른 축**으로 운영되고 있다.

| 페이지 | 분류 축 | 상태 |
|---|---|---|
| `/welfare` | 혜택 분야 | DB 10종 vs UI 6종 — **1,021건 (교육·재난·문화·소상공인·농업) 이 카테고리 칩에 없음** |
| `/loan` | 금융 상품 유형 | DB 6종 vs UI 5종 — **600건 ("금융") 이 칩에 없음**, "대출/금융" 의미 중복 |
| `/news` | 채널(news/policy-doc) + topic | **11,295/11,413 (99%) 이 topic 비어 있음** → 토픽 필터 사실상 무력 |
| `/blog` | 인구통계 | 발행 글 8건뿐 — **5개 카테고리 칩이 빈 화면** (주거·육아·가족·큐레이션 등) |

**유료 서비스 관점 핵심 문제 3가지**

1. 사용자가 "주거" 같은 같은 의미의 정책을 4개 영역에서 4번 다른 방식으로 찾아야 함
2. 알림·맞춤 추천(유료 핵심 기능) 이 `benefit_tags` 에 의존하는데, 비표준값(소득/재난 등)이 섞여 정확도 저하
3. `/api/search` 가 welfare+loan 만 보고 news/blog 를 검색하지 않음 — 통합 검색 미완성

---

## 2. 목표 (Goals)

1. **단일 분류 축 도입** — 사이트 전체에서 "주거" 한 번 누르면 4개 영역(복지·대출·뉴스·블로그) 모두 일관된 결과
2. **유료 가치 강화** — 알림·추천이 의존하는 `benefit_tags` 정합성을 99% 이상으로 끌어올림
3. **통합 검색·추천 확장** — `/api/search` 에 news/blog 추가, `/recommend` 결과에 news 추가

### Non-Goals (이번 spec 에서 다루지 않음)

- 결제 플로우 변경, 티어 가격·기능 재설계
- 신규 카테고리 축 도입 (지역·연령은 별도 필터로 유지)
- 모바일 디자인 대규모 리뉴얼
- AdSense/SEO 추가 작업

---

## 3. 단일 분류 축 결정

기준: `lib/tags/taxonomy.ts` 의 `BENEFIT_TAGS` (14종) 를 사이트 표준으로 채택.

```
주거 · 의료 · 양육 · 교육 · 문화 · 취업 · 창업
금융 · 생계 · 에너지 · 교통 · 장례 · 법률 · 기타
```

### 3.1 welfare 비표준값 매핑

| 현재 DB 값 | → 표준값 | 근거 |
|---|---|---|
| 소득 (6,133) | **생계** | 보조금24 raw 분류. "생계" 가 사용자 친화적 |
| 재난 (223) | **생계** | 긴급재난지원금/위기가구 = 생계 성격 |
| 소상공인 (2) | **창업** | 직업축 → 분야축 매핑. occupation_tags 에는 별도 보존 |
| 농업 (1) | **기타** | 직업축. 빈도 낮아 기타로 흡수 |

### 3.2 loan 비표준값 매핑

| 현재 DB 값 | → 표준값 | 비고 |
|---|---|---|
| 대출 (648) | **금융** | 두 값 모두 같은 의미. 합친다 |
| 금융 (600) | **금융** | (위와 동일) |
| 보증 (88) | **금융** | 신용보증재단 상품도 금융 분류 |
| 창업지원 (188) | **창업** | |
| 지원금 (24) | **생계** | 경영안정자금 등 |
| 소상공인지원 (23) | **창업** | |

→ loan 페이지의 카테고리 칩은 **표준 14종 중 실제 데이터 있는 것만** 동적 노출 (예: 금융·창업·생계).

### 3.3 news 11,295건 무토픽 일괄 태깅

- 이미 `extractBenefitTags(text)` 함수가 `lib/tags/taxonomy.ts` 에 있음
- 일회성 마이그레이션 SQL 또는 Node 스크립트로 모든 news_posts 의 title+description 을 입력 → benefit_tags 컬럼에 저장
- 신규 컬럼 추가 필요: `news_posts.benefit_tags TEXT[]` (없다면)
- 기존 `topic_categories` 컬럼은 deprecated 처리 (코드에서 점진 제거)

### 3.4 blog 인구통계 → 분야 보조

- blog 의 인구통계 카테고리(청년/노년/소상공인 등)는 **유지**. 이유: blog 는 글이 적어 분야 축으로 나누면 더 비어 보임
- 단, **빈 카테고리 칩은 동적 숨김** (DB 글 수 0 인 카테고리는 칩에서 제거)
- **blog 에는 별도 `benefit_tags` 컬럼을 추가하지 않는다.** 글이 8건뿐이라 통합 검색·추천에서는 기존 `category` + `title/meta_description` 기반 매칭으로 충분. 글 수 100건 넘으면 그때 컬럼 추가 검토.
- 향후 큐레이션 자동 발행이 누적되면 분야 축으로 전환 검토

---

## 4. UI 변경 (옵션 A 본체)

### 4.1 `/welfare` 페이지

- 카테고리 칩: **표준 14종 중 데이터 있는 것만 동적 노출** (예상 8~9개)
- 칩 라벨에 건수 표기: `"주거 (295)"` 처럼 → 빈 카테고리 클릭 사고 방지
- "전체" 칩은 항상 첫 자리 고정
- 비표준값 일괄 마이그레이션 SQL: `supabase/migrations/031_normalize_welfare_categories.sql`

### 4.2 `/loan` 페이지

- 카테고리 칩: **표준값 중 데이터 있는 것만 동적 노출** (예상 3~4개: 금융·창업·생계 등)
- 같은 건수 표기 정책
- 마이그레이션: `supabase/migrations/032_normalize_loan_categories.sql`

### 4.3 `/news` 페이지

- 토픽 필터를 **표준 14종 기반 칩**으로 교체 (현재 `TOPIC_CATEGORIES` 13종은 deprecated)
- 데이터 있는 표준값만 동적 노출
- benefit_tags 컬럼 추가 마이그레이션: `supabase/migrations/033_news_benefit_tags.sql`
- 일괄 enrich 스크립트: `scripts/retag-news-benefit-tags.ts` (1회 실행 후 cron 추가)

### 4.4 `/blog` 페이지

- 빈 카테고리 칩 동적 숨김
- 표준 14종 도입은 보류 (글 수 적음). 단 메타데이터로 `benefit_tags` 도 함께 저장 시작 → 통합 검색·추천에서 활용

---

## 5. 통합 검색·추천 강화 (옵션 C)

### 5.1 `/api/search` 확장

```
입력: ?q=주거
현재: welfare + loan
변경: welfare + loan + news + blog
```

- 응답 구조 변경:
  ```json
  {
    "welfare": [...],
    "loan": [...],
    "news": [...],
    "blog": [...],
    "total": N
  }
  ```
- 헤더 검색바(`components/search-box.tsx`) 결과 페이지에서 **영역별 그룹 표시** (각 5건 + "더보기")
- 각 결과는 기존 카드(`ProgramRow`, `NewsCard`, `BlogCard`) 재사용

### 5.2 `/recommend` 확장

- 현재: welfare+loan 추천만
- 변경: news + blog 도 사용자 프로필(연령/지역/직업) 기반 매칭
- 결과 화면: `프로그램 추천 / 관련 뉴스 / 가이드 글` 3섹션
- `lib/recommend.ts` 에 `getRelatedNews()`, `getRelatedBlogs()` 추가

### 5.3 유료 차별화 정책 (현행 유지)

- 통합 검색: **무료** (트래픽 유입 채널)
- 통합 추천 무제한: **베이직 이상** (현재 free=5회/일 그대로)
- 알림 매칭 정확도 향상: **베이직 카톡 알림에 자동 반영** — 별도 코드 변경 없이 benefit_tags 정확도가 올라가면 자연 개선

---

## 6. 데이터 마이그레이션 절차

순서가 중요. 무중단 운영이라 단계 분할.

### Step 1 — 신규 컬럼 추가 (안전, ALTER만)
- `031_news_benefit_tags.sql`
  - `ALTER TABLE news_posts ADD COLUMN benefit_tags TEXT[] DEFAULT ARRAY[]::TEXT[];`
  - `CREATE INDEX news_posts_benefit_tags_idx ON news_posts USING GIN (benefit_tags);`

### Step 2 — welfare 비표준값 정규화 (UPDATE)
- `032_normalize_welfare_categories.sql`
  - `UPDATE welfare_programs SET category = '생계' WHERE category IN ('소득', '재난');`
  - `UPDATE welfare_programs SET category = '창업' WHERE category IN ('소상공인');`
  - `UPDATE welfare_programs SET category = '기타' WHERE category IN ('농업');`
- 검증 쿼리: 마이그 후 distinct category 가 BENEFIT_TAGS 안에 모두 포함되는지

### Step 3 — loan 비표준값 정규화
- `033_normalize_loan_categories.sql`
  - `UPDATE loan_programs SET category = '금융' WHERE category IN ('대출', '보증');`
  - `UPDATE loan_programs SET category = '창업' WHERE category IN ('창업지원', '소상공인지원');`
  - `UPDATE loan_programs SET category = '생계' WHERE category IN ('지원금');`

### Step 4 — news 일괄 태깅 (스크립트)
- `scripts/retag-news-benefit-tags.ts`
- 11,413건 × `extractBenefitTags(title + description)` → `news_posts.benefit_tags` 저장
- 배치 100건씩, 진행률 표시
- 실행: 로컬에서 1회 (env 의 SERVICE_ROLE_KEY 사용)

### Step 5 — 컬렉터 정합성
- 신규 welfare/loan/news 수집 시 비표준값이 다시 들어오지 않도록 `lib/tags/taxonomy.ts` 의 `extractBenefitTags` 를 컬렉터에서 호출하는지 확인
- 미흡 시 수집 함수에 정규화 한 줄 추가

---

## 7. 코드 변경 파일 목록

### DB 마이그레이션 (3개)
- `supabase/migrations/031_news_benefit_tags.sql`
- `supabase/migrations/032_normalize_welfare_categories.sql`
- `supabase/migrations/033_normalize_loan_categories.sql`

### 일괄 enrich 스크립트 (1개)
- `scripts/retag-news-benefit-tags.ts`

### UI (4개 페이지)
- `app/welfare/page.tsx` — CATEGORIES 동적화 + 건수 표기
- `app/loan/page.tsx` — CATEGORIES 동적화 + 건수 표기
- `app/news/page.tsx` — 토픽 필터 → benefit_tags 기반 칩
- `app/blog/page.tsx` — 빈 칩 동적 숨김

### 통합 검색·추천 (3개)
- `app/api/search/route.ts` — news+blog 추가, 응답 그룹화
- `lib/recommend.ts` — `getRelatedNews()`, `getRelatedBlogs()` 추가
- `app/recommend/page.tsx` — 3섹션 결과 화면

### 컬렉터 정합성 (필요 시)
- `lib/news-collectors/*.ts` — benefit_tags 자동 채우기 (사용 시)
- `lib/programs.ts` — 카테고리 정규화 helper (필요 시)

**총 10~12개 파일.** 한 번에 묶어 한 PR (commit 여러 개) 로 진행.

---

## 8. 검증 계획

각 단계마다 SQL 실측으로 확인.

```sql
-- welfare: 모두 BENEFIT_TAGS 안에 들어왔나
SELECT category, COUNT(*) FROM welfare_programs
WHERE category NOT IN (
  '주거','의료','양육','교육','문화','취업','창업',
  '금융','생계','에너지','교통','장례','법률','기타'
) GROUP BY category;
-- 기대 결과: 0건

-- loan: 동일
SELECT category, COUNT(*) FROM loan_programs
WHERE category NOT IN (...) GROUP BY category;

-- news: benefit_tags 정합률
SELECT
  COUNT(*) FILTER (WHERE cardinality(benefit_tags) > 0) * 100.0 / COUNT(*) AS pct
FROM news_posts WHERE category != 'press';
-- 기대 결과: 95% 이상
```

UI 검증 (수동):
- `/welfare` 모든 칩 클릭 → 빈 결과 없음
- `/loan` 모든 칩 클릭 → 빈 결과 없음
- `/news` 토픽 칩 → 건수 정상
- 통합 검색 "주거" → 4개 영역 결과 모두 노출
- `/recommend` → news 섹션 노출 확인

---

## 9. 단계별 실행 순서 (권장)

큰 단위 작업 선호하시는 사장님 스타일로, 3개 PR 로 분할 가능하지만 **한 PR 로 묶어 진행** 추천.

1. **마이그레이션 3개 + 스크립트 1개** (DB 정합성 먼저)
2. **UI 4페이지 동적 카테고리** (분류 축 통일 본체)
3. **통합 검색·추천 확장** (옵션 C)
4. **검증 SQL + 수동 UI 점검**
5. master 직접 커밋·푸시 (keepioo workflow)

예상 작업 분량: 1~2 세션 (마이그레이션은 단순, UI 와 search/recommend 가 중심).

---

## 10. 위험·롤백

- **welfare/loan UPDATE** 는 reversible — 마이그레이션 작성 시 reverse SQL 도 주석으로 보존
- **news 일괄 enrich** 는 추가만 (기존 컬럼 손대지 않음) — 안전
- **/api/search 응답 구조 변경** 은 BC 깨짐 — 단, 현재 `components/search-box.tsx` 외 호출처가 거의 없으므로 영향 작음. 호출처 일괄 업데이트.

롤백 발생 시:
- DB: reverse SQL 적용
- UI: revert 커밋

---

## 11. 미결 사항 (사장님 결정 필요)

(없음 — 모든 항목 본 spec 에서 결정)

만약 변경 원하시면 다음 항목 중 알려주세요:
- "소득"/"재난" 의 매핑 라벨 ("생계" 가 아닌 다른 라벨 선호 시)
- loan 의 "대출/금융" 통합 라벨 ("금융" 이 아닌 "대출" 로 통일 선호 시)
- 통합 검색 응답 구조 (현재 영역별 그룹 vs 단일 리스트)
- 한 PR 묶기 vs 3개 PR 분할
