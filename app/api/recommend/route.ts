import { NextRequest, NextResponse } from "next/server";
import { getRecommendations, PROGRAM_TYPES, type ProgramType } from "@/lib/recommend";
import { loadUserProfile } from "@/lib/personalization/load-profile";
import {
  AGE_KEYWORDS,
  OCCUPATION_KEYWORDS,
  REGION_OPTIONS,
  type AgeOption,
  type OccupationOption,
  type RegionOption,
} from "@/lib/profile-options";

// 맞춤추천 API — 실제 매칭 로직은 lib/recommend.ts 에 위치.
// 이 파일은 입력값 검증과 응답 변환만 담당 (서버 페이지와 로직 공유 목적).
export async function POST(request: NextRequest) {
  const {
    ageGroup,
    region,
    district,
    occupation,
    programType = "all",
  } = await request.json();

  // 입력값 검증
  if (!ageGroup || !region || !occupation) {
    return NextResponse.json({ error: "모든 항목을 선택해주세요." }, { status: 400 });
  }
  if (!(ageGroup in AGE_KEYWORDS)) {
    return NextResponse.json({ error: "올바른 나이대를 선택해주세요." }, { status: 400 });
  }
  if (!REGION_OPTIONS.includes(region)) {
    return NextResponse.json({ error: "올바른 지역을 선택해주세요." }, { status: 400 });
  }
  if (!(occupation in OCCUPATION_KEYWORDS)) {
    return NextResponse.json({ error: "올바른 직업을 선택해주세요." }, { status: 400 });
  }
  if (!PROGRAM_TYPES.includes(programType as ProgramType)) {
    return NextResponse.json({ error: "올바른 정보 종류를 선택해주세요." }, { status: 400 });
  }
  // district 는 optional. 임의 문자열 주입 막으려고 길이·형식만 가볍게 검증.
  // 더 엄격한 화이트리스트 검증은 폼 UI 가 광역에 맞는 옵션만 노출하므로
  // 서버는 길이만 체크하고 매칭 로직(regionMatches)에서 자연스럽게 무시됨.
  const safeDistrict =
    typeof district === "string" && district.length > 0 && district.length <= 20
      ? district
      : null;

  const fullProfile = await loadUserProfile();
  const programs = await getRecommendations({
    ageGroup: ageGroup as AgeOption,
    region: region as RegionOption,
    district: safeDistrict,
    occupation: occupation as OccupationOption,
    incomeLevel: fullProfile?.signals.incomeLevel ?? null,
    householdTypes: fullProfile?.signals.householdTypes ?? [],
    benefitTags: fullProfile?.signals.benefitTags ?? [],
    hasChildren: fullProfile?.signals.hasChildren ?? null,
    merit: fullProfile?.signals.merit ?? null,
    businessProfile: fullProfile?.signals.businessProfile ?? null,
    programType: programType as ProgramType,
  });

  return NextResponse.json({ programs });
}
