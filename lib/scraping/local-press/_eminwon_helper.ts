// ============================================================
// eminwon 보도자료 공통 헬퍼 — POST 기반 (기장·부산북구 등 공용)
// ============================================================
// 표준 정적 collector(createPressCollector) 는 GET listUrl 만 받는데, eminwon
// 시스템(전자민원 표준 OfrAction.do) 은 list/detail 모두 POST + form-urlencoded.
// 자치구마다 도메인(eminwon.{slug}.go.kr)·메타만 다르고 POST 파라미터·HTML 구조는
// 동일 → config 만 받아 collector 완성. chromium 불필요(fetch + regex).
//
// POST 규약 (2026-05-30 기장 정찰 + 2026-06-01 부산북구 form1 필드 동일 확인):
// - list:   jndinm=OfrBcAdvNewsEJB, method=selectListOfrNews, news_epct_yn=1, title=보도자료
// - detail: 같은 jndinm, method=selectOfrNews, news_epct_no=ID
// - list onclick: javascript:searchDetail('NNNN') → news_epct_no 식별자
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { makeNewsSourceId, makeNewsSlug } from "@/lib/news/slug-helpers";
import type { ScrapeResult } from "./_factory";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type EminwonConfig = {
  actionUrl: string; // https://eminwon.{slug}.go.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do
  ministry: string; // "기장군청" / "부산 북구청"
  sourceOutlet: string;
  sourceCode: string; // "local-press-gijang" 등
  cityKey: string; // slug — makeNewsSlug 용 (gijang / bsbukgu)
  cityName: string; // ScrapeResult.city ("기장군" / "부산 북구")
};

export type EminwonListItem = {
  newsEpctNo: string;
  title: string;
  department: string | null;
  publishedDate: string | null; // yyyy-mm-dd
};

// list POST body — 보도자료 list page N.
function listBody(pageIndex: number): string {
  const params = new URLSearchParams();
  params.set("pageIndex", String(pageIndex));
  params.set("jndinm", "OfrBcAdvNewsEJB");
  params.set("context", "NTIS");
  params.set("method", "selectListOfrNews");
  params.set("methodnm", "selectListOfrNewsHomepage");
  params.set("news_epct_no", "");
  params.set("subCheck", "Y");
  params.set("ofr_pageSize", "10");
  params.set("news_epct_yn", "1");
  params.set("title", "보도자료");
  return params.toString();
}

// detail POST body — news_epct_no=ID 글 1건.
function detailBody(newsEpctNo: string): string {
  const params = new URLSearchParams();
  params.set("pageIndex", "");
  params.set("jndinm", "OfrBcAdvNewsEJB");
  params.set("context", "NTIS");
  params.set("method", "selectOfrNews");
  params.set("methodnm", "selectOfrNewsMgt");
  params.set("news_epct_no", newsEpctNo);
  params.set("subCheck", "Y");
  params.set("ofr_pageSize", "10");
  params.set("news_epct_yn", "1");
  params.set("title", "보도자료");
  params.set("data_open_yn", "1");
  params.set("initValue", "Y");
  params.set("countYn", "Y");
  return params.toString();
}

async function postFetch(actionUrl: string, body: string): Promise<string> {
  const res = await fetch(actionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
      "Accept-Language": "ko-KR,ko;q=0.9",
    },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// list HTML 파싱 — onclick searchDetail('N') + 같은 tr 의 제목·부서·등록일.
// silentSkips: 제목 추출 실패한 newsEpctNo 리스트 — 운영 audit 가시화.
export function parseEminwonListItems(
  html: string,
  silentSkips?: string[],
): EminwonListItem[] {
  const items: EminwonListItem[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRe.exec(html)) !== null) {
    const tr = trMatch[1];
    const idM = tr.match(/searchDetail\('(\d+)'\)/);
    if (!idM) continue;
    const newsEpctNo = idM[1];
    const text = tr
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (text.length < 3) continue;
    // 일반 순서: [번호, 제목, 부서, 등록일, 조회수]
    let title = "";
    let department: string | null = null;
    let publishedDate: string | null = null;
    for (const t of text) {
      if (
        !title &&
        /[가-힣]/.test(t) &&
        t.length >= 5 &&
        !/^\d{4}-\d{2}-\d{2}$/.test(t)
      ) {
        title = t;
        continue;
      }
      if (!publishedDate) {
        const dm = t.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (dm) {
          publishedDate = `${dm[1]}-${dm[2]}-${dm[3]}`;
          continue;
        }
      }
      if (
        !department &&
        /[가-힣]/.test(t) &&
        t !== title &&
        t.length >= 2 &&
        t.length <= 30
      ) {
        department = t;
      }
    }
    if (!title) {
      silentSkips?.push(newsEpctNo);
      continue;
    }
    items.push({ newsEpctNo, title, department, publishedDate });
  }
  return items;
}

// detail HTML 본문 파싱 — td 안 가장 긴 한국어 본문.
export function parseEminwonDetailBody(html: string): string | null {
  const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
  let best = "";
  let m: RegExpExecArray | null;
  while ((m = tdRe.exec(html)) !== null) {
    const text = m[1]
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<style[\s\S]*?<\/style>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 100) continue;
    if (!/[가-힣]/.test(text)) continue;
    if (text.length > best.length) best = text;
  }
  // 본문 cut 20000 — _factory.ts createPressCollector 와 동일 정책.
  return best.length >= 250 ? best.slice(0, 20000) : null;
}

// config → eminwon collector. .scrapeAndInsert 가 cron 표준 시그니처.
export function createEminwonScraper(cfg: EminwonConfig) {
  async function scrapeAndInsert(
    admin: SupabaseClient,
    limit?: number,
  ): Promise<ScrapeResult> {
    const errors: string[] = [];
    let fetched = 0;
    let inserted = 0;
    let skipped = 0;

    try {
      const listHtml = await postFetch(cfg.actionUrl, listBody(1));
      const silentSkips: string[] = [];
      const allItems = parseEminwonListItems(listHtml, silentSkips);
      if (silentSkips.length > 0) {
        errors.push(
          `title 추출 실패 ${silentSkips.length}건 (newsEpctNo: ${silentSkips.slice(0, 5).join(",")})`,
        );
      }
      const items =
        typeof limit === "number" ? allItems.slice(0, limit) : allItems;
      fetched = items.length;
      if (items.length === 0) {
        return {
          city: cfg.cityName,
          fetched: 0,
          inserted: 0,
          skipped: 0,
          errors: ["list 0건 — parser 또는 URL 점검"],
        };
      }

      for (const it of items) {
        try {
          // detail POST 사이 200ms sleep (eminwon polite, 차단 위험 ↓).
          await new Promise((r) => setTimeout(r, 200));
          const detailHtml = await postFetch(
            cfg.actionUrl,
            detailBody(it.newsEpctNo),
          );
          const body = parseEminwonDetailBody(detailHtml);
          if (!body) {
            errors.push(`detail ${it.newsEpctNo} 본문 추출 실패`);
            continue;
          }
          const sourceUrl = `${cfg.actionUrl}?method=selectOfrNews&jndinm=OfrBcAdvNewsEJB&news_epct_no=${it.newsEpctNo}`;
          const sourceId = makeNewsSourceId(sourceUrl);
          const slug = makeNewsSlug(it.title, cfg.cityKey, sourceId);
          const publishedAt = it.publishedDate
            ? `${it.publishedDate}T00:00:00+09:00`
            : new Date().toISOString();
          const { error } = await admin.from("news_posts").insert({
            title: it.title,
            summary: body.slice(0, 500),
            body,
            source_url: sourceUrl,
            source_outlet: cfg.sourceOutlet,
            source_code: cfg.sourceCode,
            source_id: sourceId,
            category: "news",
            slug,
            ministry: cfg.ministry,
            published_at: publishedAt,
            classified_at: null,
          });
          if (error) {
            if (error.code === "23505") {
              skipped += 1;
            } else {
              errors.push(`insert ${it.newsEpctNo}: ${error.message}`);
            }
          } else {
            inserted += 1;
          }
        } catch (e) {
          errors.push(`detail ${it.newsEpctNo}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      errors.push(`list: ${(e as Error).message}`);
    }
    return {
      city: cfg.cityName,
      fetched,
      inserted,
      skipped,
      errors: errors.slice(0, 20),
    };
  }
  return { scrapeAndInsert };
}
