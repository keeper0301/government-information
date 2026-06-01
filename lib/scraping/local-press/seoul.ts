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

// 2026-06-02 fix — 본문은 JSON-LD(schema.org NewsArticle) 의 `articleBody` 에 plain text 로
// 존재(WordPress). 구 BODY_CONTAINER_REGEX(view_content 등 div) 는 실제 페이지에 없는 class 라
// 본문 0건(전 글 skip)이었음. articleBody 는 태그 없는 본문이라 구조변경에 강함.
const LD_JSON_REGEX =
  /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;

export function parseDetailBody(html: string): string | null {
  const blocks = html.matchAll(new RegExp(LD_JSON_REGEX.source, "gi"));
  for (const b of blocks) {
    let obj: unknown;
    try {
      obj = JSON.parse(b[1].trim());
    } catch {
      continue; // 깨진 JSON-LD 블록은 건너뜀
    }
    // 단일 객체 / 배열 / @graph 배열 모두 대응
    const record = obj as Record<string, unknown>;
    const nodes: unknown[] = Array.isArray(obj)
      ? obj
      : Array.isArray(record["@graph"])
        ? (record["@graph"] as unknown[])
        : [obj];
    for (const node of nodes) {
      const body = (node as Record<string, unknown>)?.articleBody;
      if (typeof body === "string" && body.trim()) {
        const text = decodeBasicEntities(body).replace(/\s+/g, " ").trim();
        // 길이 하한은 factory(BODY_MIN_LEN 250)에 일임 — 한글 본문 여부만 게이트.
        if (/[가-힣]/.test(text)) return text.slice(0, 20000);
      }
    }
  }
  return null;
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
