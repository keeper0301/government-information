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

import { load } from "cheerio";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeNewsSourceId, makeNewsSlug } from "@/lib/news/slug-helpers";
import { latestPublishedDate, type ScrapeResult } from "./_factory";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type EminwonConfig = {
  actionUrl: string; // https://eminwon.{slug}.go.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do
  ministry: string; // "기장군청" / "부산 북구청"
  sourceOutlet: string;
  sourceCode: string; // "local-press-gijang" 등
  cityKey: string; // slug — makeNewsSlug 용 (gijang / bsbukgu)
  cityName: string; // ScrapeResult.city ("기장군" / "부산 북구")
  newsEpctYn?: string; // 기본 "1". 일부 시군(군산)은 "1,2".
  title?: string; // 기본 "보도자료". 일부 시군(군산)은 "보도 및 대응자료".
  listPages?: number; // 기본 1. 최신 페이지가 사진/빈 본문 위주인 시군은 여러 페이지 스캔.
  // detail POST body 빌더(선택). 미지정 시 표준 detailBody(기장·부산북구).
  // 일부 eminwon 스킨(광주 북구 등)은 form1 전체 필드(subCheck=N + 빈 검색필드)를
  // 요구해, 축약 detailBody 로는 본문 없는 2.7KB 응답만 돌아온다 → 도시별 override.
  detailBodyBuilder?: (newsEpctNo: string) => string;
};

export type EminwonListItem = {
  newsEpctNo: string;
  title: string;
  department: string | null;
  publishedDate: string | null; // yyyy-mm-dd
};

// list POST body — 보도자료 list page N.
function listBody(pageIndex: number, newsEpctYn = "1", title = "보도자료"): string {
  const params = new URLSearchParams();
  params.set("pageIndex", String(pageIndex));
  params.set("jndinm", "OfrBcAdvNewsEJB");
  params.set("context", "NTIS");
  params.set("method", "selectListOfrNews");
  params.set("methodnm", "selectListOfrNewsHomepage");
  params.set("news_epct_no", "");
  params.set("subCheck", "Y");
  params.set("ofr_pageSize", "10");
  params.set("news_epct_yn", newsEpctYn);
  params.set("title", title);
  return params.toString();
}

// detail POST body — news_epct_no=ID 글 1건.
function detailBody(newsEpctNo: string, newsEpctYn = "1", title = "보도자료"): string {
  const params = new URLSearchParams();
  params.set("pageIndex", "");
  params.set("jndinm", "OfrBcAdvNewsEJB");
  params.set("context", "NTIS");
  params.set("method", "selectOfrNews");
  params.set("methodnm", "selectOfrNewsMgt");
  params.set("news_epct_no", newsEpctNo);
  params.set("subCheck", "Y");
  params.set("ofr_pageSize", "10");
  params.set("news_epct_yn", newsEpctYn);
  params.set("title", title);
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
  const $ = load(/<table\b/i.test(html) ? html : `<table>${html}</table>`);
  const items: EminwonListItem[] = [];
  const seen = new Set<string>();
  $("tr").each((_, element) => {
    const row = $(element);
    // 중첩 표의 바깥 행을 제외하고 실제 게시글의 칸만 읽습니다.
    const cells = row.children("td, th");
    if (cells.find("table").length) return;
    const id = row.html()?.match(/searchDetail\s*\(\s*['"](\d+)['"]\s*\)/)?.[1];
    if (!id || seen.has(id)) return;
    // 행번호가 th로 바뀌어도 제목 링크 자체를 기준으로 읽습니다.
    let titleCell = cells.filter('.subject, .td_left, .ellipsis, .DATA_TITLE, .skinTb-sbj').first();
    if (!titleCell.length) {
      const candidate = row.find('a[onclick*="searchDetail"], a[href*="searchDetail"]').filter((_, link) => /[가-힣]/.test($(link).text()) && $(link).text().trim().length >= 5).first();
      if (candidate.length) titleCell = cells.filter((_, cell) => cell === candidate.closest("td, th")[0]);
    }
    if (!titleCell.length) titleCell = cells.eq(1);
    const titleLink = titleCell.find("a").first();
    const title = (titleLink.length ? titleLink : titleCell).text().replace(/\s+/g, " ").trim();
    if (!/[가-힣]/.test(title) || title.length < 5) {
      silentSkips?.push(id);
      return;
    }
    const titleIndex = cells.toArray().indexOf(titleCell[0]);
    const departmentText = cells.eq(titleIndex + 1).text().replace(/\s+/g, " ").trim();
    const department = /[가-힣]/.test(departmentText) ? departmentText : null;
    const dateText = cells.toArray().map(cell => $(cell).text().trim())
      .find(text => /^\d{4}[-.]\d{2}[-.]\d{2}\.?$/.test(text));
    const publishedDate = dateText?.replace(/\./g, "-").replace(/-$/, "") ?? null;
    seen.add(id);
    items.push({ newsEpctNo: id, title, department, publishedDate });
  });
  return items;
}

// detail HTML 본문 파싱 — 가장 긴 한국어 본문.
// 2026-06-02 — 부산 북구는 본문이 td 가 아니라 div 에 존재(기장은 td). eminwon 스킨 차이.
// td 우선(기장 등 깨끗) → td 본문 250 미만이면 div/textarea/pre 후보(부산북구). td 우선이라
// 기장은 div("게시물 상세내용 보기" 라벨 포함 wrapper) 가 아닌 깨끗한 td 본문 유지.
function cleanEminwonText(raw: string): string {
  return raw
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
}

export function parseEminwonDetailBody(html: string): string | null {
  const longest = (re: RegExp): string => {
    let best = "";
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      // td regex 는 그룹1, div regex 는 그룹2 가 내용 → 마지막 캡처 그룹 사용.
      const text = cleanEminwonText(m[m.length - 1]);
      if (text.length >= 100 && /[가-힣]/.test(text) && text.length > best.length) {
        best = text;
      }
    }
    return best;
  };
  // 1차: td (기장 등 — 깨끗 본문). 2차: div/textarea/pre (부산북구 — td 본문 부족 시).
  const td = longest(/<td[^>]*>([\s\S]*?)<\/td>/gi);
  if (td.length >= 250) return td.slice(0, 20000);
  const el = longest(/<(div|textarea|pre)[^>]*>([\s\S]*?)<\/\1>/gi);
  // 본문 cut 20000 — _factory.ts createPressCollector 와 동일 정책.
  return el.length >= 250 ? el.slice(0, 20000) : null;
}

// 제목과 날짜가 있는 정상 상세 화면의 빈 본문은 저장하지 않고 건너뜁니다.
export function isEminwonEmptyArticle(html: string): boolean {
  const $ = load(html);
  const cells = $('td.DATA_CONTENT, td[style*="word-break"], td.cont, td.tleft');
  if (!cells.length) return false;
  const hasDate = /\d{4}[-.]\d{2}[-.]\d{2}/.test($("td, th, h2, h3").text());
  return hasDate && cells.toArray().every(cell => $(cell).text().trim().length < 250);
}

// config → eminwon collector. .scrapeAndInsert 가 cron 표준 시그니처.
export function createEminwonScraper(cfg: EminwonConfig) {
  // detail POST body — 도시별 override 우선, 없으면 표준(기장·부산북구).
  const newsEpctYn = cfg.newsEpctYn ?? "1";
  const title = cfg.title ?? "보도자료";
  const listPages = cfg.listPages ?? 1;
  const buildDetailBody =
    cfg.detailBodyBuilder ??
    ((newsEpctNo: string) => detailBody(newsEpctNo, newsEpctYn, title));

  async function scrapeAndInsert(
    admin: SupabaseClient,
    limit?: number,
  ): Promise<ScrapeResult> {
    const errors: string[] = [];
    let fetched = 0;
    let inserted = 0;
    let skipped = 0;
    let latestFetched: string | null = null;

    try {
      const silentSkips: string[] = [];
      const allItems: EminwonListItem[] = [];
      const seen = new Set<string>();
      for (let page = 1; page <= listPages; page += 1) {
        const listHtml = await postFetch(
          cfg.actionUrl,
          listBody(page, newsEpctYn, title),
        );
        for (const item of parseEminwonListItems(listHtml, silentSkips)) {
          if (seen.has(item.newsEpctNo)) continue;
          seen.add(item.newsEpctNo);
          allItems.push(item);
        }
      }
      if (silentSkips.length > 0) {
        errors.push(
          `title 추출 실패 ${silentSkips.length}건 (newsEpctNo: ${silentSkips.slice(0, 5).join(",")})`,
        );
      }
      const items =
        typeof limit === "number"
          ? allItems.slice(0, Math.max(limit, listPages * 10))
          : allItems;
      fetched = items.length;
      latestFetched = latestPublishedDate(items);
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
            buildDetailBody(it.newsEpctNo),
          );
          const body = parseEminwonDetailBody(detailHtml);
          if (!body) {
            if (isEminwonEmptyArticle(detailHtml)) skipped += 1;
            else errors.push(`detail ${it.newsEpctNo} 본문 추출 실패`);
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
      latestFetched,
      sourceCode: cfg.sourceCode,
      errors: errors.slice(0, 20),
    };
  }
  return { scrapeAndInsert };
}
