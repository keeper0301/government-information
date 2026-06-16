import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { logAdminAction } from "@/lib/admin-actions";
import { checkSnsCredentials } from "@/lib/sns/credential-check";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function run() {
  const result = await checkSnsCredentials();
  try {
    await logAdminAction({
      actorId: null,
      action: "sns_credential_check_run",
      details: result,
    });
  } catch (error) {
    console.warn("[sns-credential-check] admin_actions 기록 실패:", (error as Error).message);
  }
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
