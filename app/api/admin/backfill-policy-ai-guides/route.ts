import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth-server";
import { backfillPolicyDrafts } from "@/lib/policy/draft-backfill";
export const maxDuration = 60;
// 선택한 정책만 원문 기반 초안으로 만든다. 기존 자동 설명은 그대로 보존한다.
export async function POST(req: Request) {
  if (!await requireAdminUser()) return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!["welfare", "loan"].includes(body.type) || !Array.isArray(body.ids)
    || body.ids.length < 1 || body.ids.length > 10 || body.ids.some((id: unknown) => typeof id !== "string")) {
    return NextResponse.json({ error: "정책 종류와 대상 번호 1~10개가 필요합니다." }, { status: 400 });
  }
  try {
    const table = body.type === "welfare" ? "welfare_programs" : "loan_programs";
    return NextResponse.json({ ok: true, result: await backfillPolicyDrafts(table, 10, body.ids) });
  } catch { return NextResponse.json({ error: "해설 초안 저장소 준비 상태를 확인하세요." }, { status: 503 }); }
}
