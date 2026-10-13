import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";

// 예전 미검수 해설의 유료 자동 생성을 중단한다. 기존 자료는 삭제하지 않는다.
function run(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return NextResponse.json({ ok: true, skipped: "미검수 자동 해설 생성 중단",
    next: "정책 원문·해설 검수에서 근거 있는 초안을 작성하고 승인하세요.", published: 0 });
}
export const GET = run;
export const POST = run;
