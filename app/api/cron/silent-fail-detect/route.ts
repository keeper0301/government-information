// ============================================================
// /api/cron/silent-fail-detect — collector silent fail 재발생 감지 (2026-05-22)
// ============================================================
// 2026-05-22 audit 사고 — 시·군 collector 27개 NOT NULL 컬럼 누락으로 prod row 0건
// silent fail. errors[] 카운트만 누적되고 inserted=0 → cron audit 정상 표시.
//
// 재발생 방지 — 매일 source_code prefix 별 24h row 증가 0 발견 시 텔레그램 alert.
//
// 일정: vercel.json — KST 08:00 (UTC 23:00). 시·군 cron (KST 04~07) 가 충분히 실행된 후.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOpsAlertMultichannel } from "@/lib/notifications/ops-alert-multichannel";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 감시 대상 source_code prefix — collector 가 매일 새 row 만들어야 정상.
// 0 이면 silent fail 의심.
const WATCH_PREFIXES = [
  "local-press-", // 시·군 collector 27개 (audit 사고 영역)
  "naver-news-", // 17 광역 naver-news
  "korea-kr-", // korea.kr RSS
];

async function run() {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const results: Array<{ prefix: string; count: number; ok: boolean }> = [];
  const failedPrefixes: string[] = [];

  for (const prefix of WATCH_PREFIXES) {
    const { count, error } = await admin
      .from("news_posts")
      .select("id", { count: "exact", head: true })
      .like("source_code", `${prefix}%`)
      .gte("created_at", since);

    const n = count ?? 0;
    const ok = !error && n > 0;
    results.push({ prefix, count: n, ok });
    if (!ok) failedPrefixes.push(prefix);
  }

  // 1 개 이상 prefix 가 0 row → alert.
  // SMS off 후 sendOpsAlertMultichannel 가 텔레그램으로 fallback.
  let alertResult: Awaited<ReturnType<typeof sendOpsAlertMultichannel>> | null = null;
  if (failedPrefixes.length > 0) {
    const lines = results
      .map((r) => `  ${r.prefix}* : ${r.count}건`)
      .join("\n");
    alertResult = await sendOpsAlertMultichannel({
      subject: `[keepioo silent fail 의심] 24h row 0건`,
      message: [
        "🚨 다음 collector prefix 가 24h 동안 0 row 추가:",
        ...failedPrefixes.map((p) => `  · ${p}*`),
        "",
        "전체 결과:",
        lines,
        "",
        "→ cron audit 확인 + 코드 review 권장",
      ].join("\n"),
      link: "keepioo.com/admin/health",
    });
  }

  return NextResponse.json({
    ok: true,
    since,
    results,
    failedPrefixes,
    alert: alertResult
      ? {
          anyDelivered: alertResult.anyDelivered,
          sms: alertResult.sms?.ok ?? false,
          telegram: alertResult.telegram?.ok ?? false,
        }
      : null,
  });
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
