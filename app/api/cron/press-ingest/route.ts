// app/api/cron/press-ingest/route.ts
// 매일 KST 10:30 / 15:30 / 19:30 cron 3회 — 광역도 보도자료 L2 자동 분류.
// 24h 후보 fetch → LLM 분류 → press_ingest_candidates confirm 큐 저장.
//
// 안전 가드: 동적 cap (평소 30 / 적체 시 50, decideCap) / news_id UNIQUE /
// confirm 전 welfare·loan INSERT 없음 / 비정책·unsure·분류 실패도 큐에 기록.
//
// vercel.json crons: 30 1/6/10 * * * UTC (= KST 10:30/15:30/19:30, 정시 회피)

import { NextResponse } from "next/server";
import { runAutoIngest } from "@/lib/press-ingest/ingest";
import { logAdminAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
// BOOSTED cap 50 × ~5s = 250s < maxDuration 300s (안전 margin 50s)
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

  // OPENAI_API_KEY 미설정 시 조용히 종료 (사장님 미등록 상태)
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      skipped: "OPENAI_API_KEY not configured",
    });
  }

  try {
    const result = await runAutoIngest();
    console.log("[cron/press-ingest] 결과:", result);
    // 2026-05-14 — cron 가동 흔적 audit (빈손이어도 1건 보장).
    // press_l2_classify 는 후보 처리할 때만 row 쌓여 false positive (가동했지만 row 0)
    // 위험 있었음 → press_ingest_run 으로 cron 가동 자체 추적.
    // 데이터 발견: hour list cron (30 1,6,10) 매일 3회 예정인데 admin_actions 1회/일만
    // = 06:30/10:30 cron 이 빈손으로 끝나서 추적 불가능했던 사고.
    try {
      await logAdminAction({
        actorId: null,
        action: "press_ingest_run",
        details: {
          candidates: result.candidates,
          classified: result.classified,
          queued_pending: result.queued_pending,
          auto_confirmed: result.auto_confirmed,
          skipped_existing: result.skipped_existing,
          errors_count: result.errors.length,
        },
      });
    } catch (auditErr) {
      console.error("[cron/press-ingest] audit 실패:", auditErr);
      // audit 실패해도 응답 유지 (운영 안전성)
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[cron/press-ingest] 실패:", msg);
    // 실패해도 진입 흔적 audit (cron 가동 자체 추적)
    try {
      await logAdminAction({
        actorId: null,
        action: "press_ingest_run",
        details: { error: msg },
      });
    } catch {
      // audit 실패는 무시
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// /admin/cron-trigger 의 self-POST 호환.
export const POST = GET;
