// ============================================================
// 지자체 복지 (광역·기초 지자체 통합)
// ============================================================

import type { Collector } from "./index";
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
  if (/문화|여가|바우처|관광/.test(text)) return "문화";
  if (/소상공인|자영업|창업|중소기업/.test(text)) return "소상공인";
  if (/농업|어업|임업|귀농/.test(text)) return "농업";
  if (/재난|긴급|위기|이재민/.test(text)) return "재난";
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
        if (!res.ok) break;
        xml = await res.text();
      } catch (err) {
        // 429 quota 는 fetchWithTimeout 이 자동 throw → 상위 전파
        if (err instanceof Error && err.message.includes("HTTP 429")) throw err;
        break;
      }

      if (page === 1) {
        const tm = xml.match(/<totalCount>(\d+)<\/totalCount>/);
        // 2026-04-24 Vercel Pro 300s maxDuration 확보 이후 3페이지 → 10페이지
        // 로 확대 (최대 5,000건). 지자체 시군구 시책 커버리지 대폭 확대.
        // 이전 3페이지 제한 이유는 Hobby 60s 내 60초 초과 stuck 방지였음.
        if (tm) totalPages = Math.min(Math.ceil(parseInt(tm[1]) / PER_PAGE), 10);
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

        // regionTags: 광역 + 시군구 모두 태그로 — "전라남도" 와 "순천시" 둘 다
        // 검색/필터 가능하게. 이전엔 광역만 쓰던 탓에 "순천 정책" 검색이 title
        // ILIKE 외엔 걸리지 않았음.
        const regionTags = extractRegionTags(`${ctpv} ${sgg}`);
        if (regionTags.length === 0) regionTags.push("전국");

        // region 컬럼: 이전엔 광역만("전라남도") 저장. 시군구까지 붙여 지역
        // 필터·region ILIKE 검색 정확도 ↑.
        const regionFull = sgg ? `${ctpv} ${sgg}` : ctpv || "전국";

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
          region: regionFull,
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
