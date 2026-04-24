// ============================================================
// /api/collect-news — korea.kr RSS 정책 뉴스 수집 (cron)
// ============================================================
// 하루 1회 Vercel Cron 에서 호출. 3개 RSS 피드 모두 수집.
//
// 응답 예: { timestamp, total: 85, upserted: 85, errors: 0,
//          breakdown: { 'korea-kr-policy': 30, 'korea-kr-press': 40, ... } }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { collectKoreaKr } from "@/lib/news-collectors/korea-kr";
import { notifyCronFailure } from "@/lib/email";

export const maxDuration = 60;

async function run(jobLabel: string) {
  try {
    const result = await collectKoreaKr();

    // 전건 실패만 알림 (에러 일부는 정상 범주 — 특정 feed 일시 장애 가능)
    if (result.errors >= 3 || (result.total === 0 && result.errors > 0)) {
      await notifyCronFailure(
        `${jobLabel} - korea.kr RSS 수집 이슈`,
        `errors=${result.errors} / total=${result.total}`,
      );
    }

    return NextResponse.json({ timestamp: new Date().toISOString(), ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    await notifyCronFailure(jobLabel, msg);
    return NextResponse.json({ error: "수집 실패", detail: msg }, { status: 500 });
  }
}

function checkAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const fail = checkAuth(request);
  if (fail) return fail;
  return run("collect-news (POST)");
}

export async function GET(request: NextRequest) {
  const fail = checkAuth(request);
  if (fail) return fail;
  return run("collect-news (cron)");
}
