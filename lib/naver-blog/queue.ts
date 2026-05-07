// ============================================================
// 네이버 블로그 발행 큐 — DB 인터페이스
// ============================================================
// 흐름:
//   - blog-publish.ts insert 직후 enqueue() 자동 호출
//   - /admin/naver-blog 가 listPendingNaverQueue() 로 화면 표시
//   - 사장님이 발행 후 markPublished() 또는 markSkipped()
//
// service_role 만 접근 — RLS 켜져 있고 정책 미정의 (069 와 동일 패턴).
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import {
  convertToNaverBlog,
  type BlogPostForNaver,
  type NaverBlogPayload,
} from "./format";

export type NaverQueueStatus = "pending" | "published" | "skipped";

export type NaverQueueRow = {
  id: string;
  blog_post_id: string;
  status: NaverQueueStatus;
  naver_url: string | null;
  published_at: string | null;
  skipped_at: string | null;
  skip_reason: string | null;
  created_at: string;
  blog_post: BlogPostForNaver;
};

export type NaverQueueRowWithPayload = NaverQueueRow & {
  /** 네이버 글쓰기 페이지에 그대로 붙여넣는 변환 결과 (제목·본문) */
  payload: NaverBlogPayload;
};

/**
 * blog_posts insert 직후 호출 — 같은 글 두 번 큐에 들어가는 것은 UNIQUE 제약이 막음.
 * publish 흐름의 핵심 경로 영향 0 — 큐 enqueue 실패해도 블로그 발행 자체는 성공해야 함.
 * 따라서 호출자가 try/catch 로 감싸 실패해도 무시 (로그만).
 */
export async function enqueueNaverBlog(blogPostId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("naver_blog_queue")
    .insert({ blog_post_id: blogPostId, status: "pending" });
  if (error) {
    // UNIQUE 위반 (이미 큐에 있음) 은 정상 — 무시
    if (error.code === "23505") return;
    throw new Error(`네이버 큐 enqueue 실패: ${error.message}`);
  }
}

/**
 * 어드민 페이지 — pending 항목을 새로운 순서로 N건 조회.
 * 각 항목은 변환된 payload (제목·본문) 까지 함께 반환 → UI 가 즉시 복사 가능.
 */
export async function listPendingNaverQueue(
  limit = 20,
): Promise<NaverQueueRowWithPayload[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("naver_blog_queue")
    .select(
      "id, blog_post_id, status, naver_url, published_at, skipped_at, skip_reason, created_at, blog_post:blog_posts!inner(slug, title, content, meta_description, category)",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`네이버 큐 조회 실패: ${error.message}`);
  }
  const rows = (data ?? []) as unknown as NaverQueueRow[];
  return rows.map((row) => ({
    ...row,
    payload: convertToNaverBlog(row.blog_post),
  }));
}

/**
 * 어드민 페이지 — 최근 발행 이력 (사장님 통계 가시성).
 */
export async function listPublishedNaverQueue(
  limit = 20,
): Promise<NaverQueueRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("naver_blog_queue")
    .select(
      "id, blog_post_id, status, naver_url, published_at, skipped_at, skip_reason, created_at, blog_post:blog_posts!inner(slug, title, content, meta_description, category)",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`네이버 발행 이력 조회 실패: ${error.message}`);
  }
  return (data ?? []) as unknown as NaverQueueRow[];
}

export async function markNaverPublished(
  queueId: string,
  actorId: string,
  naverUrl: string | null,
): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("naver_blog_queue")
    .update({
      status: "published",
      published_at: now,
      published_by: actorId,
      naver_url: naverUrl,
      updated_at: now,
    })
    .eq("id", queueId)
    .eq("status", "pending");
  if (error) {
    throw new Error(`네이버 발행 완료 처리 실패: ${error.message}`);
  }
}

export async function markNaverSkipped(
  queueId: string,
  actorId: string,
  reason: string | null,
): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("naver_blog_queue")
    .update({
      status: "skipped",
      skipped_at: now,
      skipped_by: actorId,
      skip_reason: reason,
      updated_at: now,
    })
    .eq("id", queueId)
    .eq("status", "pending");
  if (error) {
    throw new Error(`네이버 큐 스킵 처리 실패: ${error.message}`);
  }
}

/**
 * 어드민 통계 카드용 — 24h / 7d / 30d 발행 건수.
 * 사장님이 마케팅 활동 가시성 확보.
 */
export async function getNaverPublishedStats(): Promise<{
  pending: number;
  published24h: number;
  published7d: number;
  published30d: number;
}> {
  const admin = createAdminClient();
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [pending, p24, p7, p30] = await Promise.all([
    admin
      .from("naver_blog_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("naver_blog_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .gte("published_at", since24h),
    admin
      .from("naver_blog_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .gte("published_at", since7d),
    admin
      .from("naver_blog_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .gte("published_at", since30d),
  ]);

  return {
    pending: pending.count ?? 0,
    published24h: p24.count ?? 0,
    published7d: p7.count ?? 0,
    published30d: p30.count ?? 0,
  };
}
