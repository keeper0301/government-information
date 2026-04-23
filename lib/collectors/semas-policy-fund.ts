// ============================================================
// 소상공인정책자금 (ols.semas.or.kr)
// ============================================================
// 소상공인시장진흥공단 정책자금 공지사항 스크래핑
// ============================================================

import type { Collector, CollectedItem } from "./index";
import {
  extractAgeTags,
  extractBenefitTags,
  extractHouseholdTags,
  extractOccupationTags,
  extractRegionTags,
} from "@/lib/tags/taxonomy";
import { isOutdatedByTitle, currentMinAllowedYear } from "@/lib/utils";
import * as cheerio from "cheerio";

// 정책자금 공지사항 게시판 URL
const BASE = "https://ols.semas.or.kr";
const LIST_URL = `${BASE}/ols/man/SMAN017M/notice/list.do`;
const PAGE_URL = `${BASE}/ols/man/SMAN018M/page.do`; // 정책자금 소개 페이지
const UA =
  "Mozilla/5.0 (compatible; keepio-bot/1.0; +https://www.keepioo.com)";

async function tryFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

const collector: Collector = {
  sourceCode: "semas-policy-fund",
  label: "소상공인정책자금",
  enabled: () => true,

  async *fetch() {
    const minYear = currentMinAllowedYear();

    // 공지 게시판 스크래핑
    const html = (await tryFetch(LIST_URL)) || (await tryFetch(PAGE_URL));
    if (!html) {
      console.warn("[semas-policy-fund] 페이지 로드 실패");
      return;
    }

    const $ = cheerio.load(html);

    // 게시판 행 탐색 (table.board, ul.list, .notice-item 중 하나)
    const rows = $(
      "table tbody tr, ul.list li, .board-list li, .notice-list li",
    );

    for (const row of rows.toArray()) {
      const $row = $(row);
      const titleEl = $row.find("a").first();
      const title = titleEl.text().trim();
      if (!title || title.length < 5 || isOutdatedByTitle(title, minYear)) continue;

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

      const sourceId = (href.match(/(?:notiId|seq|no|id)=(\d+)/)?.[1]) || title.substring(0, 100);
      const textBlob = title;

      yield {
        sourceCode: "semas-policy-fund",
        sourceId,
        table: "loan",
        title,
        category: "정책자금",
        target: "소상공인",
        description: `소상공인 정책자금 공고 - ${title}`,
        applyUrl: detailUrl,
        source: "소상공인시장진흥공단",
        sourceUrl: detailUrl,
        publishedAt,
        regionTags: extractRegionTags(textBlob).length > 0 ? extractRegionTags(textBlob) : ["전국"],
        ageTags: extractAgeTags(textBlob),
        occupationTags: ["소상공인", "자영업자"],
        benefitTags: ["금융", "창업"].concat(extractBenefitTags(textBlob)),
        householdTags: extractHouseholdTags(textBlob),
        rawPayload: { href, rowText: rowText.substring(0, 500) },
      };
    }
  },
};

export default collector;
