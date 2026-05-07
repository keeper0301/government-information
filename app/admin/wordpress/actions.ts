"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { publishToWordPress } from "@/lib/wordpress/publisher";

async function requireAdminUserId(): Promise<void> {
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
 * 즉시 publishToWordPress 흐름을 한 번 돌려 wordpress_publish_log 에 결과 기록.
 *
 * 동일 글 재시도 가능하도록 wordpress_publish_log 의 기존 row 삭제 후 호출.
 */
export async function republishLatestBlogAction(): Promise<void> {
  await requireAdminUserId();

  const admin = createAdminClient();

  // 1) keepioo 최신 발행 글 1건 조회
  const { data: post, error: selectErr } = await admin
    .from("blog_posts")
    .select("id, slug, title, meta_description, content, tags, category")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (selectErr || !post) {
    throw new Error(`최신 글 조회 실패: ${selectErr?.message ?? "blog_posts 비어 있음"}`);
  }

  // 2) 기존 publish_log 행 제거 — 재시도 가능하도록
  await admin.from("wordpress_publish_log").delete().eq("blog_post_id", post.id);

  // 3) 워드프레스 재발행 시도
  await publishToWordPress(post.id, {
    slug: post.slug,
    title: post.title,
    meta_description: post.meta_description,
    content: post.content,
    tags: post.tags,
    category: post.category,
  });

  // 4) 페이지 새로고침으로 통계 카드 업데이트 반영
  revalidatePath("/admin/wordpress");
}
