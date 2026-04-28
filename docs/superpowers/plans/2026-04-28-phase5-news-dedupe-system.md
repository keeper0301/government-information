# Phase 5 — 뉴스 중복 제거 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** keepioo.com news_posts 의 같은 행사 다른 출처 중복을 DB INSERT 단계에서 차단. 1순위 cron skip + 2순위 DB view 안전망.

**Architecture:** dedupe_hash 컬럼 + index 추가 → 각 collector 가 batch 시작 시 7일치 hash 1회 fetch → 새 row 마다 batch 내 + DB 내 jaccard 0.6 매칭 검사 → 통과한 row 만 dedupe_hash 함께 upsert. DB view DISTINCT ON 으로 안전망.

**Tech Stack:** PostgreSQL (ALTER TABLE·CREATE VIEW·INDEX), Supabase admin client, lib/news-dedupe.ts (computeDedupeHash·jaccardOfHashes), 3 collector (korea-kr·korea-kr-topics·naver-news)

**Spec:** `docs/superpowers/specs/2026-04-28-phase5-news-dedupe-system-design.md`

---

## File Structure

| 파일 | 변경 종류 | 책임 |
|---|---|---|
| `supabase/migrations/065_news_dedupe_hash.sql` | create | 컬럼·인덱스·view·NULL 허용 정책 |
| `lib/news-dedupe.ts` | create | computeDedupeHash·jaccardOfHashes·loadRecentDedupeHashes·hasJaccardMatch |
| `lib/news-collectors/korea-kr.ts` | modify | INSERT 전 dedupe 검사 + dedupe_hash 저장 |
| `lib/news-collectors/korea-kr-topics.ts` | modify | 동일 |
| `lib/news-collectors/naver-news.ts` | modify | 동일 |
| `app/admin/news/backfill-dedupe/route.ts` | create | 기존 row dedupe_hash backfill endpoint |
| `app/news/page.tsx` | modify | news_posts → news_posts_deduped view 전환 (Section 4) |

총 7 파일.

---

## Task 1: 마이그레이션 065 — dedupe_hash 컬럼 + index + view

**Files:** `supabase/migrations/065_news_dedupe_hash.sql` (신규)

- [ ] **Step 1.1: 마이그레이션 파일 생성**

```sql
-- 065_news_dedupe_hash.sql
-- 뉴스 중복 제거 시스템 (Phase 5).
--   1) news_posts.dedupe_hash 컬럼 — 한국어 bigram set 직렬화 hash
--   2) idx_news_posts_dedupe_hash — 7일 window lookup 가속
--   3) news_posts_deduped view — DISTINCT ON 안전망

-- 1) 컬럼
ALTER TABLE public.news_posts
  ADD COLUMN IF NOT EXISTS dedupe_hash TEXT;

COMMENT ON COLUMN public.news_posts.dedupe_hash IS
  'lib/news-dedupe.ts computeDedupeHash() 결과. NULL 인 row 는 백필 대상.';

-- 2) 인덱스 — published_at DESC 와 함께 (7일 window 쿼리 최적)
CREATE INDEX IF NOT EXISTS idx_news_posts_dedupe_hash
  ON public.news_posts (dedupe_hash, published_at DESC)
  WHERE dedupe_hash IS NOT NULL;

-- 3) DB view 안전망
-- DISTINCT ON (dedupe_hash) 가 같은 hash 중 published_at 가장 최근 1건만 노출.
-- WHERE dedupe_hash IS NULL OR ... 로 백필 진행 중에도 NULL row 통과 (공백 회피).
CREATE OR REPLACE VIEW public.news_posts_deduped AS
SELECT DISTINCT ON (COALESCE(dedupe_hash, id::text)) *
FROM public.news_posts
WHERE is_hidden = false
ORDER BY COALESCE(dedupe_hash, id::text), published_at DESC NULLS LAST;

GRANT SELECT ON public.news_posts_deduped TO anon, authenticated;
```

- [ ] **Step 1.2: prod apply 명시 승인 받기**

사장님께 prod DDL apply 명시 승인 요청 (메모리 feedback "prod DDL 명시 승인" 규칙).

승인 받으면 다음 step 진행. 승인 안 받으면 STOP — 사장님 명시 후에만 apply.

- [ ] **Step 1.3: prod apply (사장님 승인 후)**

```bash
# Supabase MCP 도구로 apply
# (또는 사장님 콘솔에서 직접 SQL editor)
```

또는 MCP 명령:
- 도구: `mcp__plugin_supabase_supabase__apply_migration`
- name: `news_dedupe_hash`
- query: 위 SQL 전체

- [ ] **Step 1.4: apply 검증**

```sql
-- 컬럼 존재 확인
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'news_posts' AND column_name = 'dedupe_hash';

-- 인덱스 존재 확인
SELECT indexname FROM pg_indexes
WHERE tablename = 'news_posts' AND indexname = 'idx_news_posts_dedupe_hash';

-- view 존재 확인
SELECT viewname FROM pg_views WHERE viewname = 'news_posts_deduped';
```

- [ ] **Step 1.5: 마이그레이션 파일 git 커밋**

```bash
git add supabase/migrations/065_news_dedupe_hash.sql
git commit -m "migration(065): news_posts.dedupe_hash 컬럼 + 인덱스 + DISTINCT view"
```

---

## Task 2: lib/news-dedupe.ts helper

**Files:** `lib/news-dedupe.ts` (신규)

- [ ] **Step 2.1: 파일 생성**

```ts
// lib/news-dedupe.ts
// 뉴스 중복 제거 helper — DB INSERT 전 7일 window 매칭 검사.
//
// display dedupe (lib/personalization/dedupe.ts) 와 분리:
//   - display dedupe: list 후처리, Jaccard 0.5, in-memory
//   - news dedupe: ingestion 전, Jaccard 0.6 (more strict), DB lookup 1회 +
//                  in-memory N×M 비교

import type { SupabaseClient } from "@supabase/supabase-js";

export const NEWS_DEDUPE_THRESHOLD = 0.6;
export const NEWS_DEDUPE_WINDOW_DAYS = 7;
const RECENT_HASHES_LIMIT = 2000;

/**
 * 제목을 dedupe_hash 로 변환.
 *  - 한글·영문·숫자만 남김 (특수문자·공백 제거)
 *  - bigram (글자 쌍) set 추출
 *  - 정렬 + ',' join → string (DB 컬럼 저장 + 다음 비교용)
 */
export function computeDedupeHash(title: string): string {
  if (!title) return "";
  const cleaned = title.replace(/[^가-힣0-9a-zA-Z]/g, "");
  const bigrams = new Set<string>();
  for (let i = 0; i < cleaned.length - 1; i++) {
    bigrams.add(cleaned.slice(i, i + 2));
  }
  return Array.from(bigrams).sort().join(",");
}

/**
 * 두 dedupe_hash 의 Jaccard similarity.
 * hash 가 ',' join 된 bigram set 이라 split 만 하면 됨.
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
 * 7일 window 안의 기존 row 의 dedupe_hash 일괄 fetch.
 * collector 가 batch 시작 시 1회만 호출 → in-memory 비교에 사용.
 */
export async function loadRecentDedupeHashes(
  supabase: SupabaseClient,
  windowDays = NEWS_DEDUPE_WINDOW_DAYS,
): Promise<string[]> {
  const sinceIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("news_posts")
    .select("dedupe_hash")
    .gte("published_at", sinceIso)
    .not("dedupe_hash", "is", null)
    .limit(RECENT_HASHES_LIMIT);
  return (data ?? [])
    .map((r) => r.dedupe_hash)
    .filter((h): h is string => typeof h === "string" && h.length > 0);
}

/**
 * 새 hash 가 기존 hash list 중 임계값 이상 매칭되는 게 있는가?
 */
export function hasJaccardMatch(
  newHash: string,
  existingHashes: string[],
  threshold = NEWS_DEDUPE_THRESHOLD,
): boolean {
  if (!newHash) return false;
  for (const h of existingHashes) {
    if (jaccardOfHashes(newHash, h) >= threshold) return true;
  }
  return false;
}
```

- [ ] **Step 2.2: 타입 체크**

```bash
bunx tsc --noEmit 2>&1 | tail -5
```

Expected: error 0.

- [ ] **Step 2.3: 커밋**

```bash
git add lib/news-dedupe.ts
git commit -m "feat(news-dedupe): bigram hash + Jaccard 7일 window helper"
```

---

## Task 3: korea-kr.ts INSERT 전 dedupe 검사

**Files:** `lib/news-collectors/korea-kr.ts:288-326`

- [ ] **Step 3.1: import 추가**

`lib/news-collectors/korea-kr.ts` 의 import 영역:

```ts
import {
  computeDedupeHash,
  loadRecentDedupeHashes,
  hasJaccardMatch,
} from "@/lib/news-dedupe";
```

- [ ] **Step 3.2: feed loop 시작 시 7일치 hash 1회 fetch + payload 매핑 시 dedupe_hash 추가 + filter**

기존 코드 (line 288 영역):

```ts
const upsertResults = await Promise.allSettled(
  FEEDS.map(async (feed) => {
    // ... feed 처리 + items ...
    const payload = items.map((item) => ({ ...stuff, updated_at: ... }));

    const { data, error } = await supabase
      .from("news_posts")
      .upsert(payload, { onConflict: "slug", ignoreDuplicates: true })
      .select("id");
    // ...
  }),
);
```

변경 후 (각 feed 안에서):

```ts
// feed 처리 + items 까지는 동일

// Phase 5 — 7일 window 의 기존 dedupe_hash 1회 fetch (이 feed 만)
const recentHashes = await loadRecentDedupeHashes(supabase);
// batch 내 자기들끼리 dedupe 용
const seenInBatch = new Set<string>();
let skippedDup = 0;
let skippedBatchDup = 0;

const payload = items
  .map((item) => ({
    // ... 기존 필드 그대로 ...
    updated_at: new Date().toISOString(),
  }))
  .filter((p) => {
    const hash = computeDedupeHash(p.title);
    if (!hash) return true; // hash 못 만들면 그냥 통과 (안전)

    // batch 내 중복 (같은 hash) — 첫 1개만 통과
    if (seenInBatch.has(hash)) {
      skippedBatchDup++;
      return false;
    }
    // 7일 window DB 매칭
    if (hasJaccardMatch(hash, recentHashes)) {
      skippedDup++;
      return false;
    }
    seenInBatch.add(hash);
    // dedupe_hash 를 payload 에 추가 (closure mutation)
    (p as Record<string, unknown>).dedupe_hash = hash;
    return true;
  });

const { data, error } = await supabase
  .from("news_posts")
  .upsert(payload, { onConflict: "slug", ignoreDuplicates: true })
  .select("id");

// 결과 보고에 skippedDup·skippedBatchDup 포함 (return 객체 확장)
```

return 객체 변경:

```ts
return {
  upserted: data?.length ?? 0,
  skipped_dup: skippedDup,
  skipped_batch_dup: skippedBatchDup,
};
```

upsertResults 처리부 (line 336 이후) 도 통계 합산하도록 수정:

```ts
let totalSkippedDup = 0;
let totalSkippedBatchDup = 0;
upsertResults.forEach((ur, idx) => {
  const feed = FEEDS[idx];
  if (ur.status === "fulfilled") {
    upserted += ur.value.upserted;
    totalSkippedDup += ur.value.skipped_dup;
    totalSkippedBatchDup += ur.value.skipped_batch_dup;
  }
  // ... 기존 error 처리
});
```

함수 최종 return 에 통계 포함 (기존 type 에 맞게):

```ts
return {
  upserted,
  skippedDup: totalSkippedDup,        // 신규
  skippedBatchDup: totalSkippedBatchDup, // 신규
  // ... 기존 필드
};
```

(기존 return type 정의 따라 정확한 필드명 정정)

- [ ] **Step 3.3: 타입 체크 + 빌드**

```bash
bunx tsc --noEmit 2>&1 | tail -10
bun run build 2>&1 | tail -5
```

Expected: error 0.

- [ ] **Step 3.4: 커밋 (Task 4·5 와 함께)**

(여기선 commit 하지 않고 Task 4·5 끝나면 한꺼번에)

---

## Task 4: korea-kr-topics.ts INSERT 전 dedupe 검사

**Files:** `lib/news-collectors/korea-kr-topics.ts`

- [ ] **Step 4.1: 파일 read 후 INSERT 위치 확인**

```bash
grep -n 'upsert\|news_posts' lib/news-collectors/korea-kr-topics.ts
```

- [ ] **Step 4.2: korea-kr 와 동일 패턴 적용**

Task 3 의 Step 3.2 패턴을 동일하게 적용:
- import 3 함수
- 7일 hash fetch
- batch + DB 매칭 dedupe filter
- payload 에 dedupe_hash 추가
- return 통계 포함

(파일 구조가 korea-kr 와 다를 수 있으니 read 후 적응)

- [ ] **Step 4.3: 타입 체크**

```bash
bunx tsc --noEmit 2>&1 | tail -5
```

---

## Task 5: naver-news.ts INSERT 전 dedupe 검사

**Files:** `lib/news-collectors/naver-news.ts:302-340`

- [ ] **Step 5.1: import 추가** (Task 3 와 동일)

- [ ] **Step 5.2: payload 생성 후 dedupe filter 추가**

기존 코드 (line 307):

```ts
const payloads = items.map((it) => ({
  // ... 필드 ...
  updated_at: now,
  // ...
}));

let news_upserted = 0;
const { data, error } = await supabase
  .from("news_posts")
  .upsert(payloads, { ... });
```

변경 후:

```ts
// Phase 5 — 7일 window dedupe_hash 1회 fetch (광역별 cron 별 batch)
const recentHashes = await loadRecentDedupeHashes(supabase);
const seenInBatch = new Set<string>();
let skipped_dup = 0;
let skipped_batch_dup = 0;

const filteredPayloads = items
  .map((it) => ({
    // ... 기존 필드 ...
    updated_at: now,
    // ... view_count, keywords, topic_categories ...
  }))
  .filter((p) => {
    const hash = computeDedupeHash(p.title);
    if (!hash) return true;
    if (seenInBatch.has(hash)) { skipped_batch_dup++; return false; }
    if (hasJaccardMatch(hash, recentHashes)) { skipped_dup++; return false; }
    seenInBatch.add(hash);
    (p as Record<string, unknown>).dedupe_hash = hash;
    return true;
  });

let news_upserted = 0;
const { data, error } = await supabase
  .from("news_posts")
  .upsert(filteredPayloads, { ... });
```

return 객체에 통계 추가:

```ts
return {
  province: province.name,
  total,
  news_upserted,
  skipped_dup,
  skipped_batch_dup,
  searchUnits,
  errors,
};
```

- [ ] **Step 5.3: 타입 체크 + 빌드**

```bash
bunx tsc --noEmit 2>&1 | tail -10
bun run build 2>&1 | tail -5
```

- [ ] **Step 5.4: Task 3+4+5 한 commit**

```bash
git add lib/news-collectors/korea-kr.ts lib/news-collectors/korea-kr-topics.ts lib/news-collectors/naver-news.ts
git commit -m "feat(news-collectors): 3 collector INSERT 전 7일 window jaccard dedupe skip"
```

---

## Task 6: backfill endpoint (기존 row dedupe_hash 채움)

**Files:** `app/admin/news/backfill-dedupe/route.ts` (신규)

- [ ] **Step 6.1: 파일 생성**

```ts
// app/admin/news/backfill-dedupe/route.ts
// 기존 news_posts row 의 dedupe_hash 백필 endpoint.
// admin 본인이 GET /admin/news/backfill-dedupe?limit=500 으로 trigger.
// 1회 호출당 최대 limit 개 처리, NULL 0 될 때까지 반복 호출 필요.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { computeDedupeHash } from "@/lib/news-dedupe";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // admin 가드
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "500"), 2000);

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("news_posts")
    .select("id, title")
    .is("dedupe_hash", null)
    .limit(limit);

  if (!rows || rows.length === 0) {
    return NextResponse.json({ updated: 0, remaining: 0, message: "백필 완료" });
  }

  let updated = 0;
  for (const row of rows) {
    const hash = computeDedupeHash(row.title ?? "");
    if (!hash) continue;
    const { error } = await admin
      .from("news_posts")
      .update({ dedupe_hash: hash })
      .eq("id", row.id);
    if (!error) updated++;
  }

  // remaining count
  const { count: remaining } = await admin
    .from("news_posts")
    .select("*", { count: "exact", head: true })
    .is("dedupe_hash", null);

  return NextResponse.json({
    updated,
    remaining: remaining ?? 0,
    message: remaining && remaining > 0 ? "다시 호출 필요" : "백필 완료",
  });
}
```

- [ ] **Step 6.2: 타입 체크 + 빌드**

```bash
bunx tsc --noEmit 2>&1 | tail -5
bun run build 2>&1 | tail -5
```

- [ ] **Step 6.3: 커밋**

```bash
git add app/admin/news/backfill-dedupe/route.ts
git commit -m "feat(admin): /admin/news/backfill-dedupe — 기존 row dedupe_hash 백필 endpoint"
```

- [ ] **Step 6.4: prod 배포 후 사장님 백필 trigger**

prod 배포 → 사장님 chrome 으로 접속:
- `https://www.keepioo.com/admin/news/backfill-dedupe?limit=2000`
- response: `{ updated: N, remaining: M }`
- remaining > 0 면 다시 호출 (10초 간격, 5~10회 반복)
- remaining === 0 → 백필 완료

---

## Task 7: /news 가 news_posts_deduped view 사용

**Files:** `app/news/page.tsx`

- [ ] **Step 7.1: query·poolQuery 의 .from() 변경**

`app/news/page.tsx` 의 모든 `.from("news_posts")` → `.from("news_posts_deduped")`

```bash
grep -n 'from\("news_posts"\)' app/news/page.tsx
```

각 위치 변경. count·order 동작 동일 (view 가 기본 select * 라 컬럼 동일).

- [ ] **Step 7.2: 타입 체크 + 빌드**

```bash
bunx tsc --noEmit 2>&1 | tail -10
bun run build 2>&1 | tail -5
```

Expected: error 0. (Supabase TypeScript types 에 view 가 없으면 type error — 그 경우 generated types 재생성 또는 `as any` cast 임시)

- [ ] **Step 7.3: 동작 검증**

prod 배포 후:
- /news 접속 → list 정상 노출 (개수는 view dedupe 라 약간 줄어들 수 있음)
- /news?province=seoul → 광역 필터 정상
- /news?category=news → 카테고리 필터 정상

- [ ] **Step 7.4: 커밋**

```bash
git add app/news/page.tsx
git commit -m "feat(news): /news 쿼리를 news_posts_deduped view 로 전환 (안전망 활용)"
```

---

## Task 8: 종합 검증 + push

- [ ] **Step 8.1: chrome 검증**

playwright 또는 사장님 chrome:
- /news 접속 → 같은 행사 중복 사라짐
- /news?page=2 → 정상
- /news 개인화 섹션 (로그인) → 중복 0

- [ ] **Step 8.2: cron 1회 수동 trigger**

`/admin/cron-trigger` 또는 직접 endpoint 호출:
- /api/collect-news 또는 동등 endpoint
- response 에 `skipped_dup` `skipped_batch_dup` 통계 ≥ 0 (실제 dedupe 발생 시 ≥ 1)

- [ ] **Step 8.3: push (사장님 명시 후)**

```bash
git push origin master
```

- [ ] **Step 8.4: 메모리 갱신**

`project_keepioo_phase5_news_dedupe_2026_04_28.md` 신설 + MEMORY.md 인덱스 추가:
- 변경 영역 (7 파일 + 마이그레이션 065)
- 핵심 commits
- 사장님 외부 액션 (prod DDL 명시 승인·백필 trigger)
- 1주 관측 후 application dedupe cleanup 결정 메모

---

## Self-Review

### 1. Spec 커버리지

| Spec section | Plan task | 커버 |
|---|---|---|
| Section 1 컬럼 + 마이그레이션 | Task 1 | ✅ |
| Section 2 helper | Task 2 | ✅ |
| Section 3 3 collector skip | Task 3·4·5 | ✅ |
| Section 4 view 안전망 | Task 1 (CREATE VIEW) + Task 7 (/news 사용) | ✅ |
| Section 5 application cleanup (1주 후) | 후속, plan X | ✅ (의도) |
| Section 7 검증·롤백 | Task 8 | ✅ |
| backfill endpoint | Task 6 | ✅ (Section 2 의 backfill 전략 구현) |

빠짐 없음.

### 2. 회귀 가드
- 각 task 후 typecheck (Step 2.2·3.3·4.3·5.3·6.2·7.2)
- 마이그레이션 prod apply 후 schema 검증 (Step 1.4)
- backfill 후 NULL row 0 확인 (Step 6.4)
- chrome 시각 검증 (Step 8.1)

### 3. Type 일관성
- `dedupe_hash` 컬럼 — Task 1 추가, Task 3·4·5 사용, Task 6 백필
- `computeDedupeHash`·`loadRecentDedupeHashes`·`hasJaccardMatch` — Task 2 정의, Task 3·4·5·6 사용
- `news_posts_deduped` view — Task 1 정의, Task 7 사용

### 4. 위험 요소

- **prod DDL apply 명시 승인** — Task 1.2 에서 사장님 명시 필수. 미승인 시 STOP
- **backfill 시간** — 기존 row 수에 따라 2000개씩 5~10회 호출. 사장님 chrome 부담
- **collector return type 변경** — skipped_dup·skipped_batch_dup 추가가 caller (cron route) 에 영향. caller 도 같이 수정 필요 가능성
- **view type generation** — Supabase types 에 view 가 없을 수 있음, Task 7.2 의 type error 시 cast 처리

---

## 진행 후 보고

각 task 완료 후 짧게:
```
✅ Task N 완료
- 변경: <파일>, 커밋: <hash>
- typecheck/build 통과
```

전체 완료 시:
```
✅ Phase 5 완료
- 7 commits push, 마이그레이션 065 prod apply
- backfill 완료 (NULL 0)
- /news 중복 사라짐 chrome 검증
- 1주 관측 후 application dedupe cleanup 결정
- 다음 phase: Phase 6 (운영 모니터링) 또는 외부 작업 대기
```
