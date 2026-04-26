// /api/search — 자동완성 + 통합 검색 결과 페이지 공용 API
// 실제 검색 로직은 lib/search.ts 의 searchAll() 가 담당. 이 라우트는
// HTTP 응답 포맷 + BC(역호환) 만 책임. SearchBox(자동완성) 가 평탄 results 배열을
// 사용하므로 BC 키 유지.
import { NextRequest, NextResponse } from "next/server";
import { searchAll } from "@/lib/search";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");

  if (!q || q.trim().length < 2) {
    return NextResponse.json(
      {
        results: [],
        welfare: [],
        loan: [],
        news: [],
        blog: [],
        total: 0,
        error: "검색어는 2글자 이상 입력해주세요.",
      },
      { status: 400 },
    );
  }

  const data = await searchAll(q);

  // BC: SearchBox 가 results 평탄 배열을 기대 → welfare+loan 합산.
  const results = [...data.welfare, ...data.loan];

  return NextResponse.json({
    results,
    welfare: data.welfare,
    loan: data.loan,
    news: data.news,
    blog: data.blog,
    total: data.total,
  });
}
