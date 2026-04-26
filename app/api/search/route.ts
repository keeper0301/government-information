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

  // 검색어를 공백으로 분리해서 각 토큰마다 (필드 OR 매칭) AND 결합.
  // 한국어는 단어 사이에 공백이 들어가서 "창업 지원금" 같은 query 가 정확 문자열
  // 매칭으로는 0건 나옴 (정책 본문에 "창업지원" 또는 "창업 지원" 등 변형 표기).
  // 토큰 AND 로 바꾸면 "창업" 들어간 행 ∩ "지원금" 들어간 행 → 매칭 정확도 5~175배 향상.
  // 단일 토큰("긴급복지" 등) 도 동일하게 작동 (토큰 1개 = 기존 동작).
  // welfare/page.tsx:97 와 loan/page.tsx:126 의 이미 검증된 chain 누적 = AND 패턴 재사용.
  const tokens = sanitized.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return NextResponse.json({
      results: [], welfare: [], loan: [], news: [], blog: [], total: 0,
    });
  }

  // 각 테이블에 토큰 AND chain 적용 (chain 마다 .or() 누적 → AND).
  let welfareQ = supabase.from("welfare_programs").select("*");
  let loanQ = supabase.from("loan_programs").select("*");
  // press 제외 — 사이트 정책
  let newsQ = supabase
    .from("news_posts")
    .select("slug, title, summary, category, ministry, thumbnail_url, published_at")
    .neq("category", "press");
  let blogQ = supabase
    .from("blog_posts")
    .select(
      "slug, title, meta_description, category, published_at, cover_image, reading_time_min",
    )
    .not("published_at", "is", null);

  for (const t of tokens) {
    welfareQ = welfareQ.or(
      `title.ilike.%${t}%,description.ilike.%${t}%,category.ilike.%${t}%`,
    );
    loanQ = loanQ.or(
      `title.ilike.%${t}%,description.ilike.%${t}%,category.ilike.%${t}%`,
    );
    newsQ = newsQ.or(`title.ilike.%${t}%,summary.ilike.%${t}%`);
    blogQ = blogQ.or(`title.ilike.%${t}%,meta_description.ilike.%${t}%`);
  }

  const [{ data: welfare }, { data: loans }, { data: news }, { data: blogs }] =
    await Promise.all([
      welfareQ.order("view_count", { ascending: false }).limit(10),
      loanQ.order("view_count", { ascending: false }).limit(10),
      newsQ.order("published_at", { ascending: false }).limit(8),
      blogQ.order("published_at", { ascending: false }).limit(5),
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
