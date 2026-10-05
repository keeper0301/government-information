// ============================================================
// 강원 철원군청 언론보도 수집 (2026-07-20) — 강원권 확장
// ============================================================
// 공식 언론보도: /www/selectBbsNttList.do?bbsNo=32&key=218
// 목록: selectBbsNttView.do(;JSESSION)?...bbsNo=32&nttNo={id}
// 상세: /www/selectBbsNttView.do?key=218&bbsNo=32&nttNo={id}
// 본문: SI 공용 헬퍼(p-table__content 셀)
// ============================================================

import { load } from "cheerio";
import {
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiNttBody } from "./_si_ntt_helper";
import { readGangwonHwpx } from "./_gangwon_hwpx";

const BASE_URL = "https://www.cwg.go.kr";
export const LIST_URL = `${BASE_URL}/www/selectBbsNttList.do?bbsNo=32&key=218`;

const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do(?:;[^?"]*)?\?(?=[^"]*bbsNo=32(?:&|&amp;|"))[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,1200}?)<\/a>/g;
const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((match = itemRe.exec(html)) !== null) {
    const seq = match[1];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = decodeBasicEntities(
      match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
    )
      .replace(/\s*새글\s*$/, "")
      .replace(/\s*\bNEW\s*$/, "")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const slice = html.slice(match.index, match.index + 3600);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch
      ? dateMatch[1].replace(/\./g, "-")
      : null;

    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/www/selectBbsNttView.do?key=218&bbsNo=32&nttNo=${seq}`,
    });
  }

  return items;
}

export async function parseDetailBody(html: string): Promise<string | null> {
  const body = parseSiNttBody(html);
  if (body && body.length >= 250) return body;
  // 철원은 본문 화면에 요약만 싣고 원문을 새 한글 문서에 첨부합니다.
  const $ = load(html);
  const attachment = $(".p-attach__item").filter((_, element) => /\.hwpx\s*$/i.test($(element).find(".p-attach__link").text())).first();
  const href = attachment.find("a.p-attach__link").attr("href");
  if (!href) return null;
  const url = new URL(decodeBasicEntities(href), `${BASE_URL}/www/`);
  if (url.origin !== BASE_URL || url.pathname !== "/www/downloadBbsFile.do") return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) return null;
    return await readGangwonHwpx(Buffer.from(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

// 직접 접속이 불안정하므로 첫 화면을 거친 브라우저 연결을 사용합니다.
export async function scrapeCheorwonAndInsert(
  admin: Parameters<typeof import("./_factory").processProvidedHtml>[1], limit = 10,
) {
  const { scrapeCheorwonBrowserAndInsert } = await import("./cheorwon-browser");
  return scrapeCheorwonBrowserAndInsert(admin, limit);
}
