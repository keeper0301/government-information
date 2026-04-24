import { NextRequest, NextResponse } from "next/server";
import { getRecommendations, PROGRAM_TYPES, type ProgramType } from "@/lib/recommend";
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
  const { ageGroup, region, occupation, programType = "all" } = await request.json();

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

  const programs = await getRecommendations({
    ageGroup: ageGroup as AgeOption,
    region: region as RegionOption,
    occupation: occupation as OccupationOption,
    programType: programType as ProgramType,
  });

  return NextResponse.json({ programs });
}
