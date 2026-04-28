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
  NEWS_CATEGORY_FILTERS,
  NEWS_HIDDEN_FILTERS,
  type HideReasonCategory,
  type NewsCategoryFilter,
  type NewsHiddenFilter,
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
// 각 호출을 try/catch 로 감싸 한 path 가 잘못 매치돼도 server action 전체가
// 500 으로 깨지지 않도록 함.
//
// 2026-04-25 디버깅: 한글 slug 가 들어간 `/news/${slug}` 를 첫 인자로 받으면
// next/cache 의 revalidatePath 가 try/catch 로 잡히지 않는 형태로 throw →
// server action 전체 500. 해결: 단일 path 가 아닌 dynamic route 형태로 호출
// (`/news/[slug]`, "page") — 모든 slug 의 ISR 캐시를 한 번에 무효화.
// 이 방식은 path 에 한글이 포함되지 않아 안전하다.
//
// /sitemap.xml 은 next 의 file-route convention 을 revalidatePath 가 인식 못 해
// throw → 호출 제외. sitemap 자체 revalidate (60s) 에 맡김.
function revalidateNewsRoutes() {
  try { revalidatePath("/news"); } catch (e) { console.warn("[moderation] revalidate /news 실패:", e); }
  try { revalidatePath("/news/[slug]", "page"); } catch (e) { console.warn("[moderation] revalidate /news/[slug] 실패:", e); }
  try { revalidatePath("/"); } catch (e) { console.warn("[moderation] revalidate / 실패:", e); }
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

// 전체 뉴스 목록 (페이지네이션 + 카테고리·숨김 필터).
// 검색어 없이 사장님이 "최근에 어떤 뉴스가 들어왔지" 확인할 때 사용.
// 매일 RSS 가 누적되므로 limit 없이 select 하면 점점 무거워짐 → 30/페이지 + count exact.
export async function listNewsForAdmin(args: {
  category?: NewsCategoryFilter;
  hidden?: NewsHiddenFilter;
  limit?: number;
  offset?: number;
}): Promise<{ rows: NewsSearchRow[]; total: number }> {
  await requireAdminUser();
  const admin = createAdminClient();

  const limit = Math.min(Math.max(args.limit ?? 30, 1), 100); // 1~100 cap
  const offset = Math.max(args.offset ?? 0, 0);

  // 화이트리스트 검증 — URL 조작으로 임의 enum 들어오는 거 차단
  const category = NEWS_CATEGORY_FILTERS.includes(args.category as NewsCategoryFilter)
    ? (args.category as NewsCategoryFilter)
    : "all";
  const hidden = NEWS_HIDDEN_FILTERS.includes(args.hidden as NewsHiddenFilter)
    ? (args.hidden as NewsHiddenFilter)
    : "all";

  let query = admin
    .from("news_posts")
    .select(
      "id, slug, title, ministry, category, published_at, is_hidden, hidden_at, hidden_reason",
      { count: "exact" },
    )
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (category !== "all") {
    query = query.eq("category", category);
  }
  if (hidden === "visible") {
    query = query.eq("is_hidden", false);
  } else if (hidden === "hidden") {
    query = query.eq("is_hidden", true);
  }

  const { data, error, count } = await query;
  if (error) {
    console.warn("[admin/news listNewsForAdmin] 실패:", error.message);
    return { rows: [], total: 0 };
  }
  return {
    rows: (data ?? []) as NewsSearchRow[],
    total: count ?? 0,
  };
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

  revalidateNewsRoutes();

  // returnTo 처리 — next/navigation 의 redirect() 는 한글 등 ASCII 외 문자가
  // path 에 들어 있으면 내부적으로 TypeError 를 던진다 (encode 후에도 일부 경로
  // 에서 다시 처리되며 throw). 안전을 위해 ASCII 만 허용:
  //   - returnTo 가 / 로 시작하고 ASCII 만이면 그대로 redirect (예: /admin/news?q=...)
  //   - 한글 등 포함된 returnTo (예: /news/생활이-...) 는 무시하고 ASCII fallback
  //     /admin/news?msg=... 으로 보냄. 사장님은 검색 또는 "최근 숨긴 10건" 에서
  //     한 클릭으로 다시 그 뉴스 상세 페이지로 진입 가능.
  const returnToRaw = String(formData.get("returnTo") ?? "").trim();
  const isAsciiPath = (s: string) => /^[\x00-\x7F]+$/.test(s);
  if (returnToRaw && returnToRaw.startsWith("/") && isAsciiPath(returnToRaw)) {
    redirect(returnToRaw);
  }
  redirect(`/admin/news?msg=${nextHidden ? "hidden" : "restored"}`);
}
