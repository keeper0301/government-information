// ============================================================
// 신용보증해드림 (전국 17개 지역신용보증재단 보증상품)
// ============================================================
// URL: https://www.koreg.or.kr/haedream/gu/gurt/selectGurtList.do?mi=1124
// HTML 스크래핑 — 공식 API 없음
// ============================================================

import type { Collector, CollectedItem } from "./index";
import {
  extractAgeTags,
  extractBenefitTags,
  extractHouseholdTags,
  extractOccupationTags,
  extractRegionTags,
} from "@/lib/tags/taxonomy";
import * as cheerio from "cheerio";

const LIST_URL =
  "https://www.koreg.or.kr/haedream/gu/gurt/selectGurtList.do?mi=1124";
const UA =
  "Mozilla/5.0 (compatible; keepio-bot/1.0; +https://www.keepioo.com)";

type Parsed = {
  title: string;
  target: string;
  purpose: string;
  maxLimit: string;
  organization: string;
};

function parsePage(html: string): Parsed[] {
  const $ = cheerio.load(html);
  const results: Parsed[] = [];

  // 보증상품 리스트는 여러 셀렉터 후보 — 실제 HTML 변경에 대비
  // 후보 1: 각 상품이 article/div.card 형태
  // 후보 2: h4 제목 아래 dl/ul 속성 쌍
  // 후보 3: table > tr 형태
  $("article, .card, .gurt-item, .product-item, .item").each((_, el) => {
    const $el = $(el);
    const title = $el.find("h3, h4, .title, strong").first().text().trim();
    if (!title) return;

    const text = $el.text().replace(/\s+/g, " ").trim();
    const target = /지원대상\s*:\s*([^|∙·\n]+?)(?=\s*자금용도|\s*최대|\s*지원기관|$)/.exec(text)?.[1]?.trim() || "";
    const purpose = /자금용도\s*:\s*([^|∙·\n]+?)(?=\s*최대|\s*지원기관|$)/.exec(text)?.[1]?.trim() || "";
    const maxLimit = /최대\s*지원한도\s*:\s*([^|∙·\n]+?)(?=\s*지원기관|$)/.exec(text)?.[1]?.trim() || "";
    const organization = /지원기관\s*:\s*([^|∙·\n]+?)$/.exec(text)?.[1]?.trim() || "17개 지역신용보증재단";

    if (title && (target || purpose || maxLimit)) {
      results.push({ title, target, purpose, maxLimit, organization });
    }
  });

  // 대안 셀렉터 — 위에서 못 찾았으면 h4 기준으로 blocks 파싱
  if (results.length === 0) {
    $("h3, h4").each((_, el) => {
      const title = $(el).text().trim();
      if (!title || title.length > 80) return;

      // h4 다음 형제 요소들에서 속성 찾기
      const siblings = $(el).nextUntil("h3, h4").text().replace(/\s+/g, " ");
      const target = /지원대상\s*:\s*([^∙·\n]+?)(?=\s*자금용도|$)/.exec(siblings)?.[1]?.trim() || "";
      const purpose = /자금용도\s*:\s*([^∙·\n]+?)(?=\s*최대|$)/.exec(siblings)?.[1]?.trim() || "";
      const maxLimit = /최대\s*지원한도\s*:\s*([^∙·\n]+?)(?=\s*지원기관|$)/.exec(siblings)?.[1]?.trim() || "";
      const organization = /지원기관\s*:\s*(.+?)$/.exec(siblings)?.[1]?.trim() || "";

      if (target || purpose || maxLimit) {
        results.push({ title, target, purpose, maxLimit, organization });
      }
    });
  }

  return results;
}

const collector: Collector = {
  sourceCode: "koreg-haedream",
  label: "신용보증해드림",
  enabled: () => true, // 스크래핑 — 키 불필요

  async *fetch() {
    let html: string;
    try {
      const res = await fetch(LIST_URL, {
        headers: { "User-Agent": UA },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`koreg HTTP ${res.status}`);
      html = await res.text();
    } catch (err) {
      console.error("[koreg-haedream] fetch 실패:", err);
      return;
    }

    const items = parsePage(html);
    for (const it of items) {
      // sourceId — 제목 해시 대용 (제목이 고유)
      const sourceId = it.title.replace(/\s+/g, "-").substring(0, 100);
      const textBlob = `${it.title} ${it.target} ${it.purpose}`;

      yield {
        sourceCode: "koreg-haedream",
        sourceId,
        table: "loan",
        title: it.title,
        category: "보증",
        target: it.target || "소상공인",
        description: `지원대상: ${it.target || "-"} / 자금용도: ${it.purpose || "-"}`,
        loanAmount: it.maxLimit || null,
        applyUrl: LIST_URL,
        source: it.organization || "신용보증재단중앙회",
        sourceUrl: LIST_URL,
        regionTags: ["전국"],
        ageTags: extractAgeTags(textBlob),
        occupationTags: Array.from(
          new Set(["소상공인", "자영업자", ...extractOccupationTags(textBlob)]),
        ),
        benefitTags: ["금융", "보증"].concat(extractBenefitTags(textBlob)),
        householdTags: extractHouseholdTags(textBlob),
        rawPayload: it,
      };
    }
  },
};

export default collector;
