// ============================================================
// 서울특별시청 보도자료 수집 — G4 Phase B
// ============================================================
// 서울특별시 사용자 cohort 1위 대응. opengov.seoul.go.kr/press CMS.
//
// URL:
//   list:   https://opengov.seoul.go.kr/press/list
//   상세:   https://opengov.seoul.go.kr/press/{seq}
//
// 본문 일부 글은 iframe PDF (회의 결과 공문) → 추출 빈 string → press_ingest
// 가 low tier 또는 skip. 일반 정책 글은 <p> 텍스트 추출 가능.
// ============================================================

const LIST_URL = "https://opengov.seoul.go.kr/press/list";
const DETAIL_BASE = "https://opengov.seoul.go.kr/press";
const USER_AGENT =
  "Mozilla/5.0 (compatible; keepioo-bot/1.0; +https://www.keepioo.com)";

export type SeoulNewsItem = {
  seq: number;
  title: string;
  publishedDate: string | null; // YYYY-MM-DD
  sourceUrl: string;
  body: string | null;
};

// 목록 row 의 <td class="data-title aLeft"><a href="/press/{seq}">{title}</a>
const LIST_ITEM_REGEX =
  /<td[^>]*class="data-title[^"]*"[^>]*>[\s\S]*?<a\s+href="\/press\/(\d+)"[^>]*>([^<]+)<\/a>/g;

// <td class="data-date">YYYY-MM-DD</td>
const DATE_REGEX = /<td[^>]*class="data-date[^"]*"[^>]*>(\d{4}-\d{2}-\d{2})<\/td>/g;

export function parseListPage(html: string): SeoulNewsItem[] {
  const items: Array<Omit<SeoulNewsItem, "publishedDate"> & { idx: number }> =
    [];
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
      sourceUrl: `${DETAIL_BASE}/${seq}`,
      body: null,
    });
    idx += 1;
  }

  // 2) 날짜 (같은 row 순서대로 매핑)
  const dateRe = new RegExp(DATE_REGEX.source, "g");
  while ((m = dateRe.exec(html)) !== null) {
    dates.push(m[1]);
  }

  // 3) seq ↔ date 매핑 (등장 순서 보장)
  return items.map((item) => ({
    seq: item.seq,
    title: item.title,
    publishedDate: dates[item.idx] ?? null,
    sourceUrl: item.sourceUrl,
    body: item.body,
  }));
}

// 상세 page 본문 추출. <p>...텍스트...</p> 패턴 모음.
// iframe PDF 공문은 <p> 거의 없음 → 빈 string 반환 (skip).
export function parseDetailBody(html: string): string | null {
  // 본문 영역 추정 — view-content view-content-article 안의 <p>
  // 단순화: 전체 HTML 의 <p>...</p> 중 한국어 ≥20자만 추출.
  const PARAGRAPH_REGEX = /<p[^>]*>([^<]{20,})<\/p>/g;
  const paragraphs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = PARAGRAPH_REGEX.exec(html)) !== null) {
    const text = m[1]
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim();
    // 한국어 1자 이상 포함 + meta/navigation 패턴 제외
    if (!/[가-힣]/.test(text)) continue;
    if (/element-invisible|첨부파일|문서보기/.test(text)) continue;
    paragraphs.push(text);
  }
  if (paragraphs.length === 0) return null;
  return paragraphs.join("\n").slice(0, 5000); // 5K 자 제한 (분류 prompt 적정)
}

// HTTP fetch helper — 외부 검증 + 재사용 가능
export async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`fetch failed (${res.status}): ${url}`);
  }
  return res.text();
}

export const SEOUL_MINISTRY = "서울특별시청";
export const SEOUL_SOURCE_OUTLET = "서울특별시청";

export type ScrapeResult = {
  city: string;
  fetched: number;
  inserted: number;
  skipped: number;
  errors: string[];
};

// list → 상세 (병렬) → news_posts insert. suncheon/gwangju 와 동일 시그너처.
// cron route 의 COLLECTORS array 에 등록 가능.
export async function scrapeSeoulAndInsert(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  limit = 10,
): Promise<ScrapeResult> {
  const listHtml = await fetchPage(LIST_URL);
  const list = parseListPage(listHtml).slice(0, limit);
  const now = new Date().toISOString();

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of list) {
    let body: string | null = null;
    try {
      const detailHtml = await fetchPage(item.sourceUrl);
      body = parseDetailBody(detailHtml);
    } catch (e) {
      errors.push(`seq=${item.seq}: fetch ${(e as Error).message}`);
      continue;
    }
    if (!body || body.length < 50) {
      skipped += 1; // iframe PDF 공문 등 본문 추출 불가
      continue;
    }
    const { error } = await admin.from("news_posts").insert({
      title: item.title.slice(0, 500),
      summary: body.slice(0, 500),
      body: body.slice(0, 20000),
      source_url: item.sourceUrl,
      source_outlet: SEOUL_SOURCE_OUTLET,
      ministry: SEOUL_MINISTRY,
      published_at: item.publishedDate
        ? `${item.publishedDate}T00:00:00+09:00`
        : now,
      classified_at: null,
    });
    if (error) {
      if (error.code === "23505") {
        skipped += 1; // 이미 수집됨
      } else {
        errors.push(`seq=${item.seq}: ${error.message}`);
      }
    } else {
      inserted += 1;
    }
  }

  return {
    city: "서울특별시",
    fetched: list.length,
    inserted,
    skipped,
    errors: errors.slice(0, 3),
  };
}
