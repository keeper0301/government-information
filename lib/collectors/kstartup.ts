// ============================================================
// 창업진흥원 K-Startup 사업공고 API
// ============================================================
// 엔드포인트: https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01
// data.go.kr 통합키 사용 (DATA_GO_KR_API_KEY)
// 모든 수집 항목은 창업 카테고리 → benefit_tags = ['창업']
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
  "https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01";
const KEY = process.env.DATA_GO_KR_API_KEY || "";
const PER_PAGE = 100;
const MAX_PAGES = 20;

function parseXmlTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return null;
  return m[1]
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function fmtDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{4})[-.]?(\d{2})[-.]?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const collector: Collector = {
  sourceCode: "kstartup",
  label: "K-Startup 사업공고",
  enabled: () => !!KEY,

  async *fetch({ lastFetchedAt }) {
    const minYear = currentMinAllowedYear();

    for (let page = 1; page <= MAX_PAGES; page++) {
      let xml: string;
      try {
        const url = new URL(API_URL);
        url.searchParams.set("serviceKey", KEY);
        url.searchParams.set("page", String(page));
        url.searchParams.set("perPage", String(PER_PAGE));
        url.searchParams.set("returnType", "XML");

        const res = await fetchWithTimeout(url.toString());
        if (!res.ok) break;
        xml = await res.text();
      } catch (err) {
        if (err instanceof Error && err.message.includes("429")) throw err;
        console.error(`[kstartup] page ${page}:`, err);
        break;
      }

      const regex = /<item>([\s\S]*?)<\/item>/g;
      const items: RegExpExecArray[] = [];
      let m;
      while ((m = regex.exec(xml)) !== null) items.push(m);
      if (items.length === 0) break;

      for (const match of items) {
        const b = match[1];
        const sourceId =
          parseXmlTag(b, "pbancSn") || parseXmlTag(b, "bizPbancNm") || null;
        const title = parseXmlTag(b, "bizPbancNm") || parseXmlTag(b, "biz_pbanc_nm");
        if (!sourceId || !title) continue;

        if (isOutdatedByTitle(title, minYear)) continue;

        const publishedAt = fmtDate(
          parseXmlTag(b, "pbancRcptBgngDt") || parseXmlTag(b, "regDt"),
        );
        if (lastFetchedAt && publishedAt && new Date(publishedAt) < lastFetchedAt) continue;

        const region = parseXmlTag(b, "supportRegion") || "전국";
        const summary = parseXmlTag(b, "pbancCtnt") || parseXmlTag(b, "bizEnyy");
        const target = parseXmlTag(b, "aplyTrgtCtnt") || parseXmlTag(b, "aplyTrgt");
        const applyUrl = parseXmlTag(b, "detlPgUrl") || parseXmlTag(b, "biz_gdnc_url");

        const textBlob = [title, summary, target, region].filter(Boolean).join(" ");

        const regionTags = extractRegionTags(textBlob);
        if (regionTags.length === 0) regionTags.push("전국");

        yield {
          sourceCode: "kstartup",
          sourceId,
          table: "welfare",
          title,
          category: "창업",
          target: target || "창업자",
          description: summary || null,
          applyUrl,
          applyStart: fmtDate(parseXmlTag(b, "pbancRcptBgngDt")),
          applyEnd: fmtDate(parseXmlTag(b, "pbancRcptEndDt")),
          source: parseXmlTag(b, "pbancNtrpNm") || "창업진흥원",
          sourceUrl: applyUrl,
          region,
          publishedAt,
          regionTags,
          ageTags: extractAgeTags(textBlob),
          occupationTags: Array.from(new Set(["창업자", ...extractOccupationTags(textBlob)])),
          benefitTags: Array.from(new Set(["창업", ...extractBenefitTags(textBlob)])),
          householdTags: extractHouseholdTags(textBlob),
          rawPayload: { xml: b.substring(0, 1500) },
        };
      }

      await new Promise((r) => setTimeout(r, 100));
    }
  },
};

export default collector;
