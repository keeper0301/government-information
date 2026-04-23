// ============================================================
// 소상공인24 공고 스크래핑
// ============================================================
// URL: https://www.sbiz24.kr/ (소상공인시장진흥공단 통합 포털)
// 지원사업 게시판 스크래핑 — 공식 API 없음
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

// 소상공인24 공고 페이지 — 실제 엔드포인트 확인 후 필요시 조정
const BASE = "https://www.sbiz24.kr";
const LIST_URL = `${BASE}/#/notice/list`;  // SPA 일 경우 SSR 불가 → fallback 필요
const UA =
  "Mozilla/5.0 (compatible; keepio-bot/1.0; +https://www.keepioo.com)";

// SPA 사이트일 가능성이 높음 — 우선 fallback 으로 sbiz.or.kr 공지도 확인
const FALLBACK_URL = "https://www.sbiz.or.kr/nedu/main/nt/ntList.do";

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
  sourceCode: "sbiz24",
  label: "소상공인24 공고",
  enabled: () => true,

  async *fetch() {
    const minYear = currentMinAllowedYear();

    // 1차: 소상공인24
    // 2차: sbiz.or.kr 공지 (폴백)
    const html = (await tryFetch(LIST_URL)) || (await tryFetch(FALLBACK_URL));
    if (!html) {
      console.warn("[sbiz24] 페이지 로드 실패 — SPA 렌더링 이슈 가능성");
      return;
    }

    const $ = cheerio.load(html);

    // 게시판 테이블 스타일 — 여러 셀렉터 시도
    const rows = $(
      "table.board tbody tr, .notice-list li, .board-list li, ul.list li, .list-item",
    );

    for (const row of rows.toArray()) {
      const $row = $(row);
      const titleEl = $row.find("a").first();
      const title = titleEl.text().trim();
      if (!title || isOutdatedByTitle(title, minYear)) continue;

      // 상세 URL
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

      const sourceId = (href.match(/(?:id|seq|bbsId|noticeId)=(\d+)/)?.[1]) || title.substring(0, 100);
      const textBlob = title;

      yield {
        sourceCode: "sbiz24",
        sourceId,
        table: "welfare",
        title,
        category: "소상공인",
        target: "소상공인",
        applyUrl: detailUrl,
        source: "소상공인시장진흥공단",
        sourceUrl: detailUrl,
        publishedAt,
        regionTags: extractRegionTags(textBlob).length > 0 ? extractRegionTags(textBlob) : ["전국"],
        ageTags: extractAgeTags(textBlob),
        occupationTags: ["소상공인", "자영업자"],
        benefitTags: extractBenefitTags(textBlob),
        householdTags: extractHouseholdTags(textBlob),
        rawPayload: { href, rowText: rowText.substring(0, 500) },
      };
    }
  },
};

export default collector;
