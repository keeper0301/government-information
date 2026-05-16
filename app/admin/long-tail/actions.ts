// /admin/long-tail server action — 키워드 입력 → publishKeywordPost 호출 → blog_posts insert.
// admin 가드 + audit 로그.

"use server";

import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { publishKeywordPost } from "@/lib/blog-publish";
import { logAdminAction, type AdminActionType } from "@/lib/admin-actions";

interface SubmitInput {
  keyword: string;
  category?: string;
}

export async function submitLongTailKeyword(
  input: SubmitInput,
): Promise<{
  ok: boolean;
  error?: string;
  slug?: string;
  title?: string;
  externalPublishHeld?: boolean;
  qualityReviewScore?: number | null;
}> {
  const keyword = (input.keyword ?? "").trim();
  if (keyword.length < 2 || keyword.length > 80) {
    return { ok: false, error: "키워드는 2~80자 사이여야 합니다." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  if (!isAdminUser(user.email)) return { ok: false, error: "forbidden" };

  try {
    const result = await publishKeywordPost({
      keyword,
      category: input.category,
    });

    // audit log — 사장님 행동 추적
    try {
      await logAdminAction({
        actorId: user.id,
        action: "blog_publish",
        details: {
          source: "long_tail",
          keyword,
          category: result.generated.category,
          slug: result.slug,
          title: result.generated.title,
          qualityReviewScore: result.qualityReview?.score ?? null,
          externalPublishHeld: result.externalPublishHeld,
        },
      });
      await logAdminAction({
        actorId: user.id,
        action: "long_tail_seo_run" as AdminActionType,
        details: {
          keyword,
          category: result.generated.category,
          slug: result.slug,
          title: result.generated.title,
          qualityReviewScore: result.qualityReview?.score ?? null,
          externalPublishHeld: result.externalPublishHeld,
        },
      });
    } catch {
      // audit 실패는 발행 자체 실패 아님
    }

    return {
      ok: true,
      slug: result.slug,
      title: result.generated.title,
      externalPublishHeld: result.externalPublishHeld,
      qualityReviewScore: result.qualityReview?.score ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message.slice(0, 300),
    };
  }
}
