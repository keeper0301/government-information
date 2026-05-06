// lib/personalization/home-recent.ts
// ============================================================
// 홈 화면 below-the-fold "최근 정책 소식 / 정책 블로그" 섹션 personalization.
// ============================================================
// 기존 app/page.tsx 의 두 섹션은 단순 published_at desc limit 3 fetch 라
// 사용자 입력 무시 ("엉터리 추천" 사고). 이 helper 가 pool 100 fetch + score
// 적용해 사용자 맞춤 3건 반환. 매칭 0건이면 fallback 최신 limit건.
// 빈 프로필·비로그인은 그대로 최신순.
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { type ScorableItem } from "./score";
import { scoreAndFilter } from "./filter";
import { isBlogCohortFit } from "./blog-cohort";
import { PERSONAL_SECTION_MIN_SCORE } from "./types";
import { PROVINCES } from "@/lib/regions";
import type { BlogCardData } from "@/components/blog-card";
import type { NewsCardData } from "@/components/news-card";
import type { LoadedProfile } from "./load-profile";

// blog 의 자체 분류 (청년/노년/학생·교육/소상공인) 가 BENEFIT_TAGS 와 라벨이 달라
// 사용자 benefit_tags 와 직접 매칭이 0건이던 문제 해결.
// 매핑 결정 근거 — 각 분류의 실질 수혜자 영역. app/blog/page.tsx 와 동일 정의.
const BLOG_CATEGORY_TO_BENEFIT_TAGS: Record<string, string[]> = {
  청년: ["취업", "주거"],
  노년: ["의료", "생계"],
  "학생·교육": ["교육"],
  소상공인: ["창업", "금융"],
};

const PROVINCE_FULL_NAMES = new Set<string>(PROVINCES.map((p) => p.name));

// blog/news minScore — production 페이지의 임계값과 일관 유지.
// blog 는 region/apply_end 신호 없어 점수 자체가 낮음 → 3 별도 유지.
// news 는 PERSONAL_SECTION_MIN_SCORE 로 통일 (welfare/loan/news 일관성).
const HOME_BLOG_MIN_SCORE = 3;
const HOME_NEWS_MIN_SCORE = PERSONAL_SECTION_MIN_SCORE;

const POOL_LIMIT = 100;

// blog_posts row 를 점수 계산 ScorableItem 으로 변환
// app/blog/page.tsx 의 blogToScorable 와 동일 — 옵션 D 에서 통합 정리 예정
// /recommend 페이지 (lib/recommend.ts) 도 import 해서 재사용
export function blogRowToScorable(p: {
  slug: string;
  title: string;
  meta_description: string | null;
  category: string | null;
  tags: string[] | null;
}): ScorableItem {
  const tagSet = new Set<string>();
  if (p.category) {
    const mapped = BLOG_CATEGORY_TO_BENEFIT_TAGS[p.category];
    if (mapped) {
      for (const tag of mapped) tagSet.add(tag);
    } else {
      tagSet.add(p.category);
    }
  }
  for (const t of p.tags ?? []) tagSet.add(t);
  return {
    id: p.slug,
    title: p.title,
    description: p.meta_description ?? "",
    region: null,
    district: null,
    benefit_tags: Array.from(tagSet),
    apply_end: null,
    source: null,
  };
}

// news_posts row 를 ScorableItem 으로 변환
// app/news/page.tsx 의 newsToScorable 와 동일 — ministry 가 광역 정식명일 때만 region
// description 은 summary + body 합쳐서 score.ts 의 키워드 매칭 정확도를
// app/news/page.tsx 와 동일 수준으로 유지 (페이지마다 점수 달라지지 않게)
export function newsRowToScorable(p: {
  id: string;
  title: string;
  summary: string | null;
  body: string | null;
  ministry: string | null;
  benefit_tags: string[] | null;
}): ScorableItem {
  const region =
    p.ministry && PROVINCE_FULL_NAMES.has(p.ministry) ? p.ministry : null;
  return {
    id: p.id,
    title: p.title,
    description: [p.summary, p.body].filter(Boolean).join(" "),
    region,
    district: null,
    benefit_tags: p.benefit_tags ?? [],
    apply_end: null,
    source: null,
  };
}

/**
 * 홈 화면 "정책 블로그" 섹션 — 사용자 맞춤 limit건 또는 최신 limit건.
 * profile null/isEmpty → 최신순.
 * profile 있음 + 매칭 0건 → 최신순 fallback (UX 일관성).
 */
export async function getPersonalizedRecentBlogs(
  profile: LoadedProfile | null,
  limit: number = 3,
): Promise<BlogCardData[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("blog_posts")
    .select(
      "slug, title, meta_description, category, tags, reading_time_min, published_at, cover_image",
    )
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(POOL_LIMIT);

  if (!data || data.length === 0) return [];
  const pool = data as (BlogCardData & { tags: string[] | null })[];

  // 빈 프로필 또는 비로그인 → 그대로 최신순
  if (!profile || profile.isEmpty) {
    return pool.slice(0, limit);
  }

  // cohort 부적합 글 1차 필터 (30대 자영업자에 청년·학생 글 노출 사고 방지)
  const cohortFiltered = pool.filter((p) =>
    isBlogCohortFit(
      {
        category: p.category,
        title: p.title,
        meta_description: p.meta_description,
        tags: p.tags,
      },
      profile.signals,
    ),
  );

  const scorablePool = cohortFiltered.map(blogRowToScorable);
  const scored = scoreAndFilter(scorablePool, profile.signals, {
    minScore: HOME_BLOG_MIN_SCORE,
    limit,
  });

  if (scored.length === 0) return pool.slice(0, limit);

  const slugSet = new Set(scored.map((s) => s.item.id));
  return pool.filter((p) => slugSet.has(p.slug)).slice(0, limit);
}

/**
 * 홈 화면 "최근 정책 소식" 섹션 — 사용자 맞춤 limit건 또는 최신 limit건.
 * news_posts_deduped view 사용 — app/news/page.tsx 와 일관성 유지
 * (같은 행사 다른 출처가 3건 모두 채울 가능성 차단)
 */
export async function getPersonalizedRecentNews(
  profile: LoadedProfile | null,
  limit: number = 3,
): Promise<NewsCardData[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("news_posts_deduped" as "news_posts")
    .select(
      "id, slug, title, summary, body, category, ministry, source_outlet, thumbnail_url, benefit_tags, published_at",
    )
    .order("published_at", { ascending: false })
    .limit(POOL_LIMIT);

  if (!data || data.length === 0) return [];
  const pool = data as (NewsCardData & {
    id: string;
    body: string | null;
    benefit_tags: string[] | null;
  })[];

  // 빈 프로필 또는 비로그인 → 최신순
  if (!profile || profile.isEmpty) {
    return pool.slice(0, limit);
  }

  const scorablePool = pool.map(newsRowToScorable);
  const scored = scoreAndFilter(scorablePool, profile.signals, {
    minScore: HOME_NEWS_MIN_SCORE,
    limit,
  });

  if (scored.length === 0) return pool.slice(0, limit);

  const idSet = new Set(scored.map((s) => s.item.id));
  return pool.filter((p) => idSet.has(p.id)).slice(0, limit);
}
