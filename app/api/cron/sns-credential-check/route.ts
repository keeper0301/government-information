import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { checkSnsCredentials } from "@/lib/sns/credential-check";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function run() {
  const result = await checkSnsCredentials();
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
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
