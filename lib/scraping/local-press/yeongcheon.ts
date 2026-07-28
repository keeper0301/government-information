// ============================================================
// 경북 영천시 뉴스포털 수집 (2026-07-28)
// ============================================================
// 공식 보도자료/뉴스포털: /news/main.do → /news/ycNews/list.do?searchCategory=1&mId=0200000000
// 목록 HTML 안에 기사 본문 전체가 포함된 YH news portal card형.
// 상세 goView는 JS/POST 기반이라 list-embedded body를 직접 insert한다.
// ============================================================

import { makeNewsSourceId, makeNewsSlug } from "@/lib/news/slug-helpers";
import { decodeHtmlEntities } from "@/lib/utils";
import { decodeBasicEntities, type ScrapeResult } from "./_factory";

const BASE_URL = "https://www.yc.go.kr";
const LIST_URL = `${BASE_URL}/news/ycNews/list.do?searchCategory=1&mId=0200000000`;
const SOURCE_CODE = "local-press-yeongcheon";
const SOURCE_OUTLET = "경북 영천시청";
const MIN_BODY_LEN = 250;

type YeongcheonNewsItem = {
  seq: string;
  title: string;
  publishedDate: string | null;
  sourceUrl: string;
  body: string;
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

function detailUrl(id: string): string {
  return `${BASE_URL}/news/ycNews/list.do?searchCategory=1&mId=0200000000#ycnews-${id}`;
}

function titleFromCard(card: string): string {
  const title = stripTags(/<span\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(card)?.[1] ?? "");
  const subTitle = stripTags(/<span\b[^>]*class=["'][^"']*\bsub_title\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(card)?.[1] ?? "");
  return [title.replace(/\.\.\.\s*$/g, ""), subTitle].filter(Boolean).join(" - ").trim();
}

function bodyFromCard(card: string): string {
  const subject = stripTags(/<span\b[^>]*class=["'][^"']*\bsubject\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(card)?.[1] ?? "");
  const date = stripTags(/<span\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(card)?.[1] ?? "");
  return [subject, date].filter(Boolean).join("\n").slice(0, 20000);
}

function parseCard(card: string): YeongcheonNewsItem | null {
  const id = /goView\('N',\s*'(\d+)'\)/.exec(card)?.[1];
  if (!id) return null;
  const title = titleFromCard(card);
  if (!title || title.length < 5 || !/[가-힣]/.test(title)) return null;
  const body = bodyFromCard(card);
  if (!body || body.length < MIN_BODY_LEN || !/[가-힣]/.test(body)) return null;
  const publishedDate = normalizeDate(body);
  return { seq: id, title, publishedDate, sourceUrl: detailUrl(id), body };
}

export function parseListItems(html: string): YeongcheonNewsItem[] {
  const list = html;
  const items: YeongcheonNewsItem[] = [];
  const seen = new Set<string>();
  const linkRe = /goView\('N',\s*'(\d+)'\)/g;
  const matches = [...list.matchAll(linkRe)];

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const id = match[1];
    if (seen.has(id)) continue;
    const start = match.index ?? 0;
    const end = matches[i + 1]?.index ?? list.length;
    const slice = list.slice(start, end);
    const item = parseCard(slice);
    if (!item || seen.has(item.seq)) continue;
    seen.add(item.seq);
    items.push(item);
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const item = parseCard(html);
  return item?.body ?? null;
}

async function fetchListHtml(): Promise<string> {
  const res = await fetch(LIST_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "ko-KR,ko;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function scrapeYeongcheonAndInsert(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  limit = 10,
): Promise<ScrapeResult> {
  const listHtml = await fetchListHtml();
  const list = parseListItems(listHtml).slice(0, limit);
  const now = new Date().toISOString();
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  if (list.length === 0 && listHtml.length > 5000) {
    errors.push(`list 0건 — site HTML size ${listHtml.length} bytes 인데 regex 매칭 0. site 구조 변경 의심`);
  }

  for (const item of list) {
    const body = decodeHtmlEntities(item.body);
    if (!body || body.length < MIN_BODY_LEN) {
      skipped += 1;
      continue;
    }
    const sourceId = makeNewsSourceId(item.sourceUrl);
    const slug = makeNewsSlug(item.title, "yeongcheon", sourceId);
    const { error } = await admin.from("news_posts").insert({
      title: decodeHtmlEntities(item.title).slice(0, 500),
      summary: body.slice(0, 500),
      body: body.slice(0, 20000),
      source_url: item.sourceUrl,
      source_outlet: SOURCE_OUTLET,
      source_code: SOURCE_CODE,
      source_id: sourceId,
      category: "news",
      slug,
      ministry: SOURCE_OUTLET,
      published_at: item.publishedDate ? `${item.publishedDate}T00:00:00+09:00` : now,
      classified_at: null,
    });
    if (error) {
      if (error.code === "23505") skipped += 1;
      else errors.push(`seq=${item.seq}: ${error.message}`);
    } else {
      inserted += 1;
    }
  }

  return {
    city: "경북 영천시",
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
