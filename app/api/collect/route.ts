// ============================================================
// 정책 수집 API (레지스트리 기반)
// ============================================================
// lib/collectors/ 에 등록된 모든 컬렉터를 순차 실행.
// 각 컬렉터는 Collector 인터페이스를 구현 + AsyncGenerator 로 아이템 방출.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCronFailure } from "@/lib/email";
import {
  getAllCollectors,
  runOneCollector,
  type CollectorResult,
} from "@/lib/collectors";

export const maxDuration = 300; // 5분 — 여러 컬렉터 순차 실행

async function runCollectAndRespond(jobLabel: string) {
  try {
    const supabase = createAdminClient();
    const collectors = await getAllCollectors();

    const results: Record<string, CollectorResult> = {};
    let totalCollected = 0;
    const failedSources: string[] = [];

    // 각 컬렉터 순차 실행 (병렬은 Rate Limit 우려로 미적용)
    for (const collector of collectors) {
      const r = await runOneCollector(supabase, collector);
      results[collector.sourceCode] = r;
      totalCollected += r.collected;
      if (r.error && !r.error.includes("disabled")) {
        failedSources.push(`${collector.sourceCode}: ${r.error}`);
      }
    }

    // 일부 소스라도 실패하면 운영자 알림 (전체 fail 이 아니어도)
    if (failedSources.length > 0) {
      await notifyCronFailure(
        `${jobLabel} - 일부 소스 실패`,
        failedSources.join("\n"),
      );
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      total: totalCollected,
      sources: results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    await notifyCronFailure(jobLabel, message);
    return NextResponse.json(
      { error: "수집 실패", detail: message },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
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
  return runCollectAndRespond("collect (POST)");
}

export async function GET(request: NextRequest) {
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
  return runCollectAndRespond("collect (cron)");
}
