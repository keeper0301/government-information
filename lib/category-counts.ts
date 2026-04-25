// ============================================================
// 카테고리 칩 동적 노출용 헬퍼
// ============================================================
// /welfare, /loan, /news, /blog 4페이지가 공통으로 사용.
// 마이그 037 의 PostgreSQL 함수 4개를 supabase.rpc() 로 호출.
// 기존 (~10K~20K row fetch + 메모리 집계) → 14 rows 만 fetch (페이로드 600KB→1KB).
//
// BENEFIT_TAGS (lib/tags/taxonomy.ts) 14종 순서를 우선 사용해
// 사이트 전체 칩 정렬이 일관되도록 (welfare/loan/news 만 적용. blog 는 인구통계 축).
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { BENEFIT_TAGS } from "@/lib/tags/taxonomy";

export type CategoryCount = { category: string; n: number };

// RPC 가 BIGINT 로 반환 → 클라이언트는 string 으로 받음 (postgres BIGINT → JS string).
// Number() 로 안전 변환.
function fromRpc(rows: Array<{ category: string; n: number | string }> | null): CategoryCount[] {
  return (rows ?? []).map((r) => ({ category: r.category, n: Number(r.n) }));
}

// BENEFIT_TAGS 순서 우선 + 그 외(미상)는 뒤에
function reorderByTaxonomy(rows: CategoryCount[]): CategoryCount[] {
  const map = new Map(rows.map((r) => [r.category, r.n]));
  const ordered: CategoryCount[] = [];
  for (const tag of BENEFIT_TAGS) {
    const n = map.get(tag);
    if (n !== undefined) ordered.push({ category: tag, n });
  }
  for (const r of rows) {
    if (!(BENEFIT_TAGS as readonly string[]).includes(r.category)) ordered.push(r);
  }
  return ordered;
}

/** welfare/loan: 단일 category 컬럼. RPC 호출. */
export async function getProgramCategoryCounts(
  supabase: SupabaseClient,
  table: "welfare_programs" | "loan_programs",
): Promise<CategoryCount[]> {
  const rpcName =
    table === "welfare_programs" ? "welfare_category_counts" : "loan_category_counts";
  const { data } = await supabase.rpc(rpcName);
  return reorderByTaxonomy(fromRpc(data));
}

/** news_posts.benefit_tags 별 건수. press 제외. RPC 호출. */
export async function getNewsBenefitTagCounts(
  supabase: SupabaseClient,
): Promise<CategoryCount[]> {
  const { data } = await supabase.rpc("news_benefit_tag_counts");
  return reorderByTaxonomy(fromRpc(data));
}

/** blog_posts.category 별 건수. RPC 호출. blog 는 인구통계 축이라 count desc 만. */
export async function getBlogCategoryCounts(
  supabase: SupabaseClient,
): Promise<CategoryCount[]> {
  const { data } = await supabase.rpc("blog_category_counts");
  return fromRpc(data);
}
