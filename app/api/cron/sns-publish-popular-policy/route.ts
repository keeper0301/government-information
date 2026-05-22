// ============================================================
// B 1차 — 매주 월 KST 10:00 인기 정책 SNS 자동 노출
// ============================================================
// 지난 7일 popularity_snapshots top 3 (welfare 2 + loan 1) 을
// Twitter/Threads/Facebook 자동 발행. blog cron (KST 11:00) 과 1시간 격차.
//
// 중복 발행 차단: 직전 30일 같은 program_id 발행 이력 있으면 skip.
// env 미설정 graceful skip (dispatchPolicyToSns 가 채널별 skipped_no_credentials).
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchPolicyToSns, type PolicyShare } from "@/lib/sns/policy-dispatch";
import { logAdminAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WELFARE_TOP_N = 2;
const LOAN_TOP_N = 1;

async function authorize(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

// 지난 7일 popularity_snapshots 의 program 별 누적 score 집계 → top N
async function findTopPrograms(
  admin: ReturnType<typeof createAdminClient>,
  table: "welfare_programs" | "loan_programs",
  topN: number,
): Promise<string[]> {
  const since = new Date(Date.now() - 7 * 24 * 3600_000)
    .toISOString()
    .slice(0, 10);
  const { data } = await admin
    .from("popularity_snapshots")
    .select("program_id, score")
    .eq("program_table", table)
    .gte("snapshot_date", since)
    .order("score", { ascending: false })
    .limit(200);

  const agg = new Map<string, number>();
  for (const row of (data ?? []) as Array<{
    program_id: string;
    score: number;
  }>) {
    agg.set(row.program_id, (agg.get(row.program_id) ?? 0) + Number(row.score));
  }
  return [...agg.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id]) => id);
}

// 직전 30일 SNS 발행한 program_id set — 중복 발행 차단
async function loadAlreadyPublished(
  admin: ReturnType<typeof createAdminClient>,
): Promise<Set<string>> {
  const since30d = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const { data } = await admin
    .from("admin_actions")
    .select("details")
    .eq("action", "sns_publish_popular_policy_run")
    .gte("created_at", since30d);
  const ids = new Set<string>();
  for (const r of (data ?? []) as Array<{
    details?: { id?: string } | null;
  }>) {
    if (r.details?.id) ids.add(r.details.id);
  }
  return ids;
}

async function run() {
  const admin = createAdminClient();

  // 1) 지난 7일 popularity top N 각 카테고리
  const [welfareIds, loanIds] = await Promise.all([
    findTopPrograms(admin, "welfare_programs", WELFARE_TOP_N),
    findTopPrograms(admin, "loan_programs", LOAN_TOP_N),
  ]);

  if (welfareIds.length === 0 && loanIds.length === 0) {
    return { success: true, published: 0, skipped: "no_popular_data" };
  }

  // 2) 직전 30일 중복 발행 차단
  const alreadyIds = await loadAlreadyPublished(admin);
  const targetWelfare = welfareIds.filter((id) => !alreadyIds.has(id));
  const targetLoan = loanIds.filter((id) => !alreadyIds.has(id));

  if (targetWelfare.length === 0 && targetLoan.length === 0) {
    return { success: true, published: 0, skipped: "all_recently_published" };
  }

  // 3) 정책 본문 fetch
  const [welfareRows, loanRows] = await Promise.all([
    targetWelfare.length > 0
      ? admin
          .from("welfare_programs")
          .select("id, title, region, apply_end")
          .in("id", targetWelfare)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            title: string;
            region: string | null;
            apply_end: string | null;
          }>,
        }),
    targetLoan.length > 0
      ? admin
          .from("loan_programs")
          .select("id, title, region, apply_end")
          .in("id", targetLoan)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            title: string;
            region: string | null;
            apply_end: string | null;
          }>,
        }),
  ]);

  const policies: PolicyShare[] = [
    ...((welfareRows.data ?? []) as Array<{
      id: string;
      title: string;
      region: string | null;
      apply_end: string | null;
    }>).map((r) => ({ ...r, table: "welfare_programs" as const })),
    ...((loanRows.data ?? []) as Array<{
      id: string;
      title: string;
      region: string | null;
      apply_end: string | null;
    }>).map((r) => ({ ...r, table: "loan_programs" as const })),
  ];

  // 4) 채널별 dispatch + audit
  const results: Array<{
    id: string;
    title: string;
    channels: unknown[];
  }> = [];
  for (const p of policies) {
    const channels = await dispatchPolicyToSns(p);
    results.push({ id: p.id, title: p.title.slice(0, 80), channels });

    try {
      await logAdminAction({
        actorId: null,
        action: "sns_publish_popular_policy_run",
        details: {
          id: p.id,
          title: p.title.slice(0, 80),
          table: p.table,
          channels,
        },
      });
    } catch (e) {
      console.warn("[sns-publish-popular-policy] audit 실패:", e);
    }
  }

  // 5/22: caption AI 티 검출 시 사장님 즉시 알림 (사장님 5/22 명시)
  const violationItems: Array<{ id: string; title: string; channels: string[]; reasons: string[] }> = [];
  for (const r of results) {
    const violations = (r.channels as Array<{ channel: string; ok: boolean; reason?: string }>)
      .filter((c) => !c.ok && c.reason?.startsWith("caption_violations:"));
    if (violations.length > 0) {
      violationItems.push({
        id: r.id,
        title: r.title,
        channels: violations.map((v) => v.channel),
        reasons: violations.map((v) => v.reason?.slice(0, 120) ?? "").filter(Boolean),
      });
    }
  }
  if (violationItems.length > 0) {
    try {
      const { sendOpsAlertTelegram } = await import("@/lib/notifications/telegram-ops-alert");
      const msg = violationItems
        .map(
          (v) =>
            `- ${v.title}\n  channels: ${v.channels.join(", ")}\n  ${v.reasons[0] ?? ""}`,
        )
        .join("\n\n");
      await sendOpsAlertTelegram({
        subject: `🚨 인기 정책 SNS 발행 차단 — caption AI 티 ${violationItems.length}건`,
        message: `${msg}\n\nadmin 에서 정책 title 수정 후 재발행 필요.`,
      });
    } catch (e) {
      console.warn("[sns-publish-popular-policy] caption_violations 알림 실패:", e);
    }
  }

  return { success: true, published: results.length, caption_violations: violationItems.length, results };
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  const out = await run();
  return NextResponse.json(out, { status: out.success ? 200 : 500 });
}

export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  const out = await run();
  return NextResponse.json(out, { status: out.success ? 200 : 500 });
}
