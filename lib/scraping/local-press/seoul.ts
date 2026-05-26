// ============================================================
// 서울특별시 보도자료 수집 — 2026-05-26 RSS 기반 재작성
// ============================================================
// 이전: opengov.seoul.go.kr/press/list (ASN 차단, PC runner 필요)
// 신규: news.seoul.go.kr/gov/feed/ (RSS, Vercel cron 정적 fetch 가능)
//
// RSS 안 item:
//   - title: "[제안요청서 사전공개] 2026년 S-Map 기능개선 용역"
//   - link: https://news.seoul.go.kr/gov/archives/578160
//   - pubDate: 2026-05-22 16:38:15
//   - description: 본문 일부
// 카테고리 혼합 (보도자료 외 공고도 포함). 모두 news category 으로 insert.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const LIST_URL = "https://news.seoul.go.kr/gov/feed/";

// RSS item parser — XML 단순 regex (큰 dependency 회피)
const RSS_ITEM_REGEX = /<item>([\s\S]*?)<\/item>/g;
const TAG = (tag: string) => new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);

// archives/N 의 N 추출 (seq)
const SEQ_REGEX = /\/archives\/(\d+)/;

export function parseListPage(xml: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const itemRe = new RegExp(RSS_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(xml)) !== null) {
    const inner = m[1];
    const link = TAG("link").exec(inner)?.[1]?.trim();
    if (!link) continue;
    const seqMatch = SEQ_REGEX.exec(link);
    if (!seqMatch) continue;
    const seq = seqMatch[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const titleRaw = TAG("title").exec(inner)?.[1]?.trim() ?? "";
    // 2026-05-26 review nit#2: CDATA global flag — multiple CDATA 시 모두 unwrap
    const title = decodeBasicEntities(
      titleRaw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"),
    ).trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    // pubDate "2026-05-22 16:38:15" → "2026-05-22"
    const pubDate = TAG("pubDate").exec(inner)?.[1]?.trim();
    const publishedDate = pubDate ? pubDate.slice(0, 10) : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: link,
    });
  }
  return items;
}

// detail page 의 본문 — news.seoul.go.kr/gov/archives/N
const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:view_content|board_view|entry-content|article-content|content-area)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:btn|pagination|file|share)|<\/article|<\/section)/i;

export function parseDetailBody(html: string): string | null {
  // RSS description fallback 우선 (작은 buffer)
  const m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(m[1])
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[가-힣]/.test(text) || text.length < 50) return null;
  return text.slice(0, 5000);
}

export const { scrapeAndInsert: scrapeSeoulAndInsert } = createPressCollector({
  cityName: "서울특별시",
  region: "서울",
  ministry: "서울특별시청",
  sourceOutlet: "서울특별시청",
  sourceCode: "local-press-seoul",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});

// 2026-05-26 review nit#3: SeoulNewsItem + ScrapeResult orphan export 삭제 (외부 참조 0)
