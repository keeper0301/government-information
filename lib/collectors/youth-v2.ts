// ============================================================
// 온통청년 공식 Open API (2025-05 오픈)
// ============================================================
// 엔드포인트: https://www.youthcenter.go.kr/opi/youthPlcyList.do
// 파라미터: openApiVlak, pageIndex, display, query (키워드)
// 기존의 /proxy/search API (최신 10건 한도) 를 대체
// ============================================================

import type { Collector, CollectedItem } from "./index";
import {
  extractAgeTags,
  extractBenefitTags,
  extractHouseholdTags,
  extractOccupationTags,
  extractRegionTags,
} from "@/lib/tags/taxonomy";
import { isOutdatedByTitle, currentMinAllowedYear } from "@/lib/utils";

const API_URL = "https://www.youthcenter.go.kr/opi/youthPlcyList.do";
const KEY = process.env.YOUTH_CENTER_API_KEY || "";
const PER_PAGE = 100;
const MAX_PAGES = 30; // 최대 3000건

type YouthItem = {
  bizId?: string;              // 정책 ID (sourceId)
  polyBizSjnm?: string;        // 정책명
  polyItcnCn?: string;         // 정책소개
  sporCn?: string;             // 지원내용
  ageInfo?: string;            // 연령 정보
  rqutPrdCn?: string;          // 신청기간
  rqutProcCn?: string;         // 신청절차
  rfcSiteUrla1?: string;       // 참고사이트
  cnsgNmor?: string;           // 주관기관
  prcpCn?: string;             // 사업운영기관
  stdg_nm?: string;            // 법정시군구
  polyRlmCd?: string;          // 정책분야코드
  majrRqisCn?: string;         // 전공요건
  empmSttsCn?: string;         // 취업상태
  splzRlmRqisCn?: string;      // 특화분야
  regDt?: string;              // 등록일
};

async function fetchPage(page: number): Promise<{ items: YouthItem[]; total: number }> {
  // 온통청년 API 는 XML 응답 (JSON 옵션 없음으로 보임)
  const url = new URL(API_URL);
  url.searchParams.set("openApiVlak", KEY);
  url.searchParams.set("pageIndex", String(page));
  url.searchParams.set("display", String(PER_PAGE));

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`youth-v2 HTTP ${res.status}`);

  const xml = await res.text();

  // totalCnt 추출
  const totalMatch = xml.match(/<totalCnt>(\d+)<\/totalCnt>/);
  const total = totalMatch ? parseInt(totalMatch[1]) : 0;

  // <youthPolicy>...</youthPolicy> 블록 추출
  const regex = /<youthPolicy>([\s\S]*?)<\/youthPolicy>/g;
  const items: YouthItem[] = [];
  let m;
  while ((m = regex.exec(xml)) !== null) {
    const block = m[1];
    const tag = (t: string) => {
      const match = block.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`));
      return match ? match[1].trim() : undefined;
    };
    items.push({
      bizId: tag("bizId"),
      polyBizSjnm: tag("polyBizSjnm"),
      polyItcnCn: tag("polyItcnCn"),
      sporCn: tag("sporCn"),
      ageInfo: tag("ageInfo"),
      rqutPrdCn: tag("rqutPrdCn"),
      rqutProcCn: tag("rqutProcCn"),
      rfcSiteUrla1: tag("rfcSiteUrla1"),
      cnsgNmor: tag("cnsgNmor"),
      prcpCn: tag("prcpCn"),
      stdg_nm: tag("stdg_nm"),
      polyRlmCd: tag("polyRlmCd"),
      regDt: tag("regDt"),
    });
  }
  return { items, total };
}

function parseYouthPeriod(raw?: string): { start: string | null; end: string | null } {
  if (!raw) return { start: null, end: null };
  const dates = raw.match(/(\d{4})[.\-]?(\d{2})[.\-]?(\d{2})/g);
  if (!dates || dates.length === 0) return { start: null, end: null };
  const fmt = (d: string) => {
    const m = d.match(/(\d{4})[.\-]?(\d{2})[.\-]?(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  };
  const start = fmt(dates[0]);
  const end = dates.length > 1 ? fmt(dates[dates.length - 1]) : null;
  return { start, end };
}

const collector: Collector = {
  sourceCode: "youth-v2",
  label: "온통청년 공식 API",
  enabled: () => !!KEY,

  async *fetch({ lastFetchedAt }) {
    const minYear = currentMinAllowedYear();

    for (let page = 1; page <= MAX_PAGES; page++) {
      let res: { items: YouthItem[]; total: number };
      try {
        res = await fetchPage(page);
      } catch (err) {
        console.error(`[youth-v2] page ${page} 실패:`, err);
        break;
      }

      if (res.items.length === 0) break;

      for (const it of res.items) {
        const sourceId = it.bizId;
        const title = it.polyBizSjnm;
        if (!sourceId || !title) continue;

        if (isOutdatedByTitle(title, minYear)) continue;

        // regDt "20250315" 형식
        const publishedAt = it.regDt && /^\d{8}$/.test(it.regDt)
          ? `${it.regDt.substring(0, 4)}-${it.regDt.substring(4, 6)}-${it.regDt.substring(6, 8)}`
          : null;

        if (lastFetchedAt && publishedAt && new Date(publishedAt) < lastFetchedAt) {
          continue;
        }

        const { start, end } = parseYouthPeriod(it.rqutPrdCn);
        const region = (it.stdg_nm || "").split(",")[0] || "전국";
        const textBlob = [title, it.polyItcnCn, it.sporCn, it.ageInfo, it.stdg_nm]
          .filter(Boolean)
          .join(" ");

        const regionTags = extractRegionTags(textBlob);
        if (regionTags.length === 0) regionTags.push("전국");

        // 온통청년 데이터는 모두 청년 대상
        const ageTags = Array.from(new Set(["청년", ...extractAgeTags(textBlob)]));

        yield {
          sourceCode: "youth-v2",
          sourceId,
          table: "welfare",
          title,
          category: it.polyRlmCd || "청년",
          target: "청년",
          description: it.polyItcnCn || null,
          benefits: it.sporCn || null,
          applyMethod: it.rqutProcCn || null,
          applyUrl: it.rfcSiteUrla1 || null,
          applyStart: start,
          applyEnd: end,
          source: it.cnsgNmor || "온통청년",
          sourceUrl: it.rfcSiteUrla1 || null,
          region: region === "중앙부처" ? "전국" : region,
          publishedAt,
          regionTags,
          ageTags,
          occupationTags: extractOccupationTags(textBlob),
          benefitTags: extractBenefitTags(textBlob),
          householdTags: extractHouseholdTags(textBlob),
          rawPayload: it,
        };
      }

      if (res.total && page * PER_PAGE >= res.total) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  },
};

export default collector;
