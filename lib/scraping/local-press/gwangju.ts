// ============================================================
// 광주광역시청 보도자료 수집 — Phase B2 시·군 확장
// ============================================================
// 광주광역시 사용자 가입 대비 + 광역 정책 자동 수집. 순천시청 collector
// 와는 다른 CMS 패턴 (div.subject + JSON-LD).
//
// URL: https://www.gwangju.go.kr/boardList.do?pageId=www789&boardId=BD_0000000027
//      → 상세: /boardView.do?pageId=www789&boardId=BD_0000000027&seq=NNNN
// ============================================================

const LIST_URL =
  "https://www.gwangju.go.kr/boardList.do?pageId=www789&boardId=BD_0000000027";
const DETAIL_BASE = "https://www.gwangju.go.kr/boardView.do";
const USER_AGENT =
  "Mozilla/5.0 (compatible; keepioo-bot/1.0; +https://www.keepioo.com)";

export type GwangjuNewsItem = {
  seq: number;
  title: string;
  publishedDate: string | null; // YYYY-MM-DD
  sourceUrl: string;
  body: string | null;
};

// 목록 HTML 의 <div class="subject"><a href="..."&seq=NNNN title="제목" ...></a></div>
// 패턴. data-seq 도 있지만 href 정규식이 더 안정.
const LIST_ITEM_REGEX =
  /<div\s+class="subject">[\s\S]*?<a\s+href="[^"]*&(?:amp;)?seq=(\d+)[^"]*"[^>]*title="([^"]+)"/g;

// 날짜는 list 다음 형제 <div class="date">...YYYY-MM-DD</div>.
// item 단위 정렬 어려워 별도 매칭. 정확한 seq-date 매핑은 page 안 등장 순서로.
const DATE_REGEX =
  /<div\s+class="date">[\s\S]*?(\d{4}-\d{2}-\d{2})\s*<\/div>/g;

export function parseListPage(html: string): GwangjuNewsItem[] {
  const items: Array<Omit<GwangjuNewsItem, "publishedDate"> & { idx: number }> = [];
  const dates: string[] = [];

  // 1) 게시물 정보 (seq + title)
  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  let idx = 0;
  while ((m = itemRe.exec(html)) !== null) {
    const seq = parseInt(m[1], 10);
    if (isNaN(seq) || seq <= 0) continue;
    const title = m[2].trim();
    if (!title) continue;
    items.push({
      idx,
      seq,
      title,
      sourceUrl: `${DETAIL_BASE}?pageId=www789&boardId=BD_0000000027&seq=${seq}`,
      body: null,
    });
    idx += 1;
  }

  // 2) 날짜 (같은 등장 순서로 매핑)
  const dateRe = new RegExp(DATE_REGEX.source, "g");
  while ((m = dateRe.exec(html)) !== null) {
    dates.push(m[1]);
  }

  // 3) seq ↔ date 매핑 (등장 순서 보장 안 됨 — 안전한 fallback: null)
  return items.map((item) => ({
    seq: item.seq,
    title: item.title,
    publishedDate: dates[item.idx] ?? null,
    sourceUrl: item.sourceUrl,
    body: item.body,
  }));
}

// 상세 page 본문 추출. 광주광역시청 패턴:
// <div class="board_view_content">...본문 HTML...</div>
const BODY_REGEX_GWANGJU =
  /<div\s+class="board_view_content[^"]*"[^>]*>([\s\S]*?)<\/div>/;

export function parseDetailBody(html: string): string | null {
  const m = BODY_REGEX_GWANGJU.exec(html);
  if (!m) return null;
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

// D-4 step 2 — auto-fix sample fetch 위해 export
export const GWANGJU_LIST_URL = LIST_URL;
export const GWANGJU_DETAIL_BASE = DETAIL_BASE;

export async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchGwangjuRecent(
  limit = 10,
): Promise<GwangjuNewsItem[]> {
  const listHtml = await fetchPage(LIST_URL);
  const items = parseListPage(listHtml).slice(0, Math.max(1, Math.min(limit, 30)));

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

export const GWANGJU_MINISTRY = "광주광역시";
export const GWANGJU_SOURCE_OUTLET = "광주광역시청";

export async function scrapeGwangjuAndInsert(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  limit = 10,
) {
  const items = await fetchGwangjuRecent(limit);
  const now = new Date().toISOString();

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of items) {
    if (!item.body) {
      skipped += 1;
      continue;
    }
    const publishedAt = item.publishedDate
      ? new Date(item.publishedDate).toISOString()
      : now;
    const { error } = await admin.from("news_posts").insert({
      title: item.title.slice(0, 500),
      summary: item.body.slice(0, 500),
      body: item.body.slice(0, 20000),
      source_url: item.sourceUrl,
      source_outlet: GWANGJU_SOURCE_OUTLET,
      ministry: GWANGJU_MINISTRY,
      published_at: publishedAt,
      classified_at: null,
    });
    if (error) {
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
    city: "광주광역시",
    fetched: items.length,
    inserted,
    skipped,
    errors: errors.slice(0, 3),
  };
}
