// ============================================================
// 워드프레스 REST API 발행 클라이언트
// ============================================================
// blog-publish.ts insert 직후 publishToWordPress() 호출.
// REST API: POST {WP_API_URL}/posts
// 인증: Application Password (Basic Auth) — wordpress.com 사장님 발급.
//
// 환경변수 (사장님 설정 필요):
//   WP_API_URL          — 예: https://keepioopolicy.wordpress.com/wp-json/wp/v2
//   WP_USERNAME         — wordpress.com 사용자명
//   WP_APP_PASSWORD     — Application Passwords 페이지에서 발급한 24자리
//
// 환경변수 누락 시: skipped 반환 (build/dev 환경 보호).
// 발행 실패: error 정보를 wordpress_publish_log 에 기록.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { convertToWordPress, type BlogPostForWordPress } from "./format";

export type PublishResult =
  | { ok: true; wpPostId: number; wpPostUrl: string }
  | { ok: false; reason: "skipped_no_credentials"; error?: undefined }
  | { ok: false; reason: "skipped_invalid_url"; error: string }
  | { ok: false; reason: "api_error"; error: string }
  | { ok: false; reason: "network_error"; error: string };

/**
 * keepioo 블로그 → 워드프레스 즉시 발행 + 결과 DB 기록.
 *
 * 호출 위치: blog-publish.ts 의 INSERT 직후 (네이버 큐 enqueue 와 동일 패턴).
 * 핵심 경로 영향 0 — 워드프레스 발행 실패해도 keepioo 블로그 발행은 성공.
 *
 * @param blogPostId  keepioo blog_posts.id
 * @param post        변환에 필요한 글 데이터
 */
export async function publishToWordPress(
  blogPostId: string,
  post: BlogPostForWordPress,
): Promise<PublishResult> {
  // 1) 환경변수 검증 — 누락 시 skipped (CI·dev 빌드 안 깨짐)
  const apiUrl = process.env.WP_API_URL;
  const username = process.env.WP_USERNAME;
  const appPassword = process.env.WP_APP_PASSWORD;
  if (!apiUrl || !username || !appPassword) {
    return { ok: false, reason: "skipped_no_credentials" };
  }

  // 2) URL 검증 — wordpress.com 또는 self-hosted 도메인이 wp-json/wp/v2 endpoint 갖고 있어야 함
  let postsEndpoint: string;
  try {
    const base = new URL(apiUrl);
    postsEndpoint = `${base.origin}${base.pathname.replace(/\/$/, "")}/posts`;
  } catch (e) {
    return {
      ok: false,
      reason: "skipped_invalid_url",
      error: `WP_API_URL 형식 오류: ${(e as Error).message}`,
    };
  }

  // 3) Application Password Basic Auth — Buffer.from 으로 base64 인코딩
  const authHeader =
    "Basic " + Buffer.from(`${username}:${appPassword}`).toString("base64");

  // 4) 변환 + REST API 호출
  const payload = convertToWordPress(post);

  let res: Response;
  try {
    res = await fetch(postsEndpoint, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        title: payload.title,
        status: payload.status,
        content: payload.content,
        excerpt: payload.excerpt,
        // 카테고리·태그는 wordpress.com 의 slug 기반 자동 생성됨 (없으면 새로 만들어짐)
        // 정밀 매핑 필요 시 카테고리 ID 사전 fetch 후 매핑하는 로직으로 확장
      }),
    });
  } catch (e) {
    const message = (e as Error).message;
    await logFailure(blogPostId, `network: ${message}`);
    return { ok: false, reason: "network_error", error: message };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const message = `HTTP ${res.status}: ${errText.slice(0, 500)}`;
    await logFailure(blogPostId, message);
    return { ok: false, reason: "api_error", error: message };
  }

  // 5) 성공 응답 파싱
  const json: unknown = await res.json().catch(() => ({}));
  const wpPostId = extractNumberField(json, "id");
  const wpPostUrl = extractStringField(json, "link");
  if (wpPostId === null || !wpPostUrl) {
    const message = "응답에서 post.id/link 누락";
    await logFailure(blogPostId, message);
    return { ok: false, reason: "api_error", error: message };
  }

  // 6) 성공 기록 — wordpress_publish_log 에 INSERT
  await logSuccess(blogPostId, wpPostId, wpPostUrl);
  return { ok: true, wpPostId, wpPostUrl };
}

async function logSuccess(
  blogPostId: string,
  wpPostId: number,
  wpPostUrl: string,
): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("wordpress_publish_log")
    .upsert(
      {
        blog_post_id: blogPostId,
        status: "published",
        wp_post_id: wpPostId,
        wp_post_url: wpPostUrl,
        published_at: now,
        updated_at: now,
      },
      { onConflict: "blog_post_id" },
    );
  if (error) {
    console.warn(`[wordpress-publish] log success 실패: ${error.message}`);
  }
}

async function logFailure(blogPostId: string, message: string): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("wordpress_publish_log")
    .upsert(
      {
        blog_post_id: blogPostId,
        status: "failed",
        failed_at: now,
        error_message: message.slice(0, 1000),
        updated_at: now,
      },
      { onConflict: "blog_post_id" },
    );
  if (error) {
    console.warn(`[wordpress-publish] log failure 실패: ${error.message}`);
  }
}

function extractStringField(json: unknown, key: string): string | null {
  if (!json || typeof json !== "object") return null;
  const value = (json as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function extractNumberField(json: unknown, key: string): number | null {
  if (!json || typeof json !== "object") return null;
  const value = (json as Record<string, unknown>)[key];
  return typeof value === "number" ? value : null;
}
