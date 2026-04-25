// ============================================================
// /api/search — 통합 검색 API
// ============================================================
// SearchBox 자동완성용 (results 평탄 배열, BC) +
// 통합 검색 결과 페이지용 (welfare/loan/news/blog 영역별 그룹).
//
// BC 정책: 기존 호출처(components/search-box.tsx) 가
// `data.results?.slice(0, 5)` 형태로 평탄 배열을 사용 → results 키 유지.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { welfareToDisplay, loanToDisplay } from "@/lib/programs";

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

  const supabase = await createClient();
  const sanitized = q.trim().replace(/[%_\\]/g, "\\$&");

  const [
    { data: welfare },
    { data: loans },
    { data: news },
    { data: blogs },
  ] = await Promise.all([
    supabase
      .from("welfare_programs")
      .select("*")
      .or(
        `title.ilike.%${sanitized}%,description.ilike.%${sanitized}%,category.ilike.%${sanitized}%`,
      )
      .order("view_count", { ascending: false })
      .limit(10),
    supabase
      .from("loan_programs")
      .select("*")
      .or(
        `title.ilike.%${sanitized}%,description.ilike.%${sanitized}%,category.ilike.%${sanitized}%`,
      )
      .order("view_count", { ascending: false })
      .limit(10),
    // press 제외 — 사이트 정책
    supabase
      .from("news_posts")
      .select("slug, title, summary, category, ministry, thumbnail_url, published_at")
      .neq("category", "press")
      .or(`title.ilike.%${sanitized}%,summary.ilike.%${sanitized}%`)
      .order("published_at", { ascending: false })
      .limit(8),
    supabase
      .from("blog_posts")
      .select(
        "slug, title, meta_description, category, published_at, cover_image, reading_time_min",
      )
      .not("published_at", "is", null)
      .or(`title.ilike.%${sanitized}%,meta_description.ilike.%${sanitized}%`)
      .order("published_at", { ascending: false })
      .limit(5),
  ]);

  const welfareDisplay = (welfare || []).map(welfareToDisplay);
  const loanDisplay = (loans || []).map(loanToDisplay);
  const newsList = news || [];
  const blogList = blogs || [];

  // BC: 기존 SearchBox 가 results 평탄 배열을 기대 → welfare+loan 만 유지.
  // 향후 "통합 검색 결과 페이지" 구축 시 welfare/loan/news/blog 영역별 키 사용.
  const results = [...welfareDisplay, ...loanDisplay];

  return NextResponse.json({
    results,
    welfare: welfareDisplay,
    loan: loanDisplay,
    news: newsList,
    blog: blogList,
    total:
      welfareDisplay.length +
      loanDisplay.length +
      newsList.length +
      blogList.length,
  });
}
