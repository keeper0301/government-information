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
import { fetchOrCreateCategoryIds, fetchOrCreateTagIds } from "./terms";
import { claimWordPressPublish } from "./claim";
import { findWordPressByBacklink } from "./reconcile-preview";

// 워드프레스 REST API timeout — 15초.
// cron maxDuration (Vercel 60초) 안에 안전 마진 확보 + 일시 응답 지연이
// 핵심 발행 경로 (네이버 큐 enqueue 등) 를 막지 않도록.
const WORDPRESS_TIMEOUT_MS = 15_000;

export type PublishResult =
  | { ok: true; wpPostId: number; wpPostUrl: string }
  | { ok: false; reason: "held_for_review"; wpPostId: number; wpPostUrl: string }
  | { ok: false; reason: "log_error"; wpPostId: number; wpPostUrl: string }
  | { ok: false; reason: "claim_unavailable_or_duplicate" }
  | { ok: false; reason: "skipped_no_credentials"; error?: undefined }
  | { ok: false; reason: "skipped_invalid_url"; error: string }
  | { ok: false; reason: "api_error"; error: string }
  | { ok: false; reason: "network_error"; error: string }
  | { ok: false; reason: "timeout"; error: string };

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
  let targetOrigin: string;
  try {
    const base = new URL(apiUrl);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash ||
        base.pathname.replace(/\/$/, "") !== "/wp-json/wp/v2") {
      throw new Error("HTTPS WordPress REST API 주소가 아닙니다");
    }
    targetOrigin = base.origin;
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

  // 4) 변환
  const payload = convertToWordPress(post);

  // 4-1) 카테고리·태그 slug → 워드프레스 ID 매핑 (정수 ID 만 받는 REST API 사양).
  // lookup 실패해도 빈 배열로 폴백 → 발행 자체는 진행 (Uncategorized 분류).
  const apiBase = postsEndpoint.replace(/\/posts$/, "");
  const [categoryIds, tagIds] = await Promise.all([
    fetchOrCreateCategoryIds(payload.categories, apiBase, authHeader),
    fetchOrCreateTagIds(payload.tags, apiBase, authHeader),
  ]);

  // Two concurrent cron/quality-check requests must not both create a WP post.
  // A failed auth attempt may be claimed again; drafts, timeouts and known IDs may not.
  if (!(await claimWordPressPublish(blogPostId))) {
    return { ok: false, reason: "claim_unavailable_or_duplicate" };
  }

  // 5) timeout — 15초 후 abort. 워드프레스 응답 지연이 cron 함수 전체를 막지 않도록.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), WORDPRESS_TIMEOUT_MS);
  const postStartedAt = Date.now();
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
        // 워드프레스 REST API 는 categories/tags 정수 ID 배열만 받음 (slug X).
        // terms.ts 가 사전 lookup·미존재 시 자동 생성 후 ID 반환.
        categories: categoryIds,
        tags: tagIds,
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    // e 가 Error 가 아닌 경우 (string·undefined 등) 대비 — instanceof 가드.
    const err = e instanceof Error ? e : new Error(String(e));
    const isAbort = err.name === "AbortError" || err.name === "TimeoutError";
    // POST가 서버에서 성공하고 응답만 늦었을 수 있다. 공개 REST를 읽기만 하여
    // 정확한 keepioo 백링크가 있는 단일 공개 글만 복구한다. 검색 실패는 재POST 근거가 아니다.
    if (isAbort && payload.status === "publish") {
      const preview = await findWordPressByBacklink(post.slug, apiUrl, fetch, { notBeforeMs: postStartedAt });
      if (preview.kind === "unique_match") {
        const match = preview.matches[0];
        if (!(await logSuccess(blogPostId, match.id, match.url))) {
          return { ok: false, reason: "log_error", wpPostId: match.id, wpPostUrl: match.url };
        }
        return { ok: true, wpPostId: match.id, wpPostUrl: match.url };
      }
      await logFailure(blogPostId, `timeout ${WORDPRESS_TIMEOUT_MS}ms; public_lookup=${preview.kind}`);
    } else {
      await logFailure(blogPostId, isAbort ? `timeout ${WORDPRESS_TIMEOUT_MS}ms` : `network: ${err.message}`);
    }
    return isAbort
      ? { ok: false, reason: "timeout", error: `${WORDPRESS_TIMEOUT_MS}ms 초과` }
      : { ok: false, reason: "network_error", error: err.message };
  } finally {
    clearTimeout(timer);
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
  if (wpPostId === null || !Number.isSafeInteger(wpPostId) || wpPostId <= 0 || !wpPostUrl) {
    const message = "응답에서 post.id/link 누락";
    await logFailure(blogPostId, message);
    return { ok: false, reason: "api_error", error: message };
  }

  // 201만으로 공개 발행을 보증할 수 없다. humanize gate가 draft로
  // 강등했거나 WordPress가 status를 바꿨다면 별도 검토 상태로 남긴다.
  let linkOrigin: string;
  try {
    const link = new URL(wpPostUrl);
    if (link.protocol !== "https:") throw new Error("non_https_link");
    linkOrigin = link.origin;
  } catch {
    await logFailure(blogPostId, "WordPress 응답 link 형식 오류", wpPostId, wpPostUrl);
    return { ok: false, reason: "api_error", error: "WordPress 응답 link 형식 오류" };
  }
  if (linkOrigin !== targetOrigin) {
    await logFailure(blogPostId, "WordPress 응답 link 호스트 불일치", wpPostId, wpPostUrl);
    return { ok: false, reason: "api_error", error: "WordPress 응답 link 호스트 불일치" };
  }
  const wpStatus = extractStringField(json, "status");
  if (wpStatus === "draft" || wpStatus === "pending" || wpStatus === "future" || wpStatus === "private") {
    if (!(await logHeld(blogPostId, wpPostId, wpPostUrl, wpStatus))) {
      return { ok: false, reason: "log_error", wpPostId, wpPostUrl };
    }
    return { ok: false, reason: "held_for_review", wpPostId, wpPostUrl };
  }
  if (wpStatus !== "publish" || payload.status !== "publish") {
    await logFailure(blogPostId, "WordPress 발행 상태 불일치", wpPostId, wpPostUrl);
    return { ok: false, reason: "api_error", error: "WordPress 발행 상태 불일치" };
  }

  // 6) 성공 기록 — wordpress_publish_log 에 INSERT
  if (!(await logSuccess(blogPostId, wpPostId, wpPostUrl))) {
    return { ok: false, reason: "log_error", wpPostId, wpPostUrl };
  }
  return { ok: true, wpPostId, wpPostUrl };
}

async function logHeld(blogPostId: string, wpPostId: number, wpPostUrl: string, wpStatus: string): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.from("wordpress_publish_log").upsert({
    blog_post_id: blogPostId,
    status: "skipped",
    wp_post_id: wpPostId,
    wp_post_url: wpPostUrl,
    published_at: null,
    failed_at: null,
    error_message: `WordPress ${wpStatus} — 관리자 검토 필요`,
    updated_at: new Date().toISOString(),
  }, { onConflict: "blog_post_id" });
  if (error) console.warn(`[wordpress-publish] log held 실패: ${error.message}`);
  return !error;
}

async function logSuccess(
  blogPostId: string,
  wpPostId: number,
  wpPostUrl: string,
): Promise<boolean> {
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
        failed_at: null,
        error_message: null,
        updated_at: now,
      },
      { onConflict: "blog_post_id" },
    );
  if (error) {
    console.warn(`[wordpress-publish] log success 실패: ${error.message}`);
  }
  return !error;
}

async function logFailure(blogPostId: string, message: string, wpPostId?: number, wpPostUrl?: string): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("wordpress_publish_log")
    .upsert(
      {
        blog_post_id: blogPostId,
        status: "failed",
        ...(wpPostId != null && { wp_post_id: wpPostId, wp_post_url: wpPostUrl }),
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
