// 통합 검색 헬퍼 — /api/search (자동완성) 와 /search (결과 페이지) 가 공유.
// 한국어 검색을 위해 검색어를 공백으로 토큰 분리 후 각 토큰마다
// (필드 OR 매칭) AND 결합. 이유: ILIKE 정확 문자열 매칭이라 "창업 지원금"
// → 0건 같은 띄어쓰기 누락 발생. 토큰 AND 로 매칭 정확도 5~175배 향상.

import { createClient } from "@/lib/supabase/server";
import {
  welfareToDisplay,
  loanToDisplay,
  type DisplayProgram,
} from "@/lib/programs";
import {
  WELFARE_EXCLUDED_FILTER,
  LOAN_EXCLUDED_FILTER,
} from "@/lib/listing-sources";

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
  welfareTotal: number; // 매칭되는 전체 건수 (limit 무관)
  loan: DisplayProgram[];
  loanTotal: number;
  news: NewsHit[];
  newsTotal: number;
  blog: BlogHit[];
  blogTotal: number;
  total: number; // 4영역 전체 합계
};

// 영역 필터 — 사용자가 특정 영역만 보고 싶을 때 (?type=welfare,loan 등).
// 빠진 영역은 query 자체를 skip + 빈 결과 + 카운트 0 반환 → DB 부담 ↓.
export const SEARCH_TYPES = ["welfare", "loan", "news", "blog"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

// 정렬 옵션 — 복지/대출 정책에만 적용. 뉴스·블로그는 최신순 고정.
//   popular  : view_count 내림차순 (default — 인기 정책 우선)
//   latest   : created_at 내림차순 (DB 인서트 시각, 최근 등록 정책 우선)
//   deadline : apply_end 오름차순 nulls last (마감 임박 우선, NULL 은 끝으로)
export const SEARCH_SORTS = ["popular", "latest", "deadline"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

const EMPTY: SearchResults = {
  welfare: [],
  welfareTotal: 0,
  loan: [],
  loanTotal: 0,
  news: [],
  newsTotal: 0,
  blog: [],
  blogTotal: 0,
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
// includeCount=true 면 영역별 전체 매칭 건수도 반환 (limit 무관).
// 자동완성은 includeCount 생략(false) → 빠르게.
//
// types 옵션 — 빠진 영역은 query 자체를 skip (빈 결과 + count 0).
// sort 옵션 — 복지/대출 정책에만 적용 (뉴스·블로그는 최신순 고정).
export async function searchAll(
  q: string,
  options: {
    welfareLimit?: number;
    loanLimit?: number;
    newsLimit?: number;
    blogLimit?: number;
    includeCount?: boolean;
    types?: readonly SearchType[];
    sort?: SearchSort;
  } = {},
): Promise<SearchResults> {
  if (!q || q.trim().length < 2) return EMPTY;

  const tokens = tokenize(q);
  if (tokens.length === 0) return EMPTY;

  const {
    welfareLimit = 10,
    loanLimit = 10,
    newsLimit = 8,
    blogLimit = 5,
    includeCount = false,
    types,
    sort = "popular",
  } = options;

  // types 미지정 → 전체. 지정 → 화이트리스트 교집합 (잘못된 값 무시).
  const activeTypes = new Set<SearchType>(
    types ? types.filter((t) => SEARCH_TYPES.includes(t)) : SEARCH_TYPES,
  );
  // 모든 영역이 비활성이면 빈 결과 (잘못된 type 만 들어온 경우 방어)
  if (activeTypes.size === 0) return EMPTY;

  const supabase = await createClient();

  // count 옵션 — 'exact' 면 정확 COUNT(*) 실행 (limit 무관 전체 카운트).
  // 자동완성처럼 빠른 응답 필요한 경우엔 includeCount=false 로 카운트 생략.
  const countOption = includeCount ? { count: "exact" as const } : {};

  // 활성 영역만 query 작성. 비활성 영역은 EMPTY 결과로 즉시 fallback.
  // EXCLUDED listing source 는 검색 결과에서도 사전 차단 (stale 정책 빈 카드 방지)
  let welfareQ = activeTypes.has("welfare")
    ? supabase
        .from("welfare_programs")
        .select("*", countOption)
        .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
    : null;
  let loanQ = activeTypes.has("loan")
    ? supabase
        .from("loan_programs")
        .select("*", countOption)
        .not("source_code", "in", LOAN_EXCLUDED_FILTER)
    : null;
  let newsQ = activeTypes.has("news")
    ? supabase
        .from("news_posts")
        .select(
          "slug, title, summary, category, ministry, thumbnail_url, published_at",
          countOption,
        )
        // press 카테고리 제외 — 사이트 정책 (수집·노출 중단)
        .neq("category", "press")
    : null;
  let blogQ = activeTypes.has("blog")
    ? supabase
        .from("blog_posts")
        .select(
          "slug, title, meta_description, category, published_at, cover_image, reading_time_min",
          countOption,
        )
        .not("published_at", "is", null)
    : null;

  for (const t of tokens) {
    if (welfareQ)
      welfareQ = welfareQ.or(
        `title.ilike.%${t}%,description.ilike.%${t}%,category.ilike.%${t}%`,
      );
    if (loanQ)
      loanQ = loanQ.or(
        `title.ilike.%${t}%,description.ilike.%${t}%,category.ilike.%${t}%`,
      );
    if (newsQ) newsQ = newsQ.or(`title.ilike.%${t}%,summary.ilike.%${t}%`);
    if (blogQ)
      blogQ = blogQ.or(`title.ilike.%${t}%,meta_description.ilike.%${t}%`);
  }

  // 복지·대출 공통 정렬 — sort 분기. 뉴스·블로그는 최신순 고정.
  // deadline 은 nullsFirst:false 로 NULL 마감일 (상시 모집 등) 을 뒤로.
  const applyProgramSort = <T extends NonNullable<typeof welfareQ>>(qb: T): T => {
    if (sort === "latest") {
      return qb.order("created_at", { ascending: false }) as T;
    }
    if (sort === "deadline") {
      return qb.order("apply_end", { ascending: true, nullsFirst: false }) as T;
    }
    return qb.order("view_count", { ascending: false }) as T;
  };

  const [welfareRes, loanRes, newsRes, blogRes] = await Promise.all([
    welfareQ
      ? applyProgramSort(welfareQ).limit(welfareLimit)
      : Promise.resolve({ data: [], count: 0 } as const),
    loanQ
      ? applyProgramSort(loanQ).limit(loanLimit)
      : Promise.resolve({ data: [], count: 0 } as const),
    newsQ
      ? newsQ.order("published_at", { ascending: false }).limit(newsLimit)
      : Promise.resolve({ data: [], count: 0 } as const),
    blogQ
      ? blogQ.order("published_at", { ascending: false }).limit(blogLimit)
      : Promise.resolve({ data: [], count: 0 } as const),
  ]);

  const welfareDisplay = (welfareRes.data || []).map(welfareToDisplay);
  const loanDisplay = (loanRes.data || []).map(loanToDisplay);
  const newsList = (newsRes.data || []) as NewsHit[];
  const blogList = (blogRes.data || []) as BlogHit[];

  // includeCount=false 면 count 가 null/undefined → 표시용 0 으로 fallback.
  // 표시 측에서 includeCount 와 함께 계산되므로 0 이어도 사용자에게 잘못 안 보임.
  const wTotal = welfareRes.count ?? welfareDisplay.length;
  const lTotal = loanRes.count ?? loanDisplay.length;
  const nTotal = newsRes.count ?? newsList.length;
  const bTotal = blogRes.count ?? blogList.length;

  return {
    welfare: welfareDisplay,
    welfareTotal: wTotal,
    loan: loanDisplay,
    loanTotal: lTotal,
    news: newsList,
    newsTotal: nTotal,
    blog: blogList,
    blogTotal: bTotal,
    total: wTotal + lTotal + nTotal + bTotal,
  };
}
