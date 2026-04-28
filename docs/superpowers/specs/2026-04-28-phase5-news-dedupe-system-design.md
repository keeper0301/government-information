# Phase 5 — 뉴스 중복 제거 시스템 (DB-level dedupe)

**작성일**: 2026-04-28
**대상**: keepioo.com news_posts 테이블 dedupe 인프라
**범위**: 1순위 cron skip + 2순위 DB view 안전망 (3순위 welfare/loan 제외)

---

## 1. 동기

사용자 보고 사고 2건 (2026-04-28):
- /news 개인화 섹션에 "전남교육청 채용설명회" 4 출처 4 row 노출
- /news 전체 list 에 "고유가 피해 지원금" (kbs.co.kr) 동일 카드 2회 노출

응급조치:
- ec41cd7·31443b7 — application-level dedupe (display 시점 후처리, Jaccard 0.5)
- 한계: 페이지 분산 위험·count 불일치·동일 collector 2회 INSERT 가능

근본 해결: **DB INSERT 단계 dedupe** — 같은 행사 row 가 DB 에 1건만 들어가게.

---

## 2. Section 1 — `dedupe_hash` 컬럼 + 마이그레이션

### 2.1 schema 변경

`supabase/migrations/065_news_dedupe_hash.sql`:

```sql
-- news_posts.dedupe_hash : 제목 정규화 후 한국어 bigram set 의 정렬된 string.
-- 같은 행사·정책의 다른 출처 뉴스 INSERT 차단·view DISTINCT 용.

ALTER TABLE public.news_posts
  ADD COLUMN IF NOT EXISTS dedupe_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_news_posts_dedupe_hash
  ON public.news_posts (dedupe_hash, published_at DESC)
  WHERE dedupe_hash IS NOT NULL;

-- 기존 row backfill — title 만으로 채울 수 있는 단순 hash.
-- (정확한 bigram serialized 는 application 함수라 DB 에서 못 채움.
-- 마이그레이션 후 별도 cron 또는 admin 페이지로 backfill)
COMMENT ON COLUMN public.news_posts.dedupe_hash IS
  'lib/news-dedupe.ts computeDedupeHash() 결과. NULL 인 row 는 backfill 대상';
```

### 2.2 backfill 전략

- 마이그레이션 안 SQL backfill 은 PostgreSQL function 으로 한국어 bigram 처리 어려움 → application backfill
- `app/admin/news/backfill-dedupe/route.ts` (신규, server-side endpoint) — admin 본인 trigger
- 또는 별도 cron (1회성)
- backfill 완료 후 `WHERE dedupe_hash IS NULL` row 0 확인

---

## 3. Section 2 — `lib/news-dedupe.ts` helper

```ts
// lib/news-dedupe.ts
// 뉴스 중복 제거 helper — DB INSERT 전 7일 window 매칭 검사.
// display dedupe (lib/personalization/dedupe.ts) 와 분리:
//   - display dedupe: list 후처리, Jaccard 0.5, in-memory
//   - news dedupe: ingestion 전, Jaccard 0.6 (more strict), DB lookup

const NEWS_DEDUPE_THRESHOLD = 0.6;
const WINDOW_DAYS = 7;

/**
 * 제목을 dedupe_hash 로 변환.
 *  - 한글·영문·숫자만 남김
 *  - bigram set 추출
 *  - 정렬 + ',' 조인 → string
 *  - 같은 제목 → 같은 hash
 *  - DB 컬럼에 그대로 저장 (lookup 용)
 */
export function computeDedupeHash(title: string): string {
  const cleaned = title.replace(/[^가-힣0-9a-zA-Z]/g, "");
  const bigrams = new Set<string>();
  for (let i = 0; i < cleaned.length - 1; i++) {
    bigrams.add(cleaned.slice(i, i + 2));
  }
  return Array.from(bigrams).sort().join(",");
}

/**
 * 두 dedupe_hash 의 Jaccard similarity.
 * hash 가 ',' 로 join 된 bigram set 이라 split 만 하면 됨.
 */
export function jaccardOfHashes(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a.split(","));
  const setB = new Set(b.split(","));
  let inter = 0;
  for (const x of setA) {
    if (setB.has(x)) inter++;
  }
  const union = setA.size + setB.size - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * 7일 window 안에 jaccard 임계값 이상 매칭하는 기존 row 가 있는지 검사.
 *
 * 성능: 7일치 dedupe_hash 만 fetch (LIMIT 500 정도) → application 측 비교.
 * 데이터량: 24h 신규 ~수십~수백 건. 7일치도 1000 건 미만 가정.
 *
 * @returns 매칭된 기존 row 의 id 또는 null
 */
export async function findDuplicateInWindow(
  supabase: SupabaseAdminClient,
  newHash: string,
  windowDays = WINDOW_DAYS,
  threshold = NEWS_DEDUPE_THRESHOLD,
): Promise<string | null> {
  if (!newHash) return null;
  const sinceIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("news_posts")
    .select("id, dedupe_hash")
    .gte("published_at", sinceIso)
    .not("dedupe_hash", "is", null)
    .limit(500);

  if (!data) return null;
  for (const row of data) {
    if (!row.dedupe_hash) continue;
    if (jaccardOfHashes(newHash, row.dedupe_hash) >= threshold) {
      return row.id;
    }
  }
  return null;
}
```

성능 고려:
- 7일치 fetch limit 500 — 신규 cron 매 5분 실행 시 ~수십 건. 7일 = 수천 건이지만 dedupe_hash IS NOT NULL 인 row 만이라 적정
- jaccard 비교 in-memory — bigram set 이 작아서 빠름 (<1ms per pair)
- 1 collector 1 cron 1회 호출당 lookup ~수백~천 회 → 1초 미만

---

## 4. Section 3 — 3 collector INSERT 전 dedupe skip

대상:
- `lib/news-collectors/korea-kr.ts`
- `lib/news-collectors/korea-kr-topics.ts`
- `lib/news-collectors/naver-news.ts`

각 collector 의 INSERT 직전:

```ts
import { computeDedupeHash, findDuplicateInWindow } from "@/lib/news-dedupe";

// 새 row 의 dedupe_hash 계산
const dedupeHash = computeDedupeHash(post.title);

// 7일 window 매칭 기존 row 검사
const dupId = await findDuplicateInWindow(supabase, dedupeHash);
if (dupId) {
  skippedDup++;
  continue; // INSERT 안 함
}

// INSERT 시 dedupe_hash 함께 저장
await supabase.from("news_posts").upsert({
  ...post,
  dedupe_hash: dedupeHash,
}, { onConflict: "source_code,source_id" });
```

각 collector 는 결과 보고 시 `inserted_X / skipped_dup_Y / skipped_existing_Z` 통계 노출.

---

## 5. Section 4 — DB view 안전망

### 5.1 view 정의

`supabase/migrations/065_news_dedupe_hash.sql` 안 (또는 별도 파일):

```sql
-- DB view 안전망 — cron skip 가 못 잡은 동시 INSERT 경합 대비.
-- DISTINCT ON (dedupe_hash) 가 같은 hash 중 published_at 가장 최근 1건만 노출.
CREATE OR REPLACE VIEW public.news_posts_deduped AS
SELECT DISTINCT ON (dedupe_hash) *
FROM public.news_posts
WHERE dedupe_hash IS NOT NULL AND is_hidden = false
ORDER BY dedupe_hash, published_at DESC NULLS LAST;

GRANT SELECT ON public.news_posts_deduped TO anon, authenticated;
```

### 5.2 /news 사용

`app/news/page.tsx` 의 query·poolQuery 가 `news_posts` → `news_posts_deduped` 로 전환:

```ts
// 변경 전
.from("news_posts")
// 변경 후
.from("news_posts_deduped")
```

count(exact) 도 view 기반 → count 정확 (WARN-1 해결).

### 5.3 dedupe_hash 가 NULL 인 row 처리
- view 가 `WHERE dedupe_hash IS NOT NULL` 이라 backfill 전엔 view 가 빈 결과
- 마이그레이션 + backfill 완료 후 view 사용 시작
- 또는 view 의 WHERE 절 제거 (NULL 도 통과) — 백필 진행 중 안전

---

## 6. Section 5 — application dedupe cleanup (후속, 1주 관측 후)

prod 1주 관측 후:
- cron skip 통계 (skipped_dup) 가 dedupe 효과 충분 → application dedupe 제거 가능
- `app/news/page.tsx` 의 `dedupeBySimilarity` 후처리 2곳 (personalSection·list) 제거
- 별도 commit (이번 phase X)

---

## 7. 검증·롤백

### 검증 절차
1. 마이그레이션 prod apply (사장님 명시 승인 필요 — 메모리 feedback)
2. backfill endpoint 호출 → 기존 row 의 dedupe_hash 채움 → NULL row 0 확인
3. cron 1회 수동 trigger → skipped_dup 통계 확인
4. /news 접속 → 같은 행사 중복 사라짐 확인
5. lighthouse 회귀 < 5점

### 회귀 trigger (즉시 revert)
- 마이그레이션 후 INSERT 가 모두 skip (false positive 폭주) → 임계값 0.6 → 0.7 로 상향
- view 사용 후 /news 가 빈 결과 (NULL row 보호 안 됨) → view WHERE 제거
- backfill 중 timeout → 페이지네이션 수동 backfill

### prod backup
- Supabase 자동 backup (Pro 플랜) 활성. 마이그레이션 전 24h backup 시점 확인

---

## 8. 의존성·리스크

### 의존성
- prod DDL apply (사장님 명시 승인)
- backfill endpoint trigger (admin 페이지 또는 cron)

### 리스크

| 리스크 | 완화책 |
|---|---|
| Jaccard 0.6 이 너무 strict → 같은 행사 못 잡음 | prod 관측 후 0.5 로 조정 가능 (helper 의 default 변경) |
| 7일 window 너무 짧음 → 8일째 같은 행사 INSERT 됨 | window 14일로 확장 가능 (limit 500 도 늘려야) |
| backfill 시 CPU·DB 부하 | 페이지네이션 (1000 row 씩) + sleep 옵션 |
| view 사용 후 query plan 변화로 느림 | view 의 dedupe_hash index 활용 — EXPLAIN 검증 |
| 동시 INSERT 경합 (cron 동시 실행) | view 가 안전망 — 같은 hash 중 1건만 노출 |
| 기존 application dedupe 삭제 시점 misjudgment | Section 6 — 1주 관측 후 결정, 안전 보존 |

---

## 9. 성공 기준

- ✅ news_posts.dedupe_hash 컬럼 + index 추가, 기존 row backfill 완료 (NULL 0)
- ✅ 3 collector 가 INSERT 전 jaccard skip + 통계 보고
- ✅ news_posts_deduped view 생성, /news 사용 전환
- ✅ prod 24h 후 cron skip 통계 ≥ 1 (실제 dedupe 발생 확인)
- ✅ /news 접속 시 같은 행사 중복 0 (사장님 chrome 검증)
- ✅ lighthouse 회귀 < 5점

위 6개 모두 충족 시 Phase 5 완료. 1주 관측 후 application dedupe cleanup 결정.
