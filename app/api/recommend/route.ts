import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { welfareToDisplay, loanToDisplay } from "@/lib/programs";
import type { WelfareProgram, LoanProgram } from "@/lib/database.types";
import {
  AGE_KEYWORDS,
  OCCUPATION_KEYWORDS,
  REGION_OPTIONS,
  type AgeOption,
  type OccupationOption,
  type RegionOption,
} from "@/lib/profile-options";

const ageKeywords = AGE_KEYWORDS;
const occupationKeywords = OCCUPATION_KEYWORDS;
const VALID_REGIONS = REGION_OPTIONS;

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

// 프로그램 1건이 사용자 지역과 매칭되는지 3단계로 판단:
//   1) DB region 명시 → 그 값이 우선 (다른 지역이면 제외)
//   2) DB region NULL + 제목 "[XX]" prefix → prefix 로 판단
//   3) 제목·출처 본문에 타지역 명시 → 제외 (단 사용자 지역도 함께 있으면 유지)
//   4) 판단 근거 없음 → 전국 대상으로 간주 (포함)
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
    // DB 에 다른 지역이 박혀있음 → 명확히 제외
    return false;
  }

  // 2) region NULL → 제목 prefix 로 판단
  const prefix = extractTitlePrefix(title);
  if (prefix) {
    if (userAliases.some((a) => prefix.includes(a))) return true;
    // prefix 가 타지역이면 제외 (예: "[대전]" 은 전남 사용자에게 제외)
    for (const [otherKey, aliases] of Object.entries(REGION_ALIASES)) {
      if (otherKey === userRegion) continue;
      if (aliases.some((a) => prefix.includes(a))) return false;
    }
    // prefix 가 지역이 아닌 태그(예: [안내], [긴급]) → 계속 진행
  }

  // 3) 제목 + 출처 본문에 타지역이 명시된 경우
  const searchText = `${title} ${source ?? ""}`;
  const userMentioned = userAliases.some((a) => searchText.includes(a));

  for (const [otherKey, aliases] of Object.entries(REGION_ALIASES)) {
    if (otherKey === userRegion) continue;
    if (aliases.some((a) => searchText.includes(a))) {
      // 타지역이 나오지만 사용자 지역도 함께 언급 → 다지역 공고로 보고 포함
      return userMentioned;
    }
  }

  // 4) 판단 근거 없음 → 전국 대상으로 간주
  return true;
}

// 키워드 매칭 점수 계산
// - 직업 매칭(가중치 2) + 나이 매칭(가중치 1)
// - occMatched=true 여야 최종 결과에 포함 (청년주택이 자영업자에게 안 뜨도록)
function scoreProgram(
  target: string | null | undefined,
  description: string | null | undefined,
  ageKw: string[],
  occKw: string[],
): { score: number; occMatched: boolean; ageMatched: boolean } {
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
    ageMatched: ageMatch > 0,
  };
}

// programType: "all" (기본) / "welfare" (복지만) / "loan" (대출만)
const VALID_PROGRAM_TYPES = ["all", "welfare", "loan"] as const;
type ProgramType = (typeof VALID_PROGRAM_TYPES)[number];

export async function POST(request: NextRequest) {
  const { ageGroup, region, occupation, programType = "all" } = await request.json();

  // ── 입력값 검증 (기존 유지) ──
  if (!ageGroup || !region || !occupation) {
    return NextResponse.json({ error: "모든 항목을 선택해주세요." }, { status: 400 });
  }
  if (!(ageGroup in ageKeywords)) {
    return NextResponse.json({ error: "올바른 나이대를 선택해주세요." }, { status: 400 });
  }
  if (!VALID_REGIONS.includes(region)) {
    return NextResponse.json({ error: "올바른 지역을 선택해주세요." }, { status: 400 });
  }
  if (!(occupation in occupationKeywords)) {
    return NextResponse.json({ error: "올바른 직업을 선택해주세요." }, { status: 400 });
  }
  if (!VALID_PROGRAM_TYPES.includes(programType as ProgramType)) {
    return NextResponse.json({ error: "올바른 정보 종류를 선택해주세요." }, { status: 400 });
  }

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const ageKw = ageKeywords[ageGroup as AgeOption] ?? [];
  const occKw = occupationKeywords[occupation as OccupationOption] ?? [];
  const userRegion = region as RegionOption;

  // "기타" 직업은 OCCUPATION_KEYWORDS 가 빈 배열이라 직업 매칭 필수 조건을 풀어줌
  const requireOccMatch = occKw.length > 0;

  const includeWelfare = programType === "all" || programType === "welfare";
  const includeLoan = programType === "all" || programType === "loan";

  // 후보군을 넉넉히 확보 (최대 300건)
  // — 기존 100건은 지역/직업 필터 후 결과가 비어버릴 위험이 있음
  const CANDIDATE_LIMIT = 300;

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

  // 지역 필터 + 키워드 스코어링 + 직업 매칭 필수
  const filteredWelfare = welfareData
    .filter((w) => regionMatches(w.title, w.source, w.region, userRegion))
    .map((w) => ({
      display: welfareToDisplay(w),
      ...scoreProgram(w.target, w.description, ageKw, occKw),
    }))
    .filter((x) => !requireOccMatch || x.occMatched);

  // 대출 테이블(LoanProgram) 에는 region 컬럼이 없으므로 null 전달.
  // regionMatches 가 제목 prefix / 본문 내 타지역 언급으로 판단하도록 폴백.
  const filteredLoan = loanData
    .filter((l) => regionMatches(l.title, l.source, null, userRegion))
    .map((l) => ({
      display: loanToDisplay(l),
      ...scoreProgram(l.target, l.description, ageKw, occKw),
    }))
    .filter((x) => !requireOccMatch || x.occMatched);

  const programs = [...filteredWelfare, ...filteredLoan]
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((x) => x.display);

  return NextResponse.json({ programs });
}
