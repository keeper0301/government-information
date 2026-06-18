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
  const td = longest(/<td[^>]*>([\s\S]*?)<\/td>/g);
  if (td.length >= 250) return td.slice(0, 20000);
  const el = longest(/<(div|textarea|pre)[^>]*>([\s\S]*?)<\/\1>/g);
  // 본문 cut 20000 — _factory.ts createPressCollector 와 동일 정책.
  return el.length >= 250 ? el.slice(0, 20000) : null;
}

// config → eminwon collector. .scrapeAndInsert 가 cron 표준 시그니처.
export function createEminwonScraper(cfg: EminwonConfig) {
  // detail POST body — 도시별 override 우선, 없으면 표준(기장·부산북구).
  const buildDetailBody = cfg.detailBodyBuilder ?? detailBody;

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
      latestFetched,
      sourceCode: cfg.sourceCode,
      errors: errors.slice(0, 20),
    };
  }
  return { scrapeAndInsert };
}
