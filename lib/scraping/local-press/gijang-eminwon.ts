// ============================================================
// 기장군 보도자료 수집 — eminwon 전용 (POST 기반)
// ============================================================
// 일반 정적 collector(createPressCollector) 는 GET listUrl 만 받음.
// 기장은 eminwon 시스템(OfrAction.do) 이라 list/detail 모두 POST + form-urlencoded.
// chromium 불필요 — fetch + regex 로 직접 구현.
//
// 2026-05-30 정찰 결과 (메모리 project_headless_runner_2026_05_29):
// - list POST: jndinm=OfrBcAdvNewsEJB, method=selectListOfrNews, pageIndex=N
// - detail POST: 같은 jndinm, method=selectOfrNews, news_epct_no=ID
// - list onclick: javascript:searchDetail('NNNN') → news_epct_no 식별자
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { makeNewsSourceId, makeNewsSlug } from "@/lib/news/slug-helpers";
import type { ScrapeResult } from "./_factory";

const ACTION_URL =
  "https://eminwon.gijang.go.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MINISTRY = "기장군청";
const SOURCE_OUTLET = "기장군청";
const SOURCE_CODE = "local-press-gijang";

type ListItem = {
  newsEpctNo: string; // 글 식별자(searchDetail 인자)
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

async function postFetch(body: string): Promise<string> {
  const res = await fetch(ACTION_URL, {
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
// 메모리 정찰 dump 기준: tr 안에 4909/제목/부서/등록일 sequence.
// silentSkips: 제목 추출 실패한 newsEpctNo 리스트 — 운영 audit 가시화 (m3 리뷰어 권고).
export function parseListItems(html: string, silentSkips?: string[]): ListItem[] {
  const items: ListItem[] = [];
  // tr 단위로 잘라 안에서 searchDetail + 데이터 추출.
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRe.exec(html)) !== null) {
    const tr = trMatch[1];
    const idM = tr.match(/searchDetail\('(\d+)'\)/);
    if (!idM) continue;
    const newsEpctNo = idM[1];
    // tr 안 텍스트 (tag 제거)
    const text = tr
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (text.length < 3) continue;
    // 일반 순서: [번호, 제목, 부서, 등록일, 조회수]
    // 번호는 onclick id 와 다른 표시 일련번호 — 첫 셀은 보통 짧음.
    // 제목은 한글 5+ 글자, 부서는 보통 "~과"·"센터" 등으로 끝, 날짜는 yyyy-mm-dd.
    let title = "";
    let department: string | null = null;
    let publishedDate: string | null = null;
    for (const t of text) {
      if (!title && /[가-힣]/.test(t) && t.length >= 5 && !/^\d{4}-\d{2}-\d{2}$/.test(t)) {
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
      if (!department && /[가-힣]/.test(t) && t !== title && t.length >= 2 && t.length <= 30) {
        department = t;
      }
    }
    if (!title) {
      // 제목 추출 실패 — silent skip 방지로 newsEpctNo 만 audit 노출.
      silentSkips?.push(newsEpctNo);
      continue;
    }
    items.push({ newsEpctNo, title, department, publishedDate });
  }
  return items;
}

// detail HTML 본문 파싱. eminwon detail 은 보통 본문 td (입법·고시·공고 패턴과 유사).
// 일단 가장 긴 td 내용을 본문으로 채택 (정찰 후 selector 조정).
export function parseDetailBody(html: string): string | null {
  // td 안 텍스트 중 가장 긴 한국어 본문.
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
  // 본문 cut 20000 — _factory.ts createPressCollector 와 동일 정책. 5000 컷은
  // AdSense 자체 콘텐츠 강화(P2 ai_commentary)와 충돌.
  return best.length >= 250 ? best.slice(0, 20000) : null;
}

export async function scrapeGijangEminwonAndInsert(
  admin: SupabaseClient,
  limit?: number,
): Promise<ScrapeResult> {
  const errors: string[] = [];
  let fetched = 0;
  let inserted = 0;
  let skipped = 0;

  try {
    const listHtml = await postFetch(listBody(1));
    const silentSkips: string[] = [];
    const allItems = parseListItems(listHtml, silentSkips);
    if (silentSkips.length > 0) {
      errors.push(`title 추출 실패 ${silentSkips.length}건 (newsEpctNo: ${silentSkips.slice(0, 5).join(",")})`);
    }
    const items = typeof limit === "number" ? allItems.slice(0, limit) : allItems;
    fetched = items.length;
    if (items.length === 0) {
      return {
        city: "기장군",
        fetched: 0,
        inserted: 0,
        skipped: 0,
        errors: ["list 0건 — parser 또는 URL 점검"],
      };
    }

    for (const it of items) {
      try {
        const detailHtml = await postFetch(detailBody(it.newsEpctNo));
        const body = parseDetailBody(detailHtml);
        if (!body) {
          errors.push(`detail ${it.newsEpctNo} 본문 추출 실패`);
          continue;
        }
        const sourceUrl = `${ACTION_URL}?method=selectOfrNews&jndinm=OfrBcAdvNewsEJB&news_epct_no=${it.newsEpctNo}`;
        const sourceId = makeNewsSourceId(sourceUrl);
        const slug = makeNewsSlug(it.title, "gijang", sourceId);
        const publishedAt = it.publishedDate
          ? `${it.publishedDate}T00:00:00+09:00`
          : new Date().toISOString();
        const { error } = await admin.from("news_posts").insert({
          title: it.title,
          summary: body.slice(0, 500),
          body,
          source_url: sourceUrl,
          source_outlet: SOURCE_OUTLET,
          source_code: SOURCE_CODE,
          source_id: sourceId,
          category: "news",
          slug,
          ministry: MINISTRY,
          published_at: publishedAt,
          classified_at: null,
        });
        if (error) {
          // UNIQUE 위반(중복) 은 정상 skip.
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
  return { city: "기장군", fetched, inserted, skipped, errors };
}
