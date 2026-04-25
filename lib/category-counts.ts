// ============================================================
// 카테고리 칩 동적 노출용 헬퍼
// ============================================================
// /welfare, /loan, /news, /blog 4페이지가 공통으로 사용.
// DB 의 distinct category 를 count 와 함께 반환 → 빈 카테고리는
// 자동 숨겨서 사장님이 "주거 클릭했는데 0건" 사고를 방지.
//
// BENEFIT_TAGS (lib/tags/taxonomy.ts) 14종 순서를 우선 사용해
// 사이트 전체 칩 정렬이 일관되도록.
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { BENEFIT_TAGS, type BenefitTag } from "@/lib/tags/taxonomy";

export type CategoryCount = { category: string; n: number };

/**
 * welfare/loan: 단일 category 컬럼.
 * welfare 는 활성 정책(apply_end >= today 또는 NULL)만 카운트.
 * loan 은 apply_end 컬럼이 없어 전체 카운트.
 */
export async function getProgramCategoryCounts(
  supabase: SupabaseClient,
  table: "welfare_programs" | "loan_programs",
): Promise<CategoryCount[]> {
  const today = new Date().toISOString().split("T")[0];
  let q = supabase.from(table).select("category");

  if (table === "welfare_programs") {
    q = q.or(`apply_end.gte.${today},apply_end.is.null`);
  }

  // PostgREST distinct+count 직접 안 됨 → 메모리 집계.
  // welfare 활성 ~10K, loan 1.5K → 한 번에 가져와도 부담 없음.
  const { data } = await q.limit(15000);
  if (!data) return [];

  const counts = new Map<string, number>();
  for (const row of data as Array<{ category: string }>) {
    if (!row.category) continue;
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }

  // BENEFIT_TAGS 순서 우선, 그 외(미상)는 뒤에. 빈 카테고리 자동 제외.
  const ordered: CategoryCount[] = [];
  for (const tag of BENEFIT_TAGS) {
    const n = counts.get(tag);
    if (n && n > 0) ordered.push({ category: tag, n });
  }
  for (const [category, n] of counts) {
    if (!(BENEFIT_TAGS as readonly string[]).includes(category)) {
      ordered.push({ category, n });
    }
  }
  return ordered;
}

/**
 * news_posts.benefit_tags (배열) 별 건수.
 * press 제외 (목록 비노출 정책).
 */
export async function getNewsBenefitTagCounts(
  supabase: SupabaseClient,
): Promise<CategoryCount[]> {
  const { data } = await supabase
    .from("news_posts")
    .select("benefit_tags")
    .neq("category", "press")
    .limit(20000);
  if (!data) return [];

  const counts = new Map<BenefitTag, number>();
  for (const row of data as Array<{ benefit_tags: string[] | null }>) {
    for (const t of row.benefit_tags ?? []) {
      counts.set(t as BenefitTag, (counts.get(t as BenefitTag) ?? 0) + 1);
    }
  }

  const ordered: CategoryCount[] = [];
  for (const tag of BENEFIT_TAGS) {
    const n = counts.get(tag);
    if (n && n > 0) ordered.push({ category: tag, n });
  }
  return ordered;
}

/**
 * blog_posts.category 별 건수. published_at NOT NULL 만.
 * blog 는 인구통계 축이라 BENEFIT_TAGS 순서 안 씀 → 건수 desc.
 */
export async function getBlogCategoryCounts(
  supabase: SupabaseClient,
): Promise<CategoryCount[]> {
  const { data } = await supabase
    .from("blog_posts")
    .select("category")
    .not("published_at", "is", null);
  if (!data) return [];

  const counts = new Map<string, number>();
  for (const row of data as Array<{ category: string | null }>) {
    if (!row.category) continue;
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([category, n]) => ({ category, n }))
    .sort((a, b) => b.n - a.n);
}
