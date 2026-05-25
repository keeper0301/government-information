// ============================================================
// 가-A1 — 실패한 cron 자동 1회 재시도.
// ============================================================
// 매시간 KST 22 분 (UTC :22) 실행 — daily cron 들 직후 시점.
// 1시간 안에 cron_failure_log 에 새로 기록된 일시적 실패만 재시도.
// occurrences > 3 (만성 버그) 또는 retry 매핑 없는 job 은 skip.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-actions";
import { authorizeCronRequest, getCronAuthorizationHeader } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SITE_BASE = "https://www.keepioo.com";

// job_name → cron path 매핑 (재시도 안전한 cron 만 등록).
// publish-blog 는 GitHub Actions 라 제외. 사용자 facing endpoint 만 재시도.
const JOB_TO_PATH: Record<string, string> = {
  "press-ingest": "/api/cron/press-ingest",
  "news-classify": "/api/cron/news-classify",
  "daily-digest": "/api/cron/daily-digest",
  "weekly-digest": "/api/cron/weekly-digest",
  "weekly-ops-digest": "/api/cron/weekly-ops-digest",
  "support-reminder": "/api/cron/support-reminder",
  "cancellation-followup": "/api/cron/cancellation-followup",
  "category-backfill": "/api/cron/category-backfill",
  "blog-quality-check": "/api/cron/blog-quality-check",
  "nps-invite": "/api/cron/nps-invite",
  "sentry-daily-summary": "/api/cron/sentry-daily-summary",
  "sns-publish-blog": "/api/cron/sns-publish-blog",
  "external-console-check": "/api/cron/external-console-check",
  "health-alert": "/api/cron/health-alert",
  "onboarding-reminder": "/api/cron/onboarding-reminder",
};

async function run() {
  const admin = createAdminClient();
  const authorizationHeader = getCronAuthorizationHeader();
  if (!authorizationHeader) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET 비밀값이 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // 1h 안에 last_seen_at 인 + occurrences ≤ 3 (만성 버그 X)
  const { data, error } = await admin
    .from("cron_failure_log")
    .select("id, job_name, signature, occurrences, last_seen_at")
    .gte("last_seen_at", since1h)
    .lte("occurrences", 3)
    .order("last_seen_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json(
      { ok: false, error: `query_failed: ${error.message}` },
      { status: 500 },
    );
  }

  const failures = (data ?? []) as Array<{
    id: number;
    job_name: string;
    signature: string;
    occurrences: number;
    last_seen_at: string;
  }>;

  if (failures.length === 0) {
    return NextResponse.json({ ok: true, retried: 0 });
  }

  // 같은 job_name 중복 처리 방지 — 가장 최근 1건만
  const seen = new Set<string>();
  const targets = failures.filter((f) => {
    if (seen.has(f.job_name)) return false;
    seen.add(f.job_name);
    return true;
  });

  const results: Array<{
    job: string;
    status: number | "no_path" | "error";
    error?: string;
  }> = [];

  for (const f of targets) {
    const path = JOB_TO_PATH[f.job_name];
    if (!path) {
      results.push({ job: f.job_name, status: "no_path" });
      continue;
    }
    try {
      const res = await fetch(`${SITE_BASE}${path}`, {
        method: "POST",
        headers: { Authorization: authorizationHeader },
      });
      results.push({ job: f.job_name, status: res.status });
    } catch (e) {
      results.push({
        job: f.job_name,
        status: "error",
        error: (e as Error).message.slice(0, 80),
      });
    }
  }

  try {
    await logAdminAction({
      actorId: null,
      action: "cron_retry_run",
      details: { failures_total: failures.length, retried: results.length, results },
    });
  } catch (e) {
    console.warn("[failed-cron-retry] audit 실패:", e);
  }

  return NextResponse.json({ ok: true, retried: results.length, results });
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}

export async function POST(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}
