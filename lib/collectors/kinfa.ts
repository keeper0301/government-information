// ============================================================
// 서민금융진흥원 대출상품한눈에 (KINFA)
// ============================================================
// 엔드포인트: https://apis.data.go.kr/B553701/LoanProductSearchingInfo/
//            LoanProductSearchingInfo/getLoanProductSearchingInfo
// 응답: XML (기본)
// 총 325건 내외
//
// 핵심 필드 (소문자):
//   finprdnm   → 상품명
//   ofrinstnm  → 제공기관
//   hdlinst    → 취급기관
//   lnlmt      → 대출한도 (만원)
//   irt, irtCtg→ 금리, 금리구분
//   trgt, tgtFltr → 대상
//   suprtgtdtlcond → 상세조건
//   usge       → 대출용도
//   rdptmthd   → 상환방식
//   maxtotlntrm → 최대 대출기간 (년)
//   rltsite    → 관련 사이트 URL
//   cnpl       → 연락처
//   seq        → 일련번호 (sourceId)
//   rsdAreaPamtEqltIstm → 거주 지역
// ============================================================

import type { Collector, CollectedItem } from "./index";
import {
  extractAgeTags,
  extractBenefitTags,
  extractHouseholdTags,
  extractOccupationTags,
  extractRegionTags,
} from "@/lib/tags/taxonomy";

const API =
  "https://apis.data.go.kr/B553701/LoanProductSearchingInfo/LoanProductSearchingInfo/getLoanProductSearchingInfo";
const KEY = process.env.DATA_GO_KR_API_KEY || "";

// XML 단일 태그 파싱 (loans-mss.ts 와 동일 패턴)
function parseXmlTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return m[1]
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(v: string): string {
  return v === "-" ? "" : v;
}

const collector: Collector = {
  sourceCode: "kinfa",
  label: "서민금융진흥원 대출상품 (KINFA)",
  enabled: () => !!KEY,

  async *fetch() {
    const PER_PAGE = 100;
    const MAX_PAGES = 5; // 최대 500건 (KINFA 총 325건 전량 커버)

    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({
        serviceKey: KEY,
        pageNo: String(page),
        numOfRows: String(PER_PAGE),
      });

      let xml: string;
      try {
        const res = await fetch(`${API}?${params}`, { cache: "no-store" });
        if (!res.ok) break;
        xml = await res.text();
        if (xml.includes("SERVICE_KEY") || xml.includes("Unauthorized")) break;
      } catch {
        break;
      }

      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let m: RegExpExecArray | null;
      let itemsOnPage = 0;

      while ((m = itemRegex.exec(xml)) !== null) {
        itemsOnPage++;
        const block = m[1];

        const title = parseXmlTag(block, "finprdnm").trim();
        if (!title) continue;

        const seq = parseXmlTag(block, "seq") || "";
        const limitRaw = clean(parseXmlTag(block, "lnlmt"));
        const rate = clean(parseXmlTag(block, "irt"));
        const rateType = clean(parseXmlTag(block, "irtCtg"));
        const target = clean(parseXmlTag(block, "tgtFltr")) || clean(parseXmlTag(block, "trgt"));
        const condition = clean(parseXmlTag(block, "suprtgtdtlcond"));
        const purpose = clean(parseXmlTag(block, "usge"));
        const provider = clean(parseXmlTag(block, "ofrinstnm"));
        const handler = clean(parseXmlTag(block, "hdlinst"));
        const repay = clean(parseXmlTag(block, "rdptmthd"));
        const detailUrl = clean(parseXmlTag(block, "rltsite"));
        const contact = clean(parseXmlTag(block, "cnpl"));
        const maxTerm = clean(parseXmlTag(block, "maxtotlntrm"));
        const area = clean(parseXmlTag(block, "rsdAreaPamtEqltIstm"));

        const agency = provider || handler || "서민금융진흥원";
        const sourceId = seq || `${agency}-${title}`.slice(0, 120);

        // 본문 빌드
        const parts: string[] = [];
        if (target) parts.push(`지원대상: ${target}`);
        if (condition) parts.push(`상세조건: ${condition}`);
        if (purpose) parts.push(`대출용도: ${purpose}`);
        if (limitRaw) parts.push(`대출한도: 최대 ${limitRaw}만원`);
        if (rate) parts.push(`금리: ${rate}%${rateType ? ` (${rateType})` : ""}`);
        if (repay) parts.push(`상환방식: ${repay}`);
        if (maxTerm) parts.push(`최대 대출기간: ${maxTerm}년`);
        if (handler) parts.push(`취급기관: ${handler}`);
        if (contact) parts.push(`문의: ${contact}`);
        const description = parts.join("\n\n");

        const loanAmount = limitRaw ? `최대 ${limitRaw}만원` : null;
        const interestRate = rate
          ? `${rate}%${rateType ? ` (${rateType})` : ""}`
          : null;
        const applyUrl =
          detailUrl && /^https?:\/\//.test(detailUrl)
            ? detailUrl
            : "https://www.kinfa.or.kr/financialProduct/peopleFinancial.do";

        const textBlob = [title, target, purpose, description].join(" ");
        const regionTags = extractRegionTags(textBlob);
        if (regionTags.length === 0) regionTags.push(area || "전국");

        const item: CollectedItem = {
          sourceCode: "kinfa",
          sourceId,
          table: "loan",
          title,
          category: "금융",
          target: target || "서민·취약계층",
          description: description.substring(0, 1500),
          applyUrl,
          source: agency,
          sourceUrl: applyUrl,
          region: area || "전국",
          loanAmount,
          interestRate,
          repaymentPeriod: maxTerm ? `${maxTerm}년` : repay || null,
          regionTags,
          ageTags: extractAgeTags(textBlob),
          occupationTags: extractOccupationTags(textBlob),
          benefitTags: Array.from(new Set(["금융", ...extractBenefitTags(textBlob)])),
          householdTags: extractHouseholdTags(textBlob),
          rawPayload: { seq, title, provider, handler, rate, limitRaw },
        };

        yield item;
      }

      if (itemsOnPage === 0 || itemsOnPage < PER_PAGE) break;
    }
  },
};

export default collector;
