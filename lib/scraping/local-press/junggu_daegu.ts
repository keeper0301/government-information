// ============================================================
// 대구 중구 보도자료 수집 (2026-07-27)
// ============================================================
// 공식 보도자료: /new/pages/administration/page.html?mc=0161
// 목록/상세: legacy board_8 + SAB fingerprint cookie gate
// 본문: 첨부 HWP(download_utf8.php) 우선, td.boardViewBody fallback
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { makeNewsSourceId, makeNewsSlug } from "@/lib/news/slug-helpers";
import { decodeBasicEntities, latestPublishedDate, type ScrapeResult } from "./_factory";
import { fetchSiAttachBody } from "./_si_attach_helper";

const BASE_URL = "https://www.jung.daegu.kr";
const LIST_URL = `${BASE_URL}/new/pages/administration/page.html?mc=0161`;
const CITY_KEY = "junggu_daegu";
const CITY_NAME = "대구 중구";
const SOURCE_OUTLET = "대구 중구청";
const SOURCE_CODE = "local-press-junggu-daegu";
const SAB_COOKIE = "sabFingerPrint=1920,1080,www.jung.daegu.kr; sabSignature=0D3171B382075E33B3A8C909E9E53BBF";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type JungguDaeguListItem = {
  seq: string;
  title: string;
  department: string | null;
  publishedDate: string | null;
  sourceUrl: string;
};

function stripTags(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).trim();
}

function normalizeUrl(url: string): string {
  return new URL(url.replace(/&amp;/g, "&"), LIST_URL).toString();
}

function normalizeDate(text: string): string | null {
  const m = /(20\d{2})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/.exec(text);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

export function parseListItems(html: string): JungguDaeguListItem[] {
  const items: JungguDaeguListItem[] = [];
  const seen = new Set<string>();
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const row = rowMatch[1];
    if (!/bbs_id=board_8/.test(row) || !/mode=view/.test(row)) continue;
    const link = /<td\b[^>]*class=["'][^"']*\bsubject\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']*\bno=([^&"']+)[^"']*\bmode=view[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i.exec(row);
    if (!link) continue;
    const [, href, seq, titleHtml] = link;
    if (!seq || seen.has(seq)) continue;
    const title = stripTags(titleHtml);
    if (!title || title.length < 3 || !/[가-힣]/.test(title)) continue;
    const department = stripTags(/<td\b[^>]*class=["'][^"']*\bwriter\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i.exec(row)?.[1] ?? "") || null;
    const publishedDate = normalizeDate(stripTags(/<td\b[^>]*class=["'][^"']*\bdatatime\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i.exec(row)?.[1] ?? ""));

    seen.add(seq);
    items.push({ seq, title, department, publishedDate, sourceUrl: normalizeUrl(href) });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const match = /<td\b[^>]*class=["'][^"']*\bboardViewBody\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i.exec(html);
  if (!match) return null;
  const body = stripTags(match[1]);
  return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "ko-KR,ko;q=0.9",
      Cookie: SAB_COOKIE,
    },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`fetch failed (${res.status}): ${url}`);
  return res.text();
}

export async function parseAttachOrDetailBody(html: string, detailUrl: string): Promise<string | null> {
  const attach = await fetchSiAttachBody(html, detailUrl, { Cookie: SAB_COOKIE });
  if (attach) return attach;
  return parseDetailBody(html);
}

export async function fetchJungguDaeguListItems(): Promise<JungguDaeguListItem[]> {
  return parseListItems(await fetchPage(LIST_URL));
}

export async function fetchJungguDaeguDetailBody(sourceUrl: string): Promise<string | null> {
  const html = await fetchPage(sourceUrl);
  return parseAttachOrDetailBody(html, sourceUrl);
}

export async function scrapeJungguDaeguAndInsert(
  admin: SupabaseClient,
  limit?: number,
): Promise<ScrapeResult> {
  const errors: string[] = [];
  let fetched = 0;
  let inserted = 0;
  let skipped = 0;
  let latestFetched: string | null = null;

  try {
    const allItems = await fetchJungguDaeguListItems();
    const items = typeof limit === "number" ? allItems.slice(0, Math.max(0, limit)) : allItems;
    fetched = items.length;
    latestFetched = latestPublishedDate(items);
    if (items.length === 0) {
      return { city: CITY_NAME, fetched: 0, inserted: 0, skipped: 0, errors: ["list 0건 — parser 또는 URL 점검"] };
    }

    for (const item of items) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const body = await fetchJungguDaeguDetailBody(item.sourceUrl);
        if (!body) {
          errors.push(`detail ${item.seq} 본문 추출 실패`);
          continue;
        }
        const sourceId = makeNewsSourceId(item.sourceUrl);
        const slug = makeNewsSlug(item.title, CITY_KEY, sourceId);
        const publishedAt = item.publishedDate ? `${item.publishedDate}T00:00:00+09:00` : new Date().toISOString();
        const { error } = await admin.from("news_posts").insert({
          title: item.title,
          summary: body.slice(0, 500),
          body,
          source_url: item.sourceUrl,
          source_outlet: SOURCE_OUTLET,
          source_code: SOURCE_CODE,
          source_id: sourceId,
          category: "news",
          slug,
          ministry: SOURCE_OUTLET,
          published_at: publishedAt,
          classified_at: null,
        });
        if (error) {
          if (error.code === "23505") skipped += 1;
          else errors.push(`insert ${item.seq}: ${error.message}`);
        } else {
          inserted += 1;
        }
      } catch (e) {
        errors.push(`detail ${item.seq}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    errors.push(`list: ${(e as Error).message}`);
  }

  return { city: CITY_NAME, fetched, inserted, skipped, latestFetched, sourceCode: SOURCE_CODE, errors: errors.slice(0, 20) };
}
