// ============================================================
// 소상공인 지원사업 (MSS) - 기존 collect/route.ts 이식
// ============================================================

import type { Collector, CollectedItem } from "./index";
import { fetchWithTimeout } from "./index";
import {
  extractAgeTags,
  extractBenefitTags,
  extractHouseholdTags,
  extractRegionTags,
} from "@/lib/tags/taxonomy";
import { isOutdatedByTitle, currentMinAllowedYear } from "@/lib/utils";

const API = "https://apis.data.go.kr/1421000/mssBizService_v2/getbizList_v2";
const KEY = process.env.DATA_GO_KR_API_KEY || "";

function parseXmlTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return null;
  return m[1]
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapLoanCategory(text: string): string {
  if (/보증/.test(text)) return "보증";
  if (/지원금|보조/.test(text)) return "지원금";
  return "대출";
}

const collector: Collector = {
  sourceCode: "mss",
  label: "소상공인 지원사업 (MSS)",
  enabled: () => !!KEY,

  async *fetch() {
    const minYear = currentMinAllowedYear();
    const PER_PAGE = 100;
    let totalPages = 5;

    for (let page = 1; page <= totalPages; page++) {
      let xml: string;
      try {
        const params = new URLSearchParams({
          serviceKey: KEY,
          pageNo: String(page),
          numOfRows: String(PER_PAGE),
        });
        const res = await fetchWithTimeout(`${API}?${params}`);
        if (!res.ok) break;
        xml = await res.text();
        if (xml.includes("Unauthorized") || xml.includes("SERVICE_KEY")) break;
      } catch (err) {
        if (err instanceof Error && err.message.includes("429")) throw err;
        break;
      }

      if (page === 1) {
        const tm = xml.match(/<totalCount>(\d+)<\/totalCount>/);
        if (tm) totalPages = Math.min(Math.ceil(parseInt(tm[1]) / PER_PAGE), 10);
      }

      const regex = /<item>([\s\S]*?)<\/item>/g;
      let m;
      while ((m = regex.exec(xml)) !== null) {
        const b = m[1];
        const title = parseXmlTag(b, "title");
        const viewUrl = parseXmlTag(b, "viewUrl");
        const sourceId = viewUrl ? viewUrl.split("/").pop() || viewUrl : title || "";
        if (!title || !sourceId) continue;

        if (isOutdatedByTitle(title, minYear)) continue;

        const content = parseXmlTag(b, "dataContents") || "";
        const textBlob = [title, content].join(" ");

        const regionTags = extractRegionTags(textBlob);
        if (regionTags.length === 0) regionTags.push("전국");

        yield {
          sourceCode: "mss",
          sourceId,
          table: "loan",
          title,
          category: mapLoanCategory(title),
          target: parseXmlTag(b, "writerPosition") || "소상공인",
          description: content.substring(0, 1500),
          applyUrl: viewUrl,
          applyStart: parseXmlTag(b, "applicationStartDate"),
          applyEnd: parseXmlTag(b, "applicationEndDate"),
          source: "중소벤처기업부",
          sourceUrl: viewUrl,
          regionTags,
          ageTags: extractAgeTags(textBlob),
          occupationTags: ["소상공인", "자영업자"],
          benefitTags: Array.from(new Set(["금융", ...extractBenefitTags(textBlob)])),
          householdTags: extractHouseholdTags(textBlob),
        };
      }
    }
  },
};

export default collector;
