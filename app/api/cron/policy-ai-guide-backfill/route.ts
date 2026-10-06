import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { backfillPolicyDrafts } from "@/lib/policy/draft-backfill";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
// 대량 자동 발행 대신 원문이 있는 신규 자료의 검수 전 초안만 저장한다.
async function run(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ ok: true, skipped: "설명 생성 설정 미준비" });
  try {
    const welfare = await backfillPolicyDrafts("welfare_programs", 10, undefined, 110000);
    const loan = await backfillPolicyDrafts("loan_programs", 10, undefined, 110000);
    return NextResponse.json({ ok: true, published: 0, welfare, loan });
  } catch { return NextResponse.json({ error: "해설 초안 저장소 준비 상태를 확인하세요." }, { status: 503 }); }
}
export const GET = run;
export const POST = run;
