// ============================================================
// 최종 삭제 cron — /api/finalize-deletions
// ============================================================
// 30일 유예가 지난 pending_deletions row 를 순회하며 auth.admin.deleteUser 로
// 실제 삭제 (CASCADE 로 pending row + user_profiles·alert_rules 등 모두 정리).
//
// 실행 주기:
//   - vercel.json cron: 매일 06:00 UTC (15:00 KST).
//   - Vercel Hobby 60s maxDuration → BATCH_LIMIT 로 한 번에 처리할 건수 제한.
//   - 남은 건은 다음 날 cron 이 처리. scheduled_delete_at 는 +30일 고정이라
//     평균 하루 발생량이 크지 않음.
//
// 실패 처리:
//   - 개별 사용자 삭제 실패 (예: auth.users 이미 수동 삭제됨)는 failures 에
//     기록하고 다음 cron 재시도. pending_deletions row 는 auth 삭제 성공 시
//     CASCADE 로 함께 삭제됨.
//   - 전체 실패 (DB 연결 등) 는 notifyCronFailure 로 운영자 알림 (24h dedupe).
//
// 보안:
//   - CRON_SECRET Bearer 인증 (다른 cron 과 동일 패턴).
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-actions";
import { notifyCronFailure } from "@/lib/email";

// 한 번 cron 에 처리할 최대 건수 — 60s 안에 auth 삭제 + 감사 로그 여유 있게.
const BATCH_LIMIT = 50;

// 감사 로그 PII 최소화용 — /api/account/delete 와 동일 정책 유지
function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const m = email.match(/^(.{1,2})(.*)(@.+)$/);
  return m ? `${m[1]}***${m[3]}` : "***";
}

async function runFinalize() {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // 1) 유예 만료된 pending 조회 (오래된 순으로 — 가장 먼저 만료된 것부터 처리)
  const { data: pendings, error: fetchErr } = await admin
    .from("pending_deletions")
    .select(
      "user_id, email, requested_at, scheduled_delete_at, reason, reason_detail",
    )
    .lte("scheduled_delete_at", now)
    .order("scheduled_delete_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (fetchErr) {
    throw new Error(`pending 조회 실패: ${fetchErr.message}`);
  }

  const targets = pendings || [];
  let deleted = 0;
  let failed = 0;
  const failures: string[] = [];

  // 2) 건별 최종 삭제. 감사 로그 → auth.admin.deleteUser 순.
  for (const p of targets) {
    try {
      // 감사 로그 — auth 삭제 전에 기록. 사유는 pending row 에 있던 값 이관.
      // 로그 실패는 삭제 자체를 막지 않음 (warn 만).
      try {
        await logAdminAction({
          actorId: p.user_id,
          targetUserId: p.user_id,
          action: "self_deleted",
          details: {
            user_id_at_deletion: p.user_id,
            email_masked: maskEmail(p.email),
            reason: p.reason ?? "unspecified",
            reason_detail: p.reason_detail,
            finalize_source: "cron_grace_expired",
            requested_at: p.requested_at,
            scheduled_delete_at: p.scheduled_delete_at,
          },
        });
      } catch (logErr) {
        console.warn("[finalize-deletions] 감사 로그 실패:", {
          userId: p.user_id,
          message: logErr instanceof Error ? logErr.message : String(logErr),
        });
      }

      // auth.users 삭제 → CASCADE 로 pending_deletions row 도 함께 삭제
      const { error: delErr } = await admin.auth.admin.deleteUser(p.user_id);
      if (delErr) throw new Error(delErr.message);

      deleted += 1;
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${maskEmail(p.email)} (${p.user_id}): ${msg}`);
    }
  }

  // 3) 아직 남은 만료 건 수 — 처리 못한 backlog 가시화
  const { count: remainingExpired } = await admin
    .from("pending_deletions")
    .select("*", { count: "exact", head: true })
    .lte("scheduled_delete_at", now);

  return {
    timestamp: now,
    processed: targets.length,
    deleted,
    failed,
    failures: failures.slice(0, 10),
    remaining_expired: remainingExpired ?? 0,
    batch_limit: BATCH_LIMIT,
  };
}

function checkAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

async function runAndRespond(jobLabel: string) {
  try {
    const result = await runFinalize();
    if (result.failed > 0) {
      await notifyCronFailure(
        `${jobLabel} - ${result.failed}건 최종 삭제 실패`,
        result.failures.join("\n"),
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    await notifyCronFailure(jobLabel, message);
    return NextResponse.json(
      { error: "finalize 실패", detail: message },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = checkAuth(request);
  if (auth) return auth;
  return runAndRespond("finalize-deletions (POST)");
}

export async function GET(request: NextRequest) {
  const auth = checkAuth(request);
  if (auth) return auth;
  return runAndRespond("finalize-deletions (cron)");
}
