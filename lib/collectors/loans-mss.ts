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

// <item> 블록의 모든 태그를 {태그명: 정제문자열} dict 로 — raw_payload 저장용.
// mss data.go.kr API 가 별도 Detail 엔드포인트 없고 List 응답 필드도 공식 문서
// 확인 불가라, List 응답 전체를 DB 에 보존해두면 Phase 2 에서 detail-fetcher 가
// 추가 필드(예: 지원조건·모집분야·담당부서 등)를 raw_payload 에서 추출 가능.
// 기존 549 row 는 재수집될 때 채워짐 (source_code+source_id upsert).
function parseAllTags(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /<([a-zA-Z][\w-]*)>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = regex.exec(block)) !== null) {
    const tag = m[1];
    const raw = m[2]
      .replace(/<!\[CDATA\[/g, "")
      .replace(/\]\]>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (raw) result[tag] = raw;
  }
  return result;
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
          // Phase 1: 전체 XML 태그를 dict 로 보존 — Phase 2 에서 detail-fetcher 가
          // 추가 필드(ex: 지원조건·모집분야·첨부파일) 추출 시 외부 API 재호출 없이
          // DB 원본 파싱 가능 (youthcenter 와 동일 패턴, be3e5dc 참고).
          rawPayload: parseAllTags(b),
        };
      }
    }
  },
};

export default collector;
