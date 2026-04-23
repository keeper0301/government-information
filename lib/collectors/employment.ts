// ============================================================
// 고용24 / 고용노동부 공고 (data.go.kr)
// ============================================================
// 엔드포인트: http://apis.data.go.kr/B490007/gonggoList/getGonggoList
// 인증: ServiceKey (DATA_GO_KR_API_KEY 공용 키)
// 응답: type=json → response.body.items.item[]
//
// 필드 매핑 (기존 WordPress class-employment-collector.php 이식):
//   bizPblancNm  → title       (공고명)
//   bizPblancCn  → description (공고 내용)
//   excInsttNm   → source      (집행기관명)
//
// 카테고리: "고용" 고정 (취업·직업훈련 정책 주류)
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

const API = "http://apis.data.go.kr/B490007/gonggoList/getGonggoList";
const KEY = process.env.DATA_GO_KR_API_KEY || "";

// API 응답 필드 (JSON)
type EmploymentItem = {
  bizPblancNm?: string;          // 공고명
  bizPblancCn?: string;          // 공고 내용
  excInsttNm?: string;           // 집행기관명
  // 가능성 있는 추가 필드 (응답 확인 후 보강)
  bizPblancBgnnDt?: string;      // 공고 시작일 (YYYYMMDD)
  bizPblancEndDt?: string;       // 공고 종료일
  pblancUrl?: string;            // 공고 URL
  bizPblancId?: string;          // 공고 ID
  [key: string]: unknown;
};

type EmploymentResponse = {
  response?: {
    body?: {
      items?: {
        item?: EmploymentItem[] | EmploymentItem;
      };
      totalCount?: number;
    };
  };
};

// YYYYMMDD → YYYY-MM-DD
function normalizeDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

const collector: Collector = {
  sourceCode: "employment",
  label: "고용24 (고용노동부)",
  enabled: () => !!KEY,

  async *fetch() {
    const minYear = currentMinAllowedYear();
    const PER_PAGE = 100;
    // MAX_PAGES 2 = 최대 200건. lastFetchedAt 증분 수집 미구현이라 매번 전량
    // 재수집 시도 → Vercel 60초 한도 초과 방지 위해 상위 페이지만.
    // 고용 공고는 최신순 정렬돼 있으므로 상위 2페이지면 최근 공고 커버.
    const MAX_PAGES = 2;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({
        ServiceKey: KEY,
        pageNo: String(page),
        numOfRows: String(PER_PAGE),
        type: "json",
      });

      let data: EmploymentResponse;
      try {
        const res = await fetch(`${API}?${params}`, { cache: "no-store" });
        if (!res.ok) break;
        const text = await res.text();
        if (text.includes("SERVICE_KEY") || text.includes("Unauthorized")) break;
        try {
          data = JSON.parse(text);
        } catch {
          break; // JSON 파싱 실패 = 응답 포맷 이상
        }
      } catch {
        break;
      }

      // items.item 이 단일 객체일 수도 있고 배열일 수도 있어 정규화
      const rawItems = data?.response?.body?.items?.item;
      const items: EmploymentItem[] = Array.isArray(rawItems)
        ? rawItems
        : rawItems
          ? [rawItems]
          : [];

      if (items.length === 0) break;

      for (const it of items) {
        const title = (it.bizPblancNm || "").trim();
        const content = (it.bizPblancCn || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        const agency = (it.excInsttNm || "").trim() || "고용노동부";
        const sourceId = it.bizPblancId || `${agency}-${title}`.slice(0, 120);

        if (!title) continue;
        if (isOutdatedByTitle(title, minYear)) continue;

        const textBlob = [title, content].join(" ");

        const applyStart = normalizeDate(it.bizPblancBgnnDt);
        const applyEnd = normalizeDate(it.bizPblancEndDt);
        const applyUrl = typeof it.pblancUrl === "string" ? it.pblancUrl : null;

        // 지역 태그 추출. 없으면 전국
        const regionTags = extractRegionTags(textBlob);
        if (regionTags.length === 0) regionTags.push("전국");

        // 직업 태그 — 고용 정책 기본은 구직자·근로자. 본문에서 추가 추출
        const occupationTags = Array.from(
          new Set(["구직자", ...extractOccupationTags(textBlob)]),
        );

        const item: CollectedItem = {
          sourceCode: "employment",
          sourceId,
          table: "welfare",
          title,
          category: "고용",
          target: "구직자·근로자",
          description: content.substring(0, 1500),
          applyUrl,
          applyStart,
          applyEnd,
          source: agency,
          sourceUrl: applyUrl,
          regionTags,
          ageTags: extractAgeTags(textBlob),
          occupationTags,
          benefitTags: Array.from(new Set(["고용지원", ...extractBenefitTags(textBlob)])),
          householdTags: extractHouseholdTags(textBlob),
          rawPayload: it,
        };

        yield item;
      }

      // 마지막 페이지 감지
      if (items.length < PER_PAGE) break;
    }
  },
};

export default collector;
