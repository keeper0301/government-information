// ============================================================
// 텔레그램 어드민 명령 — /news /health /today /stats /admin.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_BASE } from "./utils";

// /news — 분류 대기 뉴스 5개
export async function newsListCommand(): Promise<string> {
  const admin = createAdminClient();
  const totalRes = await admin
    .from("news_posts")
    .select("id", { count: "exact", head: true })
    .is("classified_at", null);
  const { data, error } = await admin
    .from("news_posts")
    .select("id, title, ministry, published_at")
    .is("classified_at", null)
    .order("published_at", { ascending: false })
    .limit(5);
  if (error) return `❌ 조회 실패: ${error.message.slice(0, 80)}`;
  const rows = data ?? [];
  if (rows.length === 0) return "✅ 분류 대기 뉴스 없음";
  return [
    `[news 분류 대기 — 총 ${totalRes.count ?? "?"}건, 최신 5개]`,
    "",
    ...rows.map(
      (r, i) =>
        `${i + 1}. [${r.ministry ?? "-"}] ${(r.title ?? "").slice(0, 50)}`,
    ),
  ].join("\n");
}

// /health — health-alert cron 응답 1줄 요약
export async function healthCommand(
  cronAuthorizationHeader: string | null,
): Promise<string> {
  if (!cronAuthorizationHeader) return "❌ CRON_SECRET 비밀값이 설정되지 않았습니다.";

  try {
    const res = await fetch(`${SITE_BASE}/api/cron/health-alert`, {
      headers: { Authorization: cronAuthorizationHeader },
    });
    const body = await res.text();
    if (!res.ok) return `❌ HTTP ${res.status}\n${body.slice(0, 200)}`;
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {}
    if (!parsed) return body.slice(0, 400);
    const okFlag = parsed.ok === false ? "⚠️" : "✅";
    return `${okFlag} health\n${JSON.stringify(parsed).slice(0, 600)}`;
  } catch (e) {
    return `❌ health 호출 실패: ${(e as Error).message.slice(0, 80)}`;
  }
}

// /today — 24h KPI 통합 (가입·press·결제·뉴스)
export async function todayCommand(): Promise<string> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [signups, pressConfirmed, payments, newsCollected] = await Promise.all([
    admin
      .from("user_profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
    admin
      .from("press_ingest_candidates")
      .select("id", { count: "exact", head: true })
      .eq("status", "confirmed")
      .gte("confirmed_at", since),
    admin
      .from("payment_history")
      .select("id", { count: "exact", head: true })
      .gte("paid_at", since),
    admin
      .from("news_posts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
  ]);
  return [
    "[오늘 KPI — 24h]",
    `· 신규 가입: ${signups.count ?? 0}`,
    `· 결제 완료: ${payments.count ?? 0}`,
    `· press 자동 등록: ${pressConfirmed.count ?? 0}`,
    `· news 수집: ${newsCollected.count ?? 0}`,
  ].join("\n");
}

// /stats — welfare/loan enrich 진행률 + press low 큐
export async function statsCommand(args: string): Promise<string> {
  const arg = args.trim().toLowerCase();
  const admin = createAdminClient();

  if (arg === "" || arg === "all") {
    const [welfare, loan, lowQueue] = await Promise.all([
      admin
        .from("welfare_programs")
        .select("id", { count: "exact", head: true })
        .eq("is_hidden", false)
        .not("keywords", "is", null),
      admin
        .from("loan_programs")
        .select("id", { count: "exact", head: true })
        .eq("is_hidden", false)
        .not("keywords", "is", null),
      admin
        .from("press_ingest_candidates")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("auto_confirm_tier", "low"),
    ]);
    return [
      "[진행률]",
      `· welfare keywords: ${welfare.count ?? 0}건 채움`,
      `· loan keywords: ${loan.count ?? 0}건 채움`,
      `· press low 큐: ${lowQueue.count ?? 0}건`,
    ].join("\n");
  }

  if (arg === "welfare" || arg === "loan") {
    const table = arg === "welfare" ? "welfare_programs" : "loan_programs";
    const total = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("is_hidden", false);
    const filled = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("is_hidden", false)
      .not("keywords", "is", null);
    const t = total.count ?? 0;
    const f = filled.count ?? 0;
    const pct = t > 0 ? ((f / t) * 100).toFixed(1) : "0.0";
    return `[${arg} enrich]\n· ${f} / ${t} (${pct}%)`;
  }

  return "사용법: /stats [welfare|loan|all]";
}

// /admin — 어드민 페이지 빠른 link list (모바일 탭 진입용)
export function adminLinksCommand(): string {
  return [
    "[어드민 빠른 링크]",
    "",
    `· 메인: ${SITE_BASE}/admin`,
    `· 자동 등록 검수: ${SITE_BASE}/admin/auto-confirmed`,
    `· press 후보: ${SITE_BASE}/admin/press-ingest`,
    `· dedupe: ${SITE_BASE}/admin/dedupe`,
    `· news: ${SITE_BASE}/admin/news`,
    `· health: ${SITE_BASE}/admin/health`,
    `· cron-trigger: ${SITE_BASE}/admin/cron-trigger`,
    `· targeting: ${SITE_BASE}/admin/targeting`,
    `· alert sim: ${SITE_BASE}/admin/alert-simulator`,
    `· alimtalk: ${SITE_BASE}/admin/alimtalk`,
    `· wishes: ${SITE_BASE}/admin/wishes`,
    `· my actions: ${SITE_BASE}/admin/my-actions`,
  ].join("\n");
}
