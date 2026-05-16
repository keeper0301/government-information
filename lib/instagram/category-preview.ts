// ============================================================
// 8 카테고리 시각 검증 — 각 카테고리 첫 발행 글 slug 가져오기
// ============================================================
// 사장님 5/17 contrast fix 검수 시 8 카테고리 카드 시각 변경 한 화면 확인.
// 카테고리별 가장 최근 발행 글 1건씩 → /api/instagram-card/{slug}/{1·2·3} PNG 미리보기 3장.
//
// 발행 글 없는 카테고리 (문화·큐레이션 등) 는 slug=null 로 fallback → UI 에서
// "발행 글 없음" 안내. graceful skip.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { CATEGORY_COLORS } from "@/lib/instagram/card-colors";

export type CategoryPreviewRow = {
  category: string;
  color: string;       // 카테고리 brand color (시각 톤 검증용)
  slug: string | null; // null = 발행 글 없음 (graceful skip)
  title: string | null;
  publishedAt: string | null;
};

// CATEGORY_COLORS keys 를 사장님 운영 우선순위 순서로 정렬.
// 청년 (가장 많은 글) → 큐레이션 (가장 적은 글) 패턴.
// 단위 test 가 CATEGORY_COLORS 와 동기화 검증 (Dead code 2 경로 차단).
export const CATEGORY_ORDER = [
  "청년",
  "소상공인",
  "주거",
  "육아·가족",
  "노년",
  "학생·교육",
  "문화",
  "큐레이션",
] as const;

export async function loadCategoryPreviewRows(): Promise<CategoryPreviewRow[]> {
  const admin = createAdminClient();

  // 8 카테고리 병렬 query — 각각 최신 발행 글 1건만.
  const rows = await Promise.all(
    CATEGORY_ORDER.map(async (category): Promise<CategoryPreviewRow> => {
      const color = CATEGORY_COLORS[category] ?? "#3182F6";
      try {
        const { data } = await admin
          .from("blog_posts")
          .select("slug, title, published_at")
          .eq("category", category)
          .not("published_at", "is", null)
          .order("published_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!data) {
          return { category, color, slug: null, title: null, publishedAt: null };
        }
        return {
          category,
          color,
          slug: data.slug,
          title: data.title,
          publishedAt: data.published_at,
        };
      } catch {
        // DB 에러 시 빈 row 반환 (전체 페이지 down 방지)
        return { category, color, slug: null, title: null, publishedAt: null };
      }
    }),
  );

  return rows;
}
