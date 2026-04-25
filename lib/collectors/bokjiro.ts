// ============================================================
// 복지로 중앙 (국가 복지) - 기존 collect/route.ts 로직을 컬렉터로 이식
// ============================================================

import type { Collector, CollectedItem } from "./index";
import { fetchWithTimeout } from "./index";
import {
  extractAgeTags,
  extractBenefitTags,
  extractHouseholdTags,
  extractOccupationTags,
} from "@/lib/tags/taxonomy";
import { isOutdatedByTitle, currentMinAllowedYear } from "@/lib/utils";

const API = "https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001";
const KEY = process.env.DATA_GO_KR_API_KEY || "";
const CATEGORIES = ["001", "002", "003", "004", "005", "006", "007", "008", "009", "010"];

function parseXmlTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].replace(/&amp;/g, "&").replace(/<[^>]*>/g, "").trim() : null;
}

function mapCategory(text: string): string {
  if (!text) return "소득";
  if (/주거|임대|월세|주택/.test(text)) return "주거";
  if (/취업|고용|일자리/.test(text)) return "취업";
  if (/양육|보육|출산|임신/.test(text)) return "양육";
  if (/의료|건강|장애|재활/.test(text)) return "의료";
  if (/교육|학자금|장학/.test(text)) return "교육";
  if (/문화|여가/.test(text)) return "문화";
  return "소득";
}

const collector: Collector = {
  sourceCode: "bokjiro",
  label: "복지로 중앙",
  enabled: () => !!KEY,

  async *fetch() {
    const minYear = currentMinAllowedYear();
    const seen = new Set<string>();

    // 2026-04-25 quota 절약: numOfRows 100→500 (페이지 수 1/5), max page 10→5.
    // 호출 수: 10 카테고리 × 10 페이지 = 최대 100 → 10 × 5 = 최대 50 (실측 더 적음).
    // data.go.kr B554287 namespace quota 를 같은 키 다른 endpoint 와 공유하므로
    // bokjiro list 단독에서 quota 70% 점유하던 구조 완화.
    for (const code of CATEGORIES) {
      for (let page = 1; page <= 5; page++) {
        let xml: string;
        try {
          const params = new URLSearchParams({
            serviceKey: KEY,
            callTp: "L",
            pageNo: String(page),
            numOfRows: "500",
            srchKeyCode: code,
          });
          const res = await fetchWithTimeout(`${API}?${params}`);
          if (!res.ok) break;
          xml = await res.text();
        } catch (err) {
          // 429 는 fetchWithTimeout 이 throw → 상위 catch 로 올려 운영자 알림
          if (err instanceof Error && err.message.includes("429")) throw err;
          break;
        }

        const totalMatch = xml.match(/<totalCount>(\d+)<\/totalCount>/);
        const apiTotal = totalMatch ? parseInt(totalMatch[1]) : 0;

        const regex = /<servList>([\s\S]*?)<\/servList>/g;
        let m;
        while ((m = regex.exec(xml)) !== null) {
          const b = m[1];
          const title = parseXmlTag(b, "servNm");
          const servId = parseXmlTag(b, "servId");
          if (!title || !servId || seen.has(servId)) continue;
          seen.add(servId);

          if (isOutdatedByTitle(title, minYear)) continue;

          const theme = parseXmlTag(b, "intrsThemaArray") || parseXmlTag(b, "servDgst") || "";
          const target = parseXmlTag(b, "trgterIndvdlArray") || "";
          const desc = parseXmlTag(b, "servDgst");
          const textBlob = [title, theme, target, desc].filter(Boolean).join(" ");

          yield {
            sourceCode: "bokjiro",
            sourceId: servId,
            table: "welfare",
            title,
            category: mapCategory(theme),
            target,
            description: desc,
            benefits: parseXmlTag(b, "srvPvsnNm"),
            applyUrl: parseXmlTag(b, "servDtlLink"),
            source: parseXmlTag(b, "jurMnofNm") || "복지로",
            sourceUrl: parseXmlTag(b, "servDtlLink"),
            region: "전국",
            regionTags: ["전국"],
            ageTags: extractAgeTags(textBlob),
            occupationTags: extractOccupationTags(textBlob),
            benefitTags: extractBenefitTags(textBlob),
            householdTags: extractHouseholdTags(textBlob),
          };
        }
        if (page * 500 >= apiTotal) break;
      }
    }
  },
};

export default collector;
