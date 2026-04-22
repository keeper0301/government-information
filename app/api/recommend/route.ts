import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { welfareToDisplay, loanToDisplay } from "@/lib/programs";
import type { WelfareProgram, LoanProgram } from "@/lib/database.types";

// 나이대를 target 검색 키워드로 매핑
const ageKeywords: Record<string, string[]> = {
  "10대": ["청소년", "학생"],
  "20대": ["청년", "대학생"],
  "30대": ["청년", "신혼"],
  "40대": ["중장년"],
  "50대": ["중장년", "중년"],
  "60대 이상": ["노인", "어르신", "고령"],
};

// 직업을 target 검색 키워드로 매핑
const occupationKeywords: Record<string, string[]> = {
  "대학생": ["대학생", "학생", "청년"],
  "직장인": ["근로자", "직장인"],
  "자영업자": ["소상공인", "자영업", "사업자"],
  "구직자": ["구직", "실업", "취업"],
  "주부": ["가정", "양육", "출산"],
  "기타": [],
};

// 허용된 지역 목록
const VALID_REGIONS = [
  "전국", "서울", "경기", "인천", "부산", "대구", "광주",
  "대전", "울산", "세종", "강원", "충북", "충남",
  "전북", "전남", "경북", "경남", "제주",
];

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
