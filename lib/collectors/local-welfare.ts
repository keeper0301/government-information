// ============================================================
// 지자체 복지 (광역·기초 지자체 통합)
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

const API = "https://apis.data.go.kr/B554287/LocalGovernmentWelfareInformations/LcgvWelfarelist";
const KEY = process.env.DATA_GO_KR_API_KEY || "";

function parseXmlTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].replace(/&amp;/g, "&").replace(/<[^>]*>/g, "").trim() : null;
}

function mapCategory(text: string): string {
  if (!text) return "소득";
  if (/주거|임대|월세|주택/.test(text)) return "주거";
  if (/취업|고용|일자리/.test(text)) return "취업";
  if (/양육|보육|출산|임신/.test(text)) return "양육";
  if (/의료|건강|장애/.test(text)) return "의료";
  if (/교육|학자금|장학/.test(text)) return "교육";
  if (/문화|여가/.test(text)) return "문화";
  return "소득";
}

const collector: Collector = {
  sourceCode: "local-welfare",
  label: "지자체 복지",
  enabled: () => !!KEY,

  async *fetch() {
    const minYear = currentMinAllowedYear();
    const PER_PAGE = 500;
    let totalPages = 10;
    const seen = new Set<string>();

    for (let page = 1; page <= totalPages; page++) {
      let xml: string;
      try {
        const params = new URLSearchParams({
          serviceKey: KEY,
          pageNo: String(page),
          numOfRows: String(PER_PAGE),
        });
        const res = await fetchWithTimeout(`${API}?${params}`);
        if (!res.ok) {
          // 429 = quota 초과. generator throw 로 올려서 운영자 알림까지 전달.
          if (res.status === 429) {
            const body = await res.text().catch(() => "");
            throw new Error(
              `local-welfare HTTP 429 quota exceeded (page ${page}): ${body.substring(0, 200)}`,
            );
          }
          break;
        }
        xml = await res.text();
      } catch (err) {
        // 429 quota 는 상위로 전파, 그 외 일시 에러는 break (기존 동작 유지)
        if (err instanceof Error && err.message.includes("429")) throw err;
        break;
      }

      if (page === 1) {
        const tm = xml.match(/<totalCount>(\d+)<\/totalCount>/);
        // 최대 3페이지(=1500건) 로 제한.
        // 디버그 streaming 결과 (a686ed2 검증):
        //   - fetch + parse + yield 19.8초 (4559건)
        //   - 50건 batch upsert × 91회 = 60초 초과 → stuck
        // 1500건이면 batch upsert 약 8회로 충분. 다음 cron 에 갱신.
        if (tm) totalPages = Math.min(Math.ceil(parseInt(tm[1]) / PER_PAGE), 3);
      }

      const regex = /<servList>([\s\S]*?)<\/servList>/g;
      let m;
      while ((m = regex.exec(xml)) !== null) {
        const b = m[1];
        const servId = parseXmlTag(b, "servId");
        const title = parseXmlTag(b, "servNm");
        const sgg = parseXmlTag(b, "sggNm") || "";
        const ctpv = parseXmlTag(b, "ctpvNm") || "";
        if (!servId || !title || seen.has(servId)) continue;
        seen.add(servId);

        const fullTitle = sgg ? `${title} (${ctpv} ${sgg})` : title;
        if (isOutdatedByTitle(fullTitle, minYear)) continue;

        const theme = parseXmlTag(b, "intrsThemaNmArray") || parseXmlTag(b, "servDgst") || "";
        const target = parseXmlTag(b, "trgterIndvdlNmArray") || "";
        const desc = parseXmlTag(b, "servDgst");
        const textBlob = [title, theme, target, desc, ctpv, sgg].filter(Boolean).join(" ");

        const regionTags = extractRegionTags(ctpv);
        if (regionTags.length === 0) regionTags.push("전국");

        yield {
          sourceCode: "local-welfare",
          sourceId: servId,
          table: "welfare",
          title: fullTitle,
          category: mapCategory(theme),
          target,
          description: desc,
          benefits: parseXmlTag(b, "srvPvsnNm"),
          applyMethod: parseXmlTag(b, "aplyMtdNm"),
          applyUrl: parseXmlTag(b, "servDtlLink"),
          source: ctpv || "지자체",
          sourceUrl: parseXmlTag(b, "servDtlLink"),
          region: ctpv || "전국",
          regionTags,
          ageTags: extractAgeTags(textBlob),
          occupationTags: extractOccupationTags(textBlob),
          benefitTags: extractBenefitTags(textBlob),
          householdTags: extractHouseholdTags(textBlob),
        };
      }
    }
  },
};

export default collector;
