// ============================================================
// /api/cron/agent-resident-cycle
// ============================================================
// 사이트 안에서 계속 도는 자율 운영 루프입니다.
// Vercel cron 이 진단을 실행하고, agent-policy 로 다음 행동을 분류한 뒤
// 관리자 허브에서 볼 수 있도록 감사 기록을 남깁니다.
// ============================================================

import { NextResponse } from "next/server";
import {
  runResidentAgentCycle,
  type ResidentAgentSource,
} from "@/lib/agent/resident-cycle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET 환경변수가 설정되지 않았습니다." },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }
  return null;
}

const SOURCE_ALIASES: Record<string, ResidentAgentSource> = {
  github_actions_heartbeat: "github_actions_heartbeat",
  site_resident_cron: "site_resident_cron",
  startup: "server_resident_startup",
  scheduler: "server_resident_worker",
  manual: "server_resident_manual",
  server_resident_startup: "server_resident_startup",
  server_resident_worker: "server_resident_worker",
  server_resident_manual: "server_resident_manual",
};

async function readSource(request: Request): Promise<ResidentAgentSource> {
  const headerSource = request.headers.get("x-agent-resident-source") ?? "";
  const bodySource = await readBodySource(request);
  return (
    SOURCE_ALIASES[bodySource] ??
    SOURCE_ALIASES[headerSource] ??
    "site_resident_cron"
  );
}

async function readBodySource(request: Request) {
  if (request.method !== "POST") return "";
  try {
    const body = (await request.json()) as { source?: unknown };
    return typeof body.source === "string" ? body.source : "";
  } catch {
    return "";
  }
}

async function run(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;

  const result = await runResidentAgentCycle({
    source: await readSource(request),
  });
  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
