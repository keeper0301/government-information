// ============================================================
// 경북 상주시 보도자료 수집 (2026-07-29)
// ============================================================
// 공식 보도자료: /page/10330/10640.tc
// TimeCMS table board. 상세 visible body는 비어 있고 전문은
// viewFile.putFileHtml("FL...", "1", "...hwp", ...) 첨부에만 있음.
// ============================================================

import { makeNewsSourceId, makeNewsSlug } from "@/lib/news/slug-helpers";
import { decodeHtmlEntities } from "@/lib/utils";
import { decodeBasicEntities, type ScrapeResult } from "./_factory";
import { fetchTimecmsPutFileAttachBody } from "./_si_attach_helper";

const BASE_URL = "https://www.sangju.go.kr";
const LIST_URL = `${BASE_URL}/page/10330/10640.tc`;
const BOARD_MNG_NO = "407";
const PAGE_NO = "10640";
const SOURCE_CODE = "local-press-sangju";
const SOURCE_OUTLET = "경북 상주시청";
const MIN_BODY_LEN = 250;

type SangjuListItem = {
  seq: string;
  title: string;
  publishedDate: string | null;
  sourceUrl: string;
};

function stripTags(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/?p\b[^>]*>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[\t\r\f\v\u00a0]+/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\n\s*/g, "\n")
      .replace(/[ ]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  ).trim();
}

function normalizeDate(text: string): string | null {
  const match = /(20\d{2})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/.exec(text);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function detailUrl(boardNo: string): string {
  const params = new URLSearchParams({
    pageDtlOrdrNo: "1",
    boardNo,
    boardMngNo: BOARD_MNG_NO,
    importUrl: "/board/view.tc",
  });
  return `${BASE_URL}/page/10330/${PAGE_NO}.tc?${params.toString()}`;
}

function parseRow(row: string): SangjuListItem | null {
  const seq = /boardList\.view\(\s*['"](\d+)['"]\s*\)/.exec(row)?.[1];
  if (!seq) return null;
  const title = stripTags(/<a\b[^>]*class=["'][^"']*\bsubject\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(row)?.[1] ?? "");
  if (!title || title.length < 4 || !/[가-힣]/.test(title)) return null;
  const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
  const publishedDate = normalizeDate(cells.join(" "));
  return { seq, title, publishedDate, sourceUrl: detailUrl(seq) };
}

export function parseListItems(html: string): SangjuListItem[] {
  const items: SangjuListItem[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)) {
    const item = parseRow(match[0]);
    if (!item || seen.has(item.seq)) continue;
    seen.add(item.seq);
    items.push(item);
  }
  return items;
}

export function parseDetailTitle(html: string): string | null {
  const title = stripTags(/<h1\b[^>]*class=["'][^"']*\btit2\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "");
  return title && /[가-힣]/.test(title) ? title : null;
}

export function parseDetailDate(html: string): string | null {
  const meta = stripTags(/<ul\b[^>]*class=["'][^"']*\binfor2\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i.exec(html)?.[1] ?? "");
  return normalizeDate(meta);
}

export async function parseDetailBody(
  html: string,
  detailPageUrl = LIST_URL,
): Promise<string | null> {
  const visible = stripTags(/<div\b[^>]*class=["'][^"']*\btext\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1] ?? "");
  if (visible.length >= MIN_BODY_LEN && /[가-힣]/.test(visible)) return visible.slice(0, 20000);
  return fetchTimecmsPutFileAttachBody(html, detailPageUrl);
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "ko-KR,ko;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function scrapeSangjuAndInsert(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  limit = 10,
): Promise<ScrapeResult> {
  const listHtml = await fetchHtml(LIST_URL);
  const list = parseListItems(listHtml).slice(0, limit);
  const now = new Date().toISOString();
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  if (list.length === 0 && listHtml.length > 5000) {
    errors.push(`list 0건 — site HTML size ${listHtml.length} bytes 인데 regex 매칭 0. site 구조 변경 의심`);
  }

  for (const item of list) {
    try {
      const detailHtml = await fetchHtml(item.sourceUrl);
      const title = parseDetailTitle(detailHtml) ?? item.title;
      const date = parseDetailDate(detailHtml) ?? item.publishedDate;
      const body = await parseDetailBody(detailHtml, item.sourceUrl);
      if (!body || body.length < MIN_BODY_LEN || !/[가-힣]/.test(body)) {
        skipped += 1;
        continue;
      }
      const decodedBody = decodeHtmlEntities(body).slice(0, 20000);
      const sourceId = makeNewsSourceId(item.sourceUrl);
      const slug = makeNewsSlug(title, "sangju", sourceId);
      const { error } = await admin.from("news_posts").insert({
        title: decodeHtmlEntities(title).slice(0, 500),
        summary: decodedBody.slice(0, 500),
        body: decodedBody,
        source_url: item.sourceUrl,
        source_outlet: SOURCE_OUTLET,
        source_code: SOURCE_CODE,
        source_id: sourceId,
        category: "news",
        slug,
        ministry: SOURCE_OUTLET,
        published_at: date ? `${date}T00:00:00+09:00` : now,
        classified_at: null,
      });
      if (error) {
        if (error.code === "23505") skipped += 1;
        else errors.push(`seq=${item.seq}: ${error.message}`);
      } else {
        inserted += 1;
      }
    } catch (err) {
      errors.push(`seq=${item.seq}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    city: "경북 상주시",
    fetched: list.length,
    inserted,
    skipped,
    latestFetched: list.reduce<string | null>((latest, item) => {
      if (!item.publishedDate) return latest;
      return !latest || item.publishedDate > latest ? item.publishedDate : latest;
    }, null),
    sourceCode: SOURCE_CODE,
    errors: errors.slice(0, 20),
  };
}
