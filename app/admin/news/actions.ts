// ============================================================
// /admin/news server actions — 뉴스 검색 + 숨김 토글 + 최근 숨긴 10건 조회
// ============================================================
// 스펙: docs/superpowers/specs/2026-04-25-news-moderation-design.md
//
// admin 만 쓰는 운영 도구라 service_role (createAdminClient) 로 RLS 우회.
// 외부에 export 되는 server action 은 모두 isAdminUser 체크를 통과해야 한다.
// ============================================================

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-actions";
import {
  HIDE_REASON_CATEGORIES,
  type HideReasonCategory,
  type NewsSearchRow,
} from "./moderation-types";

// 모든 admin server action 의 진입점 — 미인증 / 비admin 은 즉시 차단.
async function requireAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) {
    // server action 안에서 redirect 호출 시 NEXT_REDIRECT 던지며 정상 종료
    redirect("/login?next=/admin/news");
  }
  return user;
}

// 공개 / 숨김 노출에 영향 가는 경로 일괄 revalidate.
// /news 목록·상세·홈·sitemap 모두 ISR 캐시를 쓰므로, 즉시 반영하려면 명시적 무효화 필요.
function revalidateNewsRoutes(slug: string) {
  revalidatePath("/news");
  revalidatePath(`/news/${slug}`);
  revalidatePath("/");
  revalidatePath("/sitemap.xml");
}

// ─── 1) 검색 결과 / 최근 숨김 조회 (server component 에서 직접 호출) ───

// 제목·slug·source_id 중 하나로 검색. service role 로 hidden 포함 전체 조회.
// SQL injection 은 supabase-js 가 parameterized query 로 처리.
// 호출자 (admin/news/page.tsx) 가 이미 requireAdmin() 으로 가드하지만,
// 다른 모듈에서 import 됐을 때를 대비한 방어 심층화 (defense in depth).
export async function searchNewsForAdmin(query: string): Promise<NewsSearchRow[]> {
  await requireAdminUser();
  const q = query.trim();
  if (!q) return [];

  const admin = createAdminClient();
  // PostgREST 의 .or() 는 콤마·괄호로 조건을 구분하므로 검색어 안의 그 문자는 제거.
  // 따옴표·백슬래시도 안전하게 제외 — 운영용 검색이라 특수문자 검색은 불필요.
  const safe = q.replace(/[,()"'\\]/g, " ").replace(/\s+/g, " ").trim();
  if (!safe) return [];
  // ILIKE 는 % 와 _ 를 와일드카드로 해석. 사용자 입력의 % _ 는 그대로 검색되도록 escape.
  const escaped = safe.replace(/[%_]/g, (c) => `\\${c}`);
  const like = `%${escaped}%`;

  const { data, error } = await admin
    .from("news_posts")
    .select("id, slug, title, ministry, category, published_at, is_hidden, hidden_at, hidden_reason")
    .or(`title.ilike.${like},slug.eq.${safe},source_id.eq.${safe}`)
    .order("published_at", { ascending: false })
    .limit(50);

  if (error) {
    console.warn("[admin/news searchNewsForAdmin] 실패:", error.message);
    return [];
  }
  return (data ?? []) as NewsSearchRow[];
}

// 최근 숨긴 뉴스 10건 (실수 복구 fast path 용).
// 호출자 가드와 별개로 서버 진입점에서 admin 재검증 (defense in depth).
export async function getRecentlyHiddenNews(): Promise<NewsSearchRow[]> {
  await requireAdminUser();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("news_posts")
    .select("id, slug, title, ministry, category, published_at, is_hidden, hidden_at, hidden_reason")
    .eq("is_hidden", true)
    .order("hidden_at", { ascending: false })
    .limit(10);

  if (error) {
    console.warn("[admin/news getRecentlyHiddenNews] 실패:", error.message);
    return [];
  }
  return (data ?? []) as NewsSearchRow[];
}

// ─── 2) 토글 server action ───

// /admin/news 폼·버튼에서 호출. slug + 다음 상태 (hide=true|false).
// hide 인 경우 사유 카테고리 + 메모 필요. unhide 는 사유 모두 NULL 로 초기화.
export async function toggleNewsHidden(formData: FormData): Promise<void> {
  const user = await requireAdminUser();

  const slug = String(formData.get("slug") ?? "").trim();
  const nextHidden = String(formData.get("hide") ?? "") === "true";
  const reasonCategoryRaw = String(formData.get("reasonCategory") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!slug) {
    redirect("/admin/news?error=" + encodeURIComponent("slug 누락"));
  }

  const admin = createAdminClient();

  // slug → id 조회 (감사 로그·revalidate 용)
  const { data: row, error: findErr } = await admin
    .from("news_posts")
    .select("id, slug, is_hidden")
    .eq("slug", slug)
    .maybeSingle();
  if (findErr || !row) {
    redirect("/admin/news?error=" + encodeURIComponent("뉴스를 찾을 수 없어요"));
  }

  let hiddenReasonValue: string | null = null;
  if (nextHidden) {
    if (!HIDE_REASON_CATEGORIES.includes(reasonCategoryRaw as HideReasonCategory)) {
      redirect("/admin/news?error=" + encodeURIComponent("사유 카테고리가 올바르지 않아요"));
    }
    // 포맷: "{카테고리}: {메모}" — 메모 비어 있으면 카테고리만.
    hiddenReasonValue = note ? `${reasonCategoryRaw}: ${note}` : reasonCategoryRaw;
  }

  const updatePayload = nextHidden
    ? {
        is_hidden: true,
        hidden_at: new Date().toISOString(),
        hidden_by: user.id,
        hidden_reason: hiddenReasonValue,
      }
    : {
        is_hidden: false,
        hidden_at: null,
        hidden_by: null,
        hidden_reason: null,
      };

  const { error: updateErr } = await admin
    .from("news_posts")
    .update(updatePayload)
    .eq("slug", slug);

  if (updateErr) {
    redirect(
      "/admin/news?error=" +
        encodeURIComponent(`업데이트 실패: ${updateErr.message}`),
    );
  }

  // 감사 로그 — 실패해도 본 작업은 성공한 상태이므로 try/catch 로 감쌈
  try {
    await logAdminAction({
      actorId: user.id,
      action: nextHidden ? "news_hide" : "news_unhide",
      details: {
        slug,
        news_id: row.id,
        reasonCategory: nextHidden ? reasonCategoryRaw : null,
        note: nextHidden && note ? note : null,
      },
    });
  } catch (e) {
    console.warn("[admin/news toggleNewsHidden] 감사 로그 실패:", e);
  }

  revalidateNewsRoutes(slug);

  // /news/[slug] 의 HideNewsButton 에서도 호출하므로 returnTo 가 있으면 그곳으로
  const returnTo = String(formData.get("returnTo") ?? "").trim();
  if (returnTo && returnTo.startsWith("/")) {
    redirect(returnTo);
  }
  redirect(`/admin/news?msg=${nextHidden ? "hidden" : "restored"}`);
}
