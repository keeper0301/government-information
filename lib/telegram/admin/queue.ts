// ============================================================
// 텔레그램 어드민 명령 — /queue (모든 backlog 한 화면).
// ============================================================
// 사장님 1줄 모니터링용. press·dedupe·news 큐를 단일 명령으로 보여줘
// 매일 1회 어드민 들어가지 않아도 운영 health 파악.
//
// 임계 초과 시 ⚠️ 마킹 — news 1000+ / press pending 10+ / dedupe 5+
// health-alert cron (lib/health-check.ts) 의 NEWS_BACKLOG_FLOOR /
// PRESS_PENDING_ALERT_FLOOR default 와 동일 기준 — 두 채널 일관성.

import { createAdminClient } from "@/lib/supabase/admin";

export async function queueCommand(): Promise<string> {
  const admin = createAdminClient();
  const [pressPending, pressLow, dedupeWelfare, dedupeLoan, newsBacklog] =
    await Promise.all([
      admin
        .from("press_ingest_candidates")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      admin
        .from("press_ingest_candidates")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("auto_confirm_tier", "low"),
      admin
        .from("welfare_programs")
        .select("id", { count: "exact", head: true })
        .not("duplicate_of_id", "is", null)
        .is("dedupe_auto_confirmed_at", null),
      admin
        .from("loan_programs")
        .select("id", { count: "exact", head: true })
        .not("duplicate_of_id", "is", null)
        .is("dedupe_auto_confirmed_at", null),
      admin
        .from("news_posts")
        .select("id", { count: "exact", head: true })
        .is("classified_at", null),
    ]);

  const flag = (n: number, threshold: number) =>
    n >= threshold ? "⚠️ " : "· ";
  const news = newsBacklog.count ?? 0;
  const pPending = pressPending.count ?? 0;
  const pLow = pressLow.count ?? 0;
  const dedupe = (dedupeWelfare.count ?? 0) + (dedupeLoan.count ?? 0);
  return [
    "[backlog 한 화면]",
    `${flag(news, 1000)}news 미분류: ${news.toLocaleString("ko")}`,
    `${flag(pPending, 10)}press pending: ${pPending} (low ${pLow})`,
    `${flag(dedupe, 5)}dedupe pending: ${dedupe}`,
    "",
    "/news · /press · /dedupe · /stats 로 detail.",
  ].join("\n");
}
