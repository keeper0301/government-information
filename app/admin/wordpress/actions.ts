"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { publishToWordPress, type PublishResult } from "@/lib/wordpress/publisher";

export type RepublishState =
  | { kind: "idle" }
  | { kind: "ok"; message: string; wpPostUrl: string; wpPostId: number; blogTitle: string }
  | { kind: "fail"; message: string; reason: string };

async function ensureAdmin(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) {
    throw new Error("권한 없음");
  }
}

/**
 * 검증용 — keepioo 최신 발행 블로그 글 1건을 워드프레스에 즉시 재발행 시도.
 *
 * 환경변수 (WP_API_URL 등) 등록 직후 가동 검증에 사용. 자동 cron 을 기다리지 않고
 * 즉시 publishToWordPress 흐름을 한 번 돌려 결과를 화면에 명시적으로 표시.
 *
 * useActionState signature: (prevState, formData) => Promise<RepublishState>
 */
export async function republishLatestBlogAction(
  _prevState: RepublishState,
  _formData: FormData,
): Promise<RepublishState> {
  try {
    await ensureAdmin();
  } catch {
    return {
      kind: "fail",
      message: "권한 없음 — 다시 로그인하신 후 시도해주세요.",
      reason: "unauthorized",
    };
  }

  const admin = createAdminClient();

  // 1) 최신 발행 글 1건
  const { data: post, error: selectErr } = await admin
    .from("blog_posts")
    .select("id, slug, title, meta_description, content, tags, category")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (selectErr || !post) {
    return {
      kind: "fail",
      message: `keepioo 블로그 글 조회 실패: ${selectErr?.message ?? "blog_posts 비어 있음"}`,
      reason: "db_select_error",
    };
  }

  // 2) 기존 publish_log 행 제거 — 재시도 가능하도록
  await admin.from("wordpress_publish_log").delete().eq("blog_post_id", post.id);

  // 3) 워드프레스 재발행 시도
  const result: PublishResult = await publishToWordPress(post.id, {
    slug: post.slug,
    title: post.title,
    meta_description: post.meta_description,
    content: post.content,
    tags: post.tags,
    category: post.category,
  });

  // 4) 페이지 새로고침으로 통계 카드 업데이트 반영
  revalidatePath("/admin/wordpress");

  if (result.ok) {
    return {
      kind: "ok",
      message: `워드프레스 발행 성공! "${post.title}" → 워드프레스 글 ID ${result.wpPostId}`,
      wpPostUrl: result.wpPostUrl,
      wpPostId: result.wpPostId,
      blogTitle: post.title,
    };
  }

  // 실패 메시지 — reason 별 사용자 친화 안내
  const userMessage = formatFailMessage(result);
  return {
    kind: "fail",
    message: userMessage,
    reason: result.reason,
  };
}

function formatFailMessage(result: Extract<PublishResult, { ok: false }>): string {
  switch (result.reason) {
    case "skipped_no_credentials":
      return "환경변수 미설정 — Vercel Dashboard 에서 WP_API_URL/WP_USERNAME/WP_APP_PASSWORD 확인하세요.";
    case "skipped_invalid_url":
      return `WP_API_URL 형식 오류: ${result.error}. 예: https://yoursite.wordpress.com/wp-json/wp/v2`;
    case "timeout":
      return `워드프레스 응답이 ${result.error} 안에 안 옴 — 사이트 다운 가능성. https://wordpress.com 직접 확인.`;
    case "network_error":
      return `네트워크 오류: ${result.error}`;
    case "api_error":
      return `워드프레스 API 거부: ${result.error}. 401 이면 사용자명/Application Password 재발급, 404 면 WP_API_URL 끝이 /wp-json/wp/v2 인지 확인.`;
    default:
      return `발행 실패: ${JSON.stringify(result)}`;
  }
}
