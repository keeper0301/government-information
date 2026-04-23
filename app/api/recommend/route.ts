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
} from "@/lib/profile-options";

// lib/profile-options 에서 import. /mypage 와 /recommend 폼과 동일 vocabulary 사용.
const ageKeywords = AGE_KEYWORDS;
const occupationKeywords = OCCUPATION_KEYWORDS;
const VALID_REGIONS = REGION_OPTIONS;

// programType: "all" (기본) / "welfare" (복지만) / "loan" (대출만)
const VALID_PROGRAM_TYPES = ["all", "welfare", "loan"] as const;
type ProgramType = (typeof VALID_PROGRAM_TYPES)[number];

export async function POST(request: NextRequest) {
  const { ageGroup, region, occupation, programType = "all" } = await request.json();

  // 입력값 검증: 허용된 값인지 확인
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

  // 검색 키워드 목록 생성
  const keywords = [
    ...(ageKeywords[ageGroup] || []),
    ...(occupationKeywords[occupation] || []),
  ];

  // 조회할 종류 결정: 전체(all) 면 둘 다, 아니면 하나만
  const includeWelfare = programType === "all" || programType === "welfare";
  const includeLoan = programType === "all" || programType === "loan";

  // 복지 프로그램 조회 (includeWelfare=true 일 때만)
  let welfareData: WelfareProgram[] = [];
  if (includeWelfare) {
    let welfareQuery = supabase
      .from("welfare_programs")
      .select("*")
      .or(`apply_end.gte.${today},apply_end.is.null`)
      .order("view_count", { ascending: false })
      .limit(100);

    if (region && region !== "전국") {
      welfareQuery = welfareQuery.or(`region.eq.${region},region.eq.전국,region.is.null`);
    }
    const { data } = await welfareQuery;
    welfareData = data || [];
  }

  // 대출 프로그램 조회 (includeLoan=true 일 때만)
  let loanData: LoanProgram[] = [];
  if (includeLoan) {
    const { data } = await supabase
      .from("loan_programs")
      .select("*")
      .or(`apply_end.gte.${today},apply_end.is.null`)
      .order("view_count", { ascending: false })
      .limit(100);
    loanData = data || [];
  }

  // 키워드 매칭 점수 계산
  const scoredWelfare = welfareData.map((w) => {
    let score = 0;
    const target = (w.target || "").toLowerCase();
    const desc = (w.description || "").toLowerCase();
    for (const kw of keywords) {
      if (target.includes(kw) || desc.includes(kw)) score += 1;
    }
    return { program: welfareToDisplay(w), score };
  });

  const scoredLoan = loanData.map((l) => {
    let score = 0;
    const target = (l.target || "").toLowerCase();
    const desc = (l.description || "").toLowerCase();
    for (const kw of keywords) {
      if (target.includes(kw) || desc.includes(kw)) score += 1;
    }
    return { program: loanToDisplay(l), score };
  });

  // 점수 높은 순 정렬 후 합치기
  const all = [...scoredWelfare, ...scoredLoan]
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((item) => item.program);

  return NextResponse.json({ programs: all });
}
