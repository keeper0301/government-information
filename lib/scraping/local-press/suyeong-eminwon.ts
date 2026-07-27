// ============================================================
// 부산 수영구 보도자료 수집 — eminwon Mini 전용 (POST 기반)
// ============================================================
// 공식 페이지: /index.suyeong?menuCd=DOM_000000103001006001
// iframe: https://eminwon.suyeong.go.kr/emwp/jsp/ofr/OfrNewsEpctLMiniSub.jsp?homepagetype=new
// 목록: selectListOfrNewsMini + news_epct_yn=1 + ofr_pageSize=3
// 상세: selectOfrNews + news_epct_no=<id>
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { makeNewsSourceId, makeNewsSlug } from "@/lib/news/slug-helpers";
import { latestPublishedDate, type ScrapeResult } from "./_factory";
import { parseEminwonDetailBody } from "./_eminwon_helper";
import { decodeBasicEntities } from "./_factory";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const BASE_URL = "https://eminwon.suyeong.go.kr";
const ACTION_URL = `${BASE_URL}/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do`;
const MENU_CD = "DOM_000000103001006001";
const CITY_KEY = "suyeong";
const CITY_NAME = "부산 수영구";
const SOURCE_OUTLET = "부산 수영구청";
const SOURCE_CODE = "local-press-suyeong-eminwon";

export type SuyeongMiniListItem = {
  newsEpctNo: string;
  title: string;
  department: string | null;
  publishedDate: string | null;
  sourceUrl: string;
};

const MINI_ITEM_REGEX = /<a\b[^>]*href=["']javaScript:searchDetail\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\)["'][^>]*class=["'][^"']*\bnews_list\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
const TITLE_REGEX = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i;
const DATE_REGEX = /<span\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i;

function stripTags(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).replace(/\s+/g, " ").trim();
}

function normalizeDate(date: string): string | null {
  const match = /(20\d{2})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})/.exec(date);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseMiniListItems(html: string): SuyeongMiniListItem[] {
  const items: SuyeongMiniListItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = MINI_ITEM_REGEX.exec(html)) !== null) {
    const [, newsEpctNo, pindex, block] = match;
    if (!newsEpctNo || seen.has(newsEpctNo)) continue;

    const title = stripTags(TITLE_REGEX.exec(block)?.[1] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    const publishedDate = normalizeDate(stripTags(DATE_REGEX.exec(block)?.[1] ?? ""));

    seen.add(newsEpctNo);
    items.push({
      newsEpctNo,
      title,
      department: null,
      publishedDate,
      sourceUrl: `https://www.suyeong.go.kr/index.suyeong?menuCd=${encodeURIComponent(pindex || MENU_CD)}&H_SEQ=${encodeURIComponent(newsEpctNo)}`,
    });
  }

  return items;
}

async function postFetch(body: URLSearchParams): Promise<string> {
  const res = await fetch(ACTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": UA,
      "Accept-Language": "ko-KR,ko;q=0.9",
    },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function listBody(): URLSearchParams {
  const params = new URLSearchParams();
  params.set("pg_mode", "view");
  params.set("pindex", "");
  params.set("H_SEQ", "");
  params.set("pageIndex", "");
  params.set("jndinm", "OfrBcAdvNewsEJB");
  params.set("context", "NTIS");
  params.set("method", "selectListOfrNewsMini");
  params.set("methodnm", "selectListOfrNewsHomepage");
  params.set("news_epct_no", "");
  params.set("subCheck", "Y");
  params.set("ofr_pageSize", "3");
  params.set("initValue", "");
  params.set("news_epct_yn", "1");
  params.set("data_open_yn", "1");
  params.set("countYn", "Y");
  params.set("homepagetype", "new");
  return params;
}

function detailBody(newsEpctNo: string): URLSearchParams {
  const params = listBody();
  params.set("pindex", MENU_CD);
  params.set("H_SEQ", newsEpctNo);
  params.set("method", "selectOfrNews");
  params.set("methodnm", "selectOfrNewsMgt");
  params.set("news_epct_no", newsEpctNo);
  params.set("initValue", "Y");
  return params;
}

export async function fetchSuyeongMiniListItems(): Promise<SuyeongMiniListItem[]> {
  return parseMiniListItems(await postFetch(listBody()));
}

export async function fetchSuyeongMiniDetailBody(newsEpctNo: string): Promise<string | null> {
  const detailHtml = await postFetch(detailBody(newsEpctNo));
  return parseEminwonDetailBody(detailHtml);
}

export async function scrapeSuyeongEminwonAndInsert(
  admin: SupabaseClient,
  limit?: number,
): Promise<ScrapeResult> {
  const errors: string[] = [];
  let fetched = 0;
  let inserted = 0;
  let skipped = 0;
  let latestFetched: string | null = null;

  try {
    const allItems = await fetchSuyeongMiniListItems();
    const items = typeof limit === "number" ? allItems.slice(0, Math.max(0, limit)) : allItems;
    fetched = items.length;
    latestFetched = latestPublishedDate(items);

    if (items.length === 0) {
      return { city: CITY_NAME, fetched: 0, inserted: 0, skipped: 0, errors: ["list 0건 — parser 또는 URL 점검"] };
    }

    for (const item of items) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const body = await fetchSuyeongMiniDetailBody(item.newsEpctNo);
        if (!body) {
          errors.push(`detail ${item.newsEpctNo} 본문 추출 실패`);
          continue;
        }

        const sourceUrl = `${ACTION_URL}?method=selectOfrNews&jndinm=OfrBcAdvNewsEJB&news_epct_no=${item.newsEpctNo}`;
        const sourceId = makeNewsSourceId(sourceUrl);
        const slug = makeNewsSlug(item.title, CITY_KEY, sourceId);
        const publishedAt = item.publishedDate ? `${item.publishedDate}T00:00:00+09:00` : new Date().toISOString();
        const { error } = await admin.from("news_posts").insert({
          title: item.title,
          summary: body.slice(0, 500),
          body,
          source_url: sourceUrl,
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
          else errors.push(`insert ${item.newsEpctNo}: ${error.message}`);
        } else {
          inserted += 1;
        }
      } catch (e) {
        errors.push(`detail ${item.newsEpctNo}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    errors.push(`list: ${(e as Error).message}`);
  }

  return {
    city: CITY_NAME,
    fetched,
    inserted,
    skipped,
    latestFetched,
    sourceCode: SOURCE_CODE,
    errors: errors.slice(0, 20),
  };
}
