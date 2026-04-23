// ============================================================
// 보조금24 (행정안전부 대한민국 공공서비스 정보)
// ============================================================
// 엔드포인트 3종:
//   1) serviceList     — 목록 (페이지네이션)
//   2) serviceDetail   — 상세 (지원내용·대상·신청방법)
//   3) supportConditions — 지원조건 코드 (지역·연령·가구형태·소득)
//
// 특성:
//   - data.go.kr 통합키 사용 (DATA_GO_KR_API_KEY)
//   - JSON 응답
//   - page·perPage 파라미터 (기본 10, 최대 100~1000)
//   - 공공서비스ID(SVCID 또는 서비스ID) 가 sourceId
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

const API_BASE = "https://api.odcloud.kr/api/gov24/v3";
const KEY = process.env.DATA_GO_KR_API_KEY || "";
const PER_PAGE = 100;
const MAX_PAGES = 80; // 전체 7,500건 수집 한도 (100 × 80)

// 응답 아이템 타입 (공공데이터포털 공지 기준 예상 필드)
type Gov24ListItem = {
  // 필드명은 실제 API 응답에 따라 조정 필요 — 실행 후 확인
  서비스ID?: string;
  서비스명?: string;
  서비스목적요약?: string;
  소관기관명?: string;
  소관기관코드?: string;
  소관기관유형?: string;
  서비스분야?: string;
  선정기준?: string;
  지원유형?: string;
  지원대상?: string;
  지원내용?: string;
  신청방법?: string;
  신청기한?: string;
  전화문의?: string;
  접수기관?: string;
  상세조회URL?: string;
  온라인신청사이트URL?: string;
  수정일시?: string;
  등록일자?: string;
};

type Gov24Response = {
  currentCount?: number;
  data?: Gov24ListItem[];
  matchCount?: number;
  page?: number;
  perPage?: number;
  totalCount?: number;
};

// 날짜 파싱 — "2025-03-15" 또는 "20250315" 또는 "2025.03.15" 대응
function parseDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{4})[-.\/]?(\d{2})[-.\/]?(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

// 신청기한 "YYYY-MM-DD ~ YYYY-MM-DD" 분리
function parseApplyPeriod(raw: string | undefined | null): { start: string | null; end: string | null } {
  if (!raw) return { start: null, end: null };
  const parts = raw.split(/~|-+/).map((s) => s.trim());
  if (parts.length >= 2) {
    return { start: parseDate(parts[0]), end: parseDate(parts[parts.length - 1]) };
  }
  const d = parseDate(raw);
  return { start: d, end: null };
}

// 소관기관명에서 지역 추출 (예: "서울특별시 강남구" → "서울")
function inferRegion(orgName: string | undefined | null): string {
  if (!orgName) return "전국";
  const tags = extractRegionTags(orgName);
  if (tags.length > 0) return tags[0];
  return "전국";
}

// welfare vs loan 분류
// 대출·금융상품은 loan_programs, 나머지는 welfare_programs
function classifyTable(item: Gov24ListItem): "welfare" | "loan" {
  const haystack = [item.서비스명, item.지원유형, item.서비스분야, item.지원내용]
    .filter(Boolean)
    .join(" ");
  if (/대출|융자|보증|자금.*지원|이자/.test(haystack)) return "loan";
  return "welfare";
}

async function fetchList(page: number): Promise<Gov24Response> {
  const url = new URL(`${API_BASE}/serviceList`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("perPage", String(PER_PAGE));
  url.searchParams.set("serviceKey", KEY);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`gov24 serviceList ${page} HTTP ${res.status}`);
  }
  const text = await res.text();
  // 인증 실패 시 XML 에러 반환하는 경우가 있음 — JSON 파싱 시도 후 실패하면 정보성 에러
  try {
    return JSON.parse(text) as Gov24Response;
  } catch {
    throw new Error(`gov24 응답 JSON 아님 (키 문제?): ${text.substring(0, 200)}`);
  }
}

// ============================================================
// Collector 구현
// ============================================================
const collector: Collector = {
  sourceCode: "gov24",
  label: "보조금24 (행정안전부)",
  enabled: () => !!KEY,

  async *fetch({ lastFetchedAt }) {
    const minYear = currentMinAllowedYear();
    let consecutiveOld = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      let res: Gov24Response;
      try {
        res = await fetchList(page);
      } catch (err) {
        console.error(`[gov24] page ${page} 실패:`, err);
        break;
      }

      const items = res.data || [];
      if (items.length === 0) break;

      for (const it of items) {
        const sourceId = it.서비스ID;
        const title = it.서비스명;
        if (!sourceId || !title) continue;

        // 옛 연도 필터
        if (isOutdatedByTitle(title, minYear)) continue;

        // 증분 수집 — 수정일이 lastFetchedAt 보다 오래되면 조기 종료 판단
        const publishedAt = parseDate(it.수정일시 || it.등록일자);
        if (lastFetchedAt && publishedAt) {
          const pub = new Date(publishedAt);
          if (pub < lastFetchedAt) {
            consecutiveOld++;
            if (consecutiveOld > 50) return; // 50건 연속 오래된 데이터 → 종료
            continue;
          } else {
            consecutiveOld = 0;
          }
        }

        const { start: applyStart, end: applyEnd } = parseApplyPeriod(it.신청기한);
        const table = classifyTable(it);
        const region = inferRegion(it.소관기관명);

        // 태그 추출 — 제목·대상·지원내용 텍스트 합쳐서 판정
        const textBlob = [
          title,
          it.지원대상,
          it.서비스목적요약,
          it.서비스분야,
          it.지원내용,
          it.선정기준,
        ]
          .filter(Boolean)
          .join(" ");

        const regionTags = extractRegionTags(
          `${it.소관기관명 || ""} ${it.접수기관 || ""} ${it.서비스명}`,
        );
        if (regionTags.length === 0) regionTags.push("전국");

        const item: CollectedItem = {
          sourceCode: "gov24",
          sourceId,
          table,
          title,
          category: it.서비스분야 || (table === "loan" ? "대출" : "기타"),
          target: it.지원대상 || null,
          description: it.서비스목적요약 || null,
          eligibility: it.선정기준 || null,
          benefits: it.지원내용 || null,
          applyMethod: it.신청방법 || null,
          applyUrl: it.온라인신청사이트URL || it.상세조회URL || null,
          applyStart,
          applyEnd,
          source: it.소관기관명 || "정부",
          sourceUrl: it.상세조회URL || null,
          region,
          publishedAt,
          regionTags,
          ageTags: extractAgeTags(textBlob),
          occupationTags: extractOccupationTags(textBlob),
          benefitTags: extractBenefitTags(textBlob),
          householdTags: extractHouseholdTags(textBlob),
          rawPayload: it,
        };

        yield item;
      }

      // 전체 건수 도달 체크
      if (res.totalCount && page * PER_PAGE >= res.totalCount) break;

      // data.go.kr Rate Limit 배려 — 각 페이지 사이 100ms
      await new Promise((r) => setTimeout(r, 100));
    }
  },
};

export default collector;
