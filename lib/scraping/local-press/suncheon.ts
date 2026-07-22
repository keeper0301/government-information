// ============================================================
// 순천시청 보도자료 수집 — Phase B 첫 시범 시·군 collector
// ============================================================
// 사장님 거주지 (전남 순천) 보도자료 자동 수집. 광역 단위 (전라남도)
// press_ingest 외 시·군 단위 신규 파이프라인.
//
// URL: http://www.suncheon.go.kr/kr/news/0006/0001/ (목록)
//      ?mode=view&seq=NNNN (상세)
//
// 파이프라인:
//   1) 목록 fetch → seq + title + writer 추출
//   2) 각 seq 상세 fetch → 본문 추출
//   3) news_posts INSERT (ministry="전라남도 순천시")
//   4) press_ingest cron 이 신규 row 처리 → LLM 분류 → welfare/loan 등록
//
// 안전성:
//   - 중복: source_url unique constraint 의존 (이미 news_posts 에 있음)
//   - rate limit: 상세 fetch 사이 200ms sleep
//   - parse 실패 graceful skip
// ============================================================

import { makeNewsSourceId, makeNewsSlug } from "@/lib/news/slug-helpers";
import { fetchPage as fetchPressPage, latestPublishedDate } from "./_factory";

const LIST_URL = "http://www.suncheon.go.kr/kr/news/0006/0001/";
const DETAIL_BASE = "http://www.suncheon.go.kr/kr/news/0006/0001/";


export type SuncheonNewsItem = {
  seq: number;
  title: string;
  writer: string | null; // 담당부서
  publishedDate: string | null; // YYYY-MM-DD (td.created)
  sourceUrl: string; // 상세 page URL
  body: string | null; // 본문 (별도 fetch 후 채움)
};

// ── HTML parsing helpers (cheerio 없이 정규식 — 의존성 0) ─────

// 목록 page 의 <td class="title_minwon lefttd"><a href="?mode=view&seq=NNNN">제목</a></td>
// + <td class="writer">부서</td> + <td class="created">YYYY-MM-DD</td> 패턴 추출.
// 2026-06-03 — td.created 날짜 추가(이전엔 published_at 을 now() 로 하드코딩하던 것).
const LIST_ITEM_REGEX =
  /<td\s+class="title_minwon\s+lefttd"><a\s+href="\?mode=view&(?:amp;)?seq=(\d+)"\s*>([^<]+)<\/a><\/td>\s*<td\s+class="writer">([^<]*)<\/td>\s*<td\s+class="created">\s*(\d{4}-\d{2}-\d{2})/g;

export function parseListPage(html: string): SuncheonNewsItem[] {
  const items: SuncheonNewsItem[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = re.exec(html)) !== null) {
    const seq = parseInt(m[1], 10);
    if (isNaN(seq) || seq <= 0) continue;
    const title = m[2].trim();
    const writer = m[3].trim();
    if (!title) continue;
    items.push({
      seq,
      title,
      writer: writer || null,
      publishedDate: m[4] ?? null,
      sourceUrl: `${DETAIL_BASE}?mode=view&seq=${seq}`,
      body: null,
    });
  }
  return items;
}

// 상세 page 의 본문 추출. <div class="contentStyle"> 안의 <td class="content lefttd">
// 가 보통 가장 안쪽이지만 변형 가능 — 가장 긴 <div class="content">...</div> 단순 채택.
const BODY_REGEX = /<div\s+class="content"\s*>([\s\S]*?)<\/div>/;

export function parseDetailBody(html: string): string | null {
  const m = BODY_REGEX.exec(html);
  if (!m) return null;
  // <br>·태그 제거. 줄바꿈은 br → \n 변환 후 다른 태그 strip.
  const text = m[1]
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : null;
}

// ── fetch helpers ──────────────────────────────────────────

// D-4 step 2 — auto-fix logic 에서 sample HTML fetch 위해 export
export const SUNCHEON_LIST_URL = LIST_URL;
export const SUNCHEON_DETAIL_BASE = DETAIL_BASE;

export async function fetchPage(url: string): Promise<string> {
  return fetchPressPage(url);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 목록 + 상세 N건 fetch. limit 안전한 default 10건 (초기 시범).
export async function fetchSuncheonRecent(
  limit = 10,
): Promise<SuncheonNewsItem[]> {
  const listHtml = await fetchPage(LIST_URL);
  const items = parseListPage(listHtml).slice(0, Math.max(1, Math.min(limit, 30)));

  // 상세 fetch 병렬 X (시청 사이트 부담 ↓ 위해 직렬 + 200ms sleep)
  for (let i = 0; i < items.length; i++) {
    try {
      const detailHtml = await fetchPage(items[i].sourceUrl);
      items[i].body = parseDetailBody(detailHtml);
    } catch {
      items[i].body = null;
    }
    if (i < items.length - 1) await sleep(200);
  }

  return items;
}

// 사장님 거주지 (전남 순천) 시·군 신규 source 식별자.
// press_ingest 가 ministry.startsWith("전라남도") 로 광역 매핑 +
// extractDistrictFromFields 로 district 자동 추출.
export const SUNCHEON_MINISTRY = "전라남도 순천시";
export const SUNCHEON_SOURCE_OUTLET = "순천시청";

export type ScrapeResult = {
  city: string;
  fetched: number;
  inserted: number;
  skipped: number;
  errors: string[];
  // 사이트 최신 발행일(insert-stop auto-triage 용) — _factory.ScrapeResult 와 동일 의미.
  latestFetched?: string | null;
  // news_posts 에 쓰는 실제 source_code — audit 기록용(auto-triage DB 조회 매칭).
  sourceCode?: string;
};

// fetchSuncheonRecent + news_posts INSERT 묶음. admin endpoint 와 cron endpoint
// 양쪽에서 공유. supabase admin client 를 받아 직접 INSERT (auth 책임은 caller).
export async function scrapeSuncheonAndInsert(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  limit = 10,
): Promise<ScrapeResult> {
  const items = await fetchSuncheonRecent(limit);
  const now = new Date().toISOString();

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of items) {
    // factory(BODY_MIN_LEN 250)와 동일 — 250자 미만 thin 본문 skip. suncheon 은 factory
    // 미경유 자체 collector 라 이 가드를 직접 둬 thin insert(AdSense·품질)를 막는다 (코드리뷰 P2).
    if (!item.body || item.body.length < 250) {
      skipped += 1;
      continue;
    }
    // NOT NULL 가드 (audit 2026-05-22) — source_id / category / slug 필수.
    const sourceId = makeNewsSourceId(item.sourceUrl);
    const slug = makeNewsSlug(item.title, "suncheon", sourceId);

    const { error } = await admin.from("news_posts").insert({
      title: item.title.slice(0, 500),
      summary: item.body.slice(0, 500),
      body: item.body.slice(0, 20000),
      source_url: item.sourceUrl,
      source_outlet: SUNCHEON_SOURCE_OUTLET,

      source_code: "local-press-suncheon",
      source_id: sourceId,
      category: "news",
      slug,
      ministry: SUNCHEON_MINISTRY,
      // 2026-06-03 — td.created 발행일 사용(없으면 now fallback).
      published_at: item.publishedDate
        ? `${item.publishedDate}T00:00:00+09:00`
        : now,
      classified_at: null,
    });
    if (error) {
      // UNIQUE 위반 = 이미 수집된 row
      if (error.code === "23505") {
        skipped += 1;
      } else {
        errors.push(`seq=${item.seq}: ${error.message}`);
      }
    } else {
      inserted += 1;
    }
  }

  return {
    city: "순천시",
    fetched: items.length,
    inserted,
    skipped,
    latestFetched: latestPublishedDate(items),
    sourceCode: "local-press-suncheon",
    errors: errors.slice(0, 3),
  };
}
