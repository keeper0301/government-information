// ============================================================
// 중소벤처기업부 사업공고 (smes)
// ============================================================
// 엔드포인트 : https://apis.data.go.kr/1421000/biznEvntListService/getBiznEvntList
// data.go.kr 통합키 사용
// ============================================================

import type { Collector, CollectedItem } from "./index";
import { fetchWithTimeout } from "./index";
import {
  extractAgeTags,
  extractBenefitTags,
  extractHouseholdTags,
  extractOccupationTags,
  extractRegionTags,
} from "@/lib/tags/taxonomy";
import { isOutdatedByTitle, currentMinAllowedYear } from "@/lib/utils";

const API_URL =
  "https://apis.data.go.kr/1421000/biznEvntListService/getBiznEvntList";
const KEY = process.env.DATA_GO_KR_API_KEY || "";
const PER_PAGE = 100;
const MAX_PAGES = 15;

function parseXmlTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return null;
  return m[1]
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function fmtDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{4})[-.]?(\d{2})[-.]?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const collector: Collector = {
  sourceCode: "smes",
  label: "중기부 사업공고",
  enabled: () => !!KEY,

  async *fetch({ lastFetchedAt }) {
    const minYear = currentMinAllowedYear();

    for (let page = 1; page <= MAX_PAGES; page++) {
      let xml: string;
      try {
        const url = new URL(API_URL);
        url.searchParams.set("serviceKey", KEY);
        url.searchParams.set("pageNo", String(page));
        url.searchParams.set("numOfRows", String(PER_PAGE));

        const res = await fetchWithTimeout(url.toString());
        if (!res.ok) break;
        xml = await res.text();
      } catch (err) {
        if (err instanceof Error && err.message.includes("429")) throw err;
        console.error(`[smes] ${page}:`, err);
        break;
      }

      const regex = /<item>([\s\S]*?)<\/item>/g;
      const items: string[] = [];
      let m;
      while ((m = regex.exec(xml)) !== null) items.push(m[1]);
      if (items.length === 0) break;

      for (const b of items) {
        const sourceId = parseXmlTag(b, "bizPbancSn") || parseXmlTag(b, "seqNo");
        const title = parseXmlTag(b, "bizPbancNm") || parseXmlTag(b, "title");
        if (!sourceId || !title) continue;

        if (isOutdatedByTitle(title, minYear)) continue;

        const publishedAt = fmtDate(parseXmlTag(b, "writeDt"));
        if (lastFetchedAt && publishedAt && new Date(publishedAt) < lastFetchedAt) continue;

        const summary = parseXmlTag(b, "bizPbancCn") || parseXmlTag(b, "cn");
        const applyUrl = parseXmlTag(b, "orgInsttNm") || parseXmlTag(b, "detailUrl");

        const textBlob = [title, summary].filter(Boolean).join(" ");
        const regionTags = extractRegionTags(textBlob);
        if (regionTags.length === 0) regionTags.push("전국");

        yield {
          sourceCode: "smes",
          sourceId,
          table: "welfare",
          title,
          category: "중기부 공고",
          target: "중소기업·소상공인",
          description: summary || null,
          applyUrl,
          applyStart: fmtDate(parseXmlTag(b, "pbancBgngDt")),
          applyEnd: fmtDate(parseXmlTag(b, "pbancEndDt")),
          source: "중소벤처기업부",
          sourceUrl: applyUrl,
          region: regionTags[0] || "전국",
          publishedAt,
          regionTags,
          ageTags: extractAgeTags(textBlob),
          occupationTags: Array.from(new Set(["소상공인", "자영업자", ...extractOccupationTags(textBlob)])),
          benefitTags: extractBenefitTags(textBlob),
          householdTags: extractHouseholdTags(textBlob),
          rawPayload: { xml: b.substring(0, 1500) },
        };
      }

      await new Promise((r) => setTimeout(r, 100));
    }
  },
};

export default collector;
