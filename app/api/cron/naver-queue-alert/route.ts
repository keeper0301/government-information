// app/api/cron/naver-queue-alert/route.ts
// Phase 3 — 매일 KST 09:10 네이버 블로그 큐 적체 점검 + SMS alert.
// 큐 ≥ 3 건 적체 시 사장님 휴대폰 SMS → PC 켤 때 클로드 일괄 발행.
// vercel.json crons 등록: { "path": "/api/cron/naver-queue-alert", "schedule": "10 0 * * *" }

import { NextResponse } from "next/server";
import { checkAndAlertNaverQueue } from "@/lib/notifications/naver-queue-alert";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

async function run() {
  const result = await checkAndAlertNaverQueue();
  return NextResponse.json(result);
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}

// POST 도 같은 동작 (수동 trigger 편의)
export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}
