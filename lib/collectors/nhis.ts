// ============================================================
// 국민건강보험공단 공지·지원안내 스크래핑
// ============================================================
// URL: https://www.nhis.or.kr — 공지사항·새소식 게시판
// 보조금24 API 에 이미 많은 건강보험 혜택 포함되어 있어 보조 수단
// ============================================================

import type { Collector } from "./index";
import { fetchWithTimeout } from "./index";
import {
  extractAgeTags,
  extractBenefitTags,
  extractHouseholdTags,
  extractOccupationTags,
} from "@/lib/tags/taxonomy";
import { isOutdatedByTitle, currentMinAllowedYear } from "@/lib/utils";
import * as cheerio from "cheerio";

const BASE = "https://www.nhis.or.kr";
// 국민건강보험공단 새소식 · 주요공지 게시판
const LIST_URLS = [
  `${BASE}/nhis/together/retrieveReference.do`,   // 공지사항
  `${BASE}/nhis/together/retrieveNewsListView.do`, // 새소식
];
const UA =
  "Mozilla/5.0 (compatible; keepio-bot/1.0; +https://www.keepioo.com)";

async function tryFetch(url: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": UA },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    if (err instanceof Error && err.message.includes("429")) throw err;
    return null;
  }
}

function isSupportRelated(title: string): boolean {
  return /지원|혜택|감면|환급|바우처|할인|면제|장기요양|건강검진|의료비|상한|급여|수혜|보조/.test(
    title,
  );
}

const collector: Collector = {
  sourceCode: "nhis",
  label: "국민건강보험공단 공지",
  enabled: () => true,

  async *fetch() {
    const minYear = currentMinAllowedYear();
    const seen = new Set<string>();

    for (const url of LIST_URLS) {
      const html = await tryFetch(url);
      if (!html) continue;

      const $ = cheerio.load(html);

      // 건보공단 게시판 일반적인 구조: table.board > tbody > tr > td.title > a
      const rows = $("table tbody tr, ul.list li, .notice-list li");

      for (const row of rows.toArray()) {
        const $row = $(row);
        const titleEl = $row.find("a").first();
        const title = titleEl.text().trim();
        if (!title || title.length < 5) continue;
        if (seen.has(title)) continue;
        seen.add(title);

        // 지원·혜택 관련만 수집 (단순 발표·보도자료 제외)
        if (!isSupportRelated(title)) continue;
        if (isOutdatedByTitle(title, minYear)) continue;

        const href = titleEl.attr("href") || "";
        const detailUrl = href.startsWith("http")
          ? href
          : href.startsWith("/")
          ? `${BASE}${href}`
          : null;

        const rowText = $row.text().replace(/\s+/g, " ").trim();
        const dateMatch = rowText.match(/(20\d{2})[-.](\d{1,2})[-.](\d{1,2})/);
        const publishedAt = dateMatch
          ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`
          : null;

        const sourceId = (href.match(/(?:bbsId|seq|id|no)=(\d+)/)?.[1]) || title.substring(0, 100);
        const textBlob = title;

        yield {
          sourceCode: "nhis",
          sourceId,
          table: "welfare",
          title,
          category: "의료",
          target: "건강보험 가입자",
          description: `국민건강보험공단 공지 - ${title}`,
          applyUrl: detailUrl,
          source: "국민건강보험공단",
          sourceUrl: detailUrl,
          publishedAt,
          regionTags: ["전국"],
          ageTags: extractAgeTags(textBlob),
          occupationTags: extractOccupationTags(textBlob),
          benefitTags: Array.from(
            new Set(["의료", ...extractBenefitTags(textBlob)]),
          ),
          householdTags: extractHouseholdTags(textBlob),
          rawPayload: { href, rowText: rowText.substring(0, 500) },
        };
      }
    }
  },
};

export default collector;
