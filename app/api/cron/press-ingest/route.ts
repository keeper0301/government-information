// app/api/cron/press-ingest/route.ts
// 매일 09:00 KST cron — 광역도 보도자료 L2 자동 분류.
// 24h 후보 fetch → LLM 분류 → press_ingest_candidates confirm 큐 저장.
//
// 안전 가드: 후보 cap 30 / news_id UNIQUE / confirm 전 welfare·loan INSERT 없음 /
// 비정책·unsure·분류 실패도 큐에 기록해 반복 LLM 비용 차단.
//
// vercel.json crons: { "path": "/api/cron/press-ingest", "schedule": "5 0 * * *" }
// (UTC 00:05 = KST 09:05, 정시 회피)

import { NextResponse } from "next/server";
import { runAutoIngest } from "@/lib/press-ingest/ingest";

export const dynamic = "force-dynamic";
// LLM 호출 직렬화 + 외부 API 응답 시간 — 후보 30건 × 5s = 150s 가능
export const maxDuration = 300;

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

// POST = GET alias.
// /admin/cron-trigger 가 self-POST 로 호출하기 때문에 POST 핸들러 필요.
// vercel cron 자동 호출은 GET 으로 들어와 양쪽 모두 동일 로직 실행.
export async function GET(request: Request) {
  const authErr = await authorize(request);
  if (authErr) return authErr;

  // ANTHROPIC_API_KEY 미설정 시 조용히 종료 (사장님 미등록 상태)
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      skipped: "ANTHROPIC_API_KEY not configured",
    });
  }

  try {
    const result = await runAutoIngest();
    console.log("[cron/press-ingest] 결과:", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[cron/press-ingest] 실패:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// /admin/cron-trigger 의 self-POST 호환.
export const POST = GET;
