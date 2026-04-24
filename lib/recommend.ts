// ============================================================
// 맞춤추천 매칭 로직 (API 라우트 / 서버 컴포넌트 공용)
// ============================================================
// /api/recommend POST 와 /recommend 페이지 SSR 초기 렌더가 동일 함수를 호출.
// 지역 별칭·제목 prefix·본문 타지역 언급 3단계 판단 + 직업/나이 키워드 매칭
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { welfareToDisplay, loanToDisplay, type DisplayProgram } from "@/lib/programs";
import type { WelfareProgram, LoanProgram } from "@/lib/database.types";
import {
  AGE_KEYWORDS,
  OCCUPATION_KEYWORDS,
  type AgeOption,
  type OccupationOption,
  type RegionOption,
} from "@/lib/profile-options";

// programType: "all" (기본) / "welfare" (복지만) / "loan" (대출만)
export const PROGRAM_TYPES = ["all", "welfare", "loan"] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

// ─────────────────────────────────────────────────────────────
// 지역 별칭 — DB region 값이 "서울특별시" 같이 저장되거나 제목/출처에
// "서울시"·"서울특별시" 등으로 언급될 때 모두 매칭되도록 별칭 목록으로 관리.
// 모든 alias 는 length >= 2 (2글자 이상) 이어야 부분 문자열 오탐 최소.
// ─────────────────────────────────────────────────────────────
const REGION_ALIASES: Record<Exclude<RegionOption, "전국">, string[]> = {
  서울: ["서울특별시", "서울시", "서울"],
  경기: ["경기도", "경기"],
  인천: ["인천광역시", "인천시", "인천"],
  부산: ["부산광역시", "부산시", "부산"],
  대구: ["대구광역시", "대구시", "대구"],
  광주: ["광주광역시", "광주시", "광주"],
  대전: ["대전광역시", "대전시", "대전"],
  울산: ["울산광역시", "울산시", "울산"],
  세종: ["세종특별자치시", "세종시", "세종"],
  강원: ["강원특별자치도", "강원도", "강원"],
  충북: ["충청북도", "충북"],
  충남: ["충청남도", "충남"],
  전북: ["전북특별자치도", "전라북도", "전북"],
  전남: ["전라남도", "전남"],
  경북: ["경상북도", "경북"],
  경남: ["경상남도", "경남"],
  제주: ["제주특별자치도", "제주도", "제주"],
};

// 제목 맨 앞 "[XX]" 형태에서 XX 추출 (예: "[대전] 소상공인…" → "대전")
function extractTitlePrefix(title: string): string | null {
  const m = title.match(/^\s*\[([^\]]+)\]/);
  return m ? m[1].trim() : null;
}

// 프로그램 1건이 사용자 지역과 매칭되는지 4단계로 판단:
//   1) DB region 명시 → 그 값이 우선 (다른 지역이면 제외)
//   2) DB region NULL + 제목 "[XX]" prefix → prefix 로 판단
//   3) 제목·출처 본문에 타지역 명시 → 제외 (단 사용자 지역도 함께 있으면 유지)
//   4) 판단 근거 없음 → 전국 대상으로 간주 (포함)
//
// 시군구 (district) 는 매칭 통과 여부에는 영향 X — districtBonus 로 정렬
// 가산점만 부여. 즉 같은 광역의 다른 시군구 정책도 노출하되, 사용자
// 시군구 항목은 위쪽에 정렬. 시군구로 매칭 통과 결정하면 false positive
// 위험 (예: "중구"·"동구" 같은 동명 시군구가 7개 광역에 모두 존재
// → "부산 중구" 사용자가 "서울 중구" 정책도 매칭되는 버그).
function regionMatches(
  title: string,
  source: string | null,
  region: string | null,
  userRegion: RegionOption,
): boolean {
  if (userRegion === "전국") return true;

  const userAliases = REGION_ALIASES[userRegion] ?? [userRegion];

  // 1) DB region 명시된 경우가 가장 강한 신호
  if (region && region.trim().length > 0) {
    if (region.includes("전국")) return true;
    if (userAliases.some((a) => region.includes(a))) return true;
    return false;
  }

  // 2) region NULL → 제목 prefix 로 판단
  const prefix = extractTitlePrefix(title);
  if (prefix) {
    if (userAliases.some((a) => prefix.includes(a))) return true;
    for (const [otherKey, aliases] of Object.entries(REGION_ALIASES)) {
      if (otherKey === userRegion) continue;
      if (aliases.some((a) => prefix.includes(a))) return false;
    }
  }

  // 3) 제목 + 출처 본문에 타지역이 명시된 경우
  const searchText = `${title} ${source ?? ""}`;
  const userMentioned = userAliases.some((a) => searchText.includes(a));

  for (const [otherKey, aliases] of Object.entries(REGION_ALIASES)) {
    if (otherKey === userRegion) continue;
    if (aliases.some((a) => searchText.includes(a))) {
      return userMentioned;
    }
  }

  // 4) 판단 근거 없음 → 전국 대상으로 간주
  return true;
}

// 시군구 정확 매칭 가산점 — 같은 광역 안에서도 사용자가 자기 시군구 항목을
// 위쪽에 보도록 함. regionMatches 가 true 일 때 (= 광역 매칭 통과) 만 의미 있음.
//
// 광역 매칭이 이미 통과한 row 만 들어오므로 false positive 위험 없음.
// 예: "부산 중구" 사용자 → 부산광역시 매칭 row 만 후보 → 그중 "중구" 포함된
// 항목에만 가산점 → 같은 부산 안에서 중구 정책 우선 노출.
function districtBonus(
  title: string,
  source: string | null,
  region: string | null,
  userDistrict?: string | null,
): number {
  if (!userDistrict || userDistrict.length < 2) return 0;
  const haystack = `${region ?? ""} ${title} ${source ?? ""}`;
  return haystack.includes(userDistrict) ? 5 : 0;
}

// 키워드 매칭 점수 계산
// - 직업 매칭(가중치 2) + 나이 매칭(가중치 1)
// - occMatched=true 여야 최종 결과에 포함 ("기타" 직업만 예외)
function scoreProgram(
  target: string | null | undefined,
  description: string | null | undefined,
  ageKw: string[],
  occKw: string[],
): { score: number; occMatched: boolean } {
  const combined = `${target ?? ""} ${description ?? ""}`.toLowerCase();
  let ageMatch = 0;
  let occMatch = 0;
  for (const kw of ageKw) {
    if (combined.includes(kw.toLowerCase())) ageMatch++;
  }
  for (const kw of occKw) {
    if (combined.includes(kw.toLowerCase())) occMatch++;
  }
  return {
    score: occMatch * 2 + ageMatch,
    occMatched: occMatch > 0,
  };
}

// 후보 limit — 지역/직업 필터 후 결과 부족 방지
const CANDIDATE_LIMIT = 300;

type RecommendParams = {
  ageGroup: AgeOption;
  region: RegionOption;
  district?: string | null;
  occupation: OccupationOption;
  programType?: ProgramType;
  // 홈의 맞춤 섹션(복지 4 · 대출 3) 처럼 /recommend 페이지(20건) 외 용도에서 쓰라고
  // 노출. 기본값 20 은 /recommend 페이지 기대치와 동일.
  limit?: number;
};

// 추천 결과 계산 (API 라우트·서버 페이지·홈 맞춤 섹션 공용 진입점)
// 반환: 매칭 점수 내림차순 정렬 (동점이면 view_count 순) 최대 limit 건
// district 가 주어지면 그 시군구 항목이 가산점(+5) 으로 위쪽 정렬됨
export async function getRecommendations(params: RecommendParams): Promise<DisplayProgram[]> {
  const {
    ageGroup,
    region,
    district = null,
    occupation,
    programType = "all",
    limit = 20,
  } = params;

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const ageKw = AGE_KEYWORDS[ageGroup] ?? [];
  const occKw = OCCUPATION_KEYWORDS[occupation] ?? [];
  const requireOccMatch = occKw.length > 0; // "기타" 직업은 매칭 필수 조건 풀어줌

  const includeWelfare = programType === "all" || programType === "welfare";
  const includeLoan = programType === "all" || programType === "loan";

  const [welfareData, loanData]: [WelfareProgram[], LoanProgram[]] = await Promise.all([
    includeWelfare
      ? supabase
          .from("welfare_programs")
          .select("*")
          .or(`apply_end.gte.${today},apply_end.is.null`)
          .order("view_count", { ascending: false })
          .limit(CANDIDATE_LIMIT)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    includeLoan
      ? supabase
          .from("loan_programs")
          .select("*")
          .or(`apply_end.gte.${today},apply_end.is.null`)
          .order("view_count", { ascending: false })
          .limit(CANDIDATE_LIMIT)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  const filteredWelfare = welfareData
    .filter((w) => regionMatches(w.title, w.source, w.region, region))
    .map((w) => {
      const s = scoreProgram(w.target, w.description, ageKw, occKw);
      return {
        display: welfareToDisplay(w),
        score: s.score + districtBonus(w.title, w.source, w.region, district),
        occMatched: s.occMatched,
      };
    })
    .filter((x) => !requireOccMatch || x.occMatched);

  // LoanProgram 에는 region 컬럼 없음 → null 전달, 제목·출처로 판단
  const filteredLoan = loanData
    .filter((l) => regionMatches(l.title, l.source, null, region))
    .map((l) => {
      const s = scoreProgram(l.target, l.description, ageKw, occKw);
      return {
        display: loanToDisplay(l),
        score: s.score + districtBonus(l.title, l.source, null, district),
        occMatched: s.occMatched,
      };
    })
    .filter((x) => !requireOccMatch || x.occMatched);

  return [...filteredWelfare, ...filteredLoan]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.display);
}
