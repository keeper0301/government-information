// ============================================================
// 금융위원회 서민금융상품기본정보 (FSC)
// ============================================================
// 엔드포인트: https://apis.data.go.kr/1160100/service/
//            GetSmallLoanFinanceInstituteInfoService/getOrdinaryFinanceInfo
// 응답: JSON (resultType=json)
//
// 핵심 필드 (기존 PHP class-finance-collector.php 참고):
//   finPrdNm    → 상품명
//   ofrInstNm   → 제공기관
//   lnLmt       → 대출한도
//   irt, irtCtg → 금리, 금리구분
//   trgt/tgtFltr→ 대상
//   suprTgtDtlCond → 상세조건
//   usge        → 대출용도
//   hdlInst     → 취급기관
//   rdptMthd    → 상환방식
//   maxTotLnTrm → 최대 대출기간
//   rltSite     → 신청 URL
//   cnpl        → 연락처
//   mgmDln      → 모집기한
//   snq         → 일련번호 (sourceId)
//   prdExisYn   → 현존여부 ('N' 이면 폐지 상품)
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
  "https://apis.data.go.kr/1160100/service/GetSmallLoanFinanceInstituteInfoService/getOrdinaryFinanceInfo";
const KEY = process.env.DATA_GO_KR_API_KEY || "";

type FscItem = {
  finPrdNm?: string;
  ofrInstNm?: string;
  hdlInst?: string;
  lnLmt?: string;
  irt?: string;
  irtCtg?: string;
  trgt?: string;
  tgtFltr?: string;
  suprTgtDtlCond?: string;
  usge?: string;
  rdptMthd?: string;
  maxTotLnTrm?: string;
  rltSite?: string;
  cnpl?: string;
  mgmDln?: string;
  snq?: string;
  prdExisYn?: string;
  rsdAreaPamtEqltIstm?: string;
  [key: string]: unknown;
};

type FscResponse = {
  response?: {
    body?: {
      items?: { item?: FscItem[] | FscItem };
      totalCount?: number;
    };
  };
};

// 유의미한 값 (dash 제외)
function clean(v: string | undefined): string {
  const s = (v || "").trim();
  return s === "-" ? "" : s;
}

const collector: Collector = {
  sourceCode: "fsc",
  label: "금융위 서민금융상품 (FSC)",
  enabled: () => !!KEY,

  async *fetch() {
    const PER_PAGE = 100;
    const MAX_PAGES = 10; // 최대 1,000건 (전체 8,500 중 최신 일부)

    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({
        serviceKey: KEY,
        pageNo: String(page),
        numOfRows: String(PER_PAGE),
        resultType: "json",
      });

      let data: FscResponse;
      try {
        const res = await fetch(`${API}?${params}`, { cache: "no-store" });
        if (!res.ok) break;
        const text = await res.text();
        if (text.includes("SERVICE_KEY") || text.includes("Unauthorized")) break;
        try {
          data = JSON.parse(text);
        } catch {
          break;
        }
      } catch {
        break;
      }

      const raw = data?.response?.body?.items?.item;
      const items: FscItem[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
      if (items.length === 0) break;

      for (const it of items) {
        const title = clean(it.finPrdNm);
        if (!title) continue;

        // 현존하지 않는 상품 스킵
        if (it.prdExisYn === "N") continue;

        const provider = clean(it.ofrInstNm);
        const handler = clean(it.hdlInst);
        const agency = provider || handler || "금융위원회";

        // 같은 상품명 다른 기관 구분 — 제목에 기관 포함
        const fullTitle =
          provider && !title.includes(provider) ? `${title} (${provider})` : title;

        const seq = clean(it.snq);
        const sourceId = seq || `${agency}-${title}`.slice(0, 120);

        const limit = clean(it.lnLmt);
        const rate = clean(it.irt);
        const rateType = clean(it.irtCtg);
        const target = clean(it.tgtFltr) || clean(it.trgt);
        const condition = clean(it.suprTgtDtlCond);
        const purpose = clean(it.usge);
        const repay = clean(it.rdptMthd);
        const maxTerm = clean(it.maxTotLnTrm);
        const site = clean(it.rltSite);
        const contact = clean(it.cnpl);
        const deadline = clean(it.mgmDln);
        const area = clean(it.rsdAreaPamtEqltIstm);

        // 본문 빌드
        const parts: string[] = [];
        if (target) parts.push(`지원대상: ${target}`);
        if (condition) parts.push(`상세조건: ${condition}`);
        if (purpose) parts.push(`대출용도: ${purpose}`);
        if (limit) parts.push(`대출한도: ${limit}`);
        if (rate) parts.push(`금리: ${rate}${rateType ? ` (${rateType})` : ""}`);
        if (repay) parts.push(`상환방식: ${repay}`);
        if (maxTerm) parts.push(`최대 대출기간: ${maxTerm}`);
        if (handler) parts.push(`취급기관: ${handler}`);
        if (contact) parts.push(`문의: ${contact}`);
        if (deadline) parts.push(`모집기한: ${deadline}`);
        const description = parts.join("\n\n");

        const loanAmount = limit || null;
        const interestRate = rate ? `${rate}${rateType ? ` (${rateType})` : ""}` : null;
        const applyUrl = site && /^https?:\/\//.test(site)
          ? site
          : "https://www.kinfa.or.kr/financialProduct/peopleFinancial.do";

        const textBlob = [fullTitle, target, purpose, description].join(" ");

        const regionTags = extractRegionTags(textBlob);
        if (regionTags.length === 0) regionTags.push(area || "전국");

        const occupationTags = extractOccupationTags(textBlob);

        const item: CollectedItem = {
          sourceCode: "fsc",
          sourceId,
          table: "loan",
          title: fullTitle,
          category: "금융",
          target: target || "서민·취약계층",
          description: description.substring(0, 1500),
          applyUrl,
          source: agency,
          sourceUrl: applyUrl,
          region: area || "전국",
          loanAmount,
          interestRate,
          repaymentPeriod: maxTerm || repay || null,
          regionTags,
          ageTags: extractAgeTags(textBlob),
          occupationTags,
          benefitTags: Array.from(new Set(["금융", ...extractBenefitTags(textBlob)])),
          householdTags: extractHouseholdTags(textBlob),
          rawPayload: it,
        };

        yield item;
      }

      if (items.length < PER_PAGE) break;
    }
  },
};

export default collector;
