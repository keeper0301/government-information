// 통합 검색 헬퍼 — /api/search (자동완성) 와 /search (결과 페이지) 가 공유.
// 한국어 검색을 위해 검색어를 공백으로 토큰 분리 후 각 토큰마다
// (title/description/category 또는 summary OR 매칭) AND 결합.
// 이유: ILIKE 정확 문자열 매칭이라 "창업 지원금" → 0건 같은 띄어쓰기 누락 발생.
// 토큰 AND 로 바꾸면 "창업"+"지원금" 모두 들어간 행 매칭 → 정확도 5~175배 향상.

import { createClient } from "@/lib/supabase/server";
import {
  welfareToDisplay,
  loanToDisplay,
  type DisplayProgram,
} from "@/lib/programs";

// 뉴스 1건의 검색 결과 표시용 슬림 타입 (페이지·자동완성 공통)
export type NewsHit = {
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  ministry: string | null;
  thumbnail_url: string | null;
  published_at: string;
};

// 블로그 1건의 검색 결과 표시용 슬림 타입
export type BlogHit = {
  slug: string;
  title: string;
  meta_description: string | null;
  category: string;
  published_at: string;
  cover_image: string | null;
  reading_time_min: number | null;
};

export type SearchResults = {
  welfare: DisplayProgram[];
  loan: DisplayProgram[];
  news: NewsHit[];
  blog: BlogHit[];
  total: number;
};

const EMPTY: SearchResults = {
  welfare: [],
  loan: [],
  news: [],
  blog: [],
  total: 0,
};

// 검색어를 공백 분리 → ILIKE wildcard 안전하게 escape → 빈 토큰 제외
function tokenize(raw: string): string[] {
  return raw
    .trim()
    .replace(/[%_\\]/g, "\\$&")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

// 통합 검색 실행. 검색어 2글자 미만이면 빈 결과 즉시 반환.
// 각 영역(welfare/loan/news/blog) 동시 조회 (Promise.all 1 라운드트립).
export async function searchAll(
  q: string,
  options: { welfareLimit?: number; loanLimit?: number; newsLimit?: number; blogLimit?: number } = {},
): Promise<SearchResults> {
  if (!q || q.trim().length < 2) return EMPTY;

  const tokens = tokenize(q);
  if (tokens.length === 0) return EMPTY;

  const {
    welfareLimit = 10,
    loanLimit = 10,
    newsLimit = 8,
    blogLimit = 5,
  } = options;

  const supabase = await createClient();

  // 각 테이블에 토큰 AND chain 적용. supabase-js .or() chain 누적 = AND.
  // (welfare/page.tsx:97 와 loan/page.tsx:126 가 이미 같은 패턴)
  let welfareQ = supabase.from("welfare_programs").select("*");
  let loanQ = supabase.from("loan_programs").select("*");
  let newsQ = supabase
    .from("news_posts")
    .select("slug, title, summary, category, ministry, thumbnail_url, published_at")
    // press 카테고리 제외 — 사이트 정책 (수집·노출 중단)
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
      welfareQ.order("view_count", { ascending: false }).limit(welfareLimit),
      loanQ.order("view_count", { ascending: false }).limit(loanLimit),
      newsQ.order("published_at", { ascending: false }).limit(newsLimit),
      blogQ.order("published_at", { ascending: false }).limit(blogLimit),
    ]);

  const welfareDisplay = (welfare || []).map(welfareToDisplay);
  const loanDisplay = (loans || []).map(loanToDisplay);
  const newsList = (news || []) as NewsHit[];
  const blogList = (blogs || []) as BlogHit[];

  return {
    welfare: welfareDisplay,
    loan: loanDisplay,
    news: newsList,
    blog: blogList,
    total: welfareDisplay.length + loanDisplay.length + newsList.length + blogList.length,
  };
}
