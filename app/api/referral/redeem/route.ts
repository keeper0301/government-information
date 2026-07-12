// ============================================================
// /api/referral/redeem — 추천 코드 redeem 수동 호출 endpoint
// ============================================================
// 가입 callback 자동 처리가 메인 흐름. 이 endpoint 는 보조용:
//   - 가입 후 ?ref 쿠키가 사라진 사용자가 코드 직접 입력 가능 (UI 미구현이지만 예비)
//   - admin 디버깅
//
// POST body: { code: string }
// 응답: { ok: true, rewardAppliedAt } 또는 { ok: false, reason }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redeemReferral } from "@/lib/referrals";
import {
  isJsonBodyTooLargeError,
  readJsonWithLimit,
} from "@/lib/http/json";

const MAX_REFERRAL_REDEEM_BODY_BYTES = 2 * 1024;

export async function POST(request: NextRequest) {
  // 1) 인증
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 },
    );
  }

  // 2) body 파싱
  let body: { code?: unknown };
  try {
    body = await readJsonWithLimit(request, MAX_REFERRAL_REDEEM_BODY_BYTES);
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: isJsonBodyTooLargeError(err) ? "body_too_large" : "invalid_body" },
      { status: isJsonBodyTooLargeError(err) ? 413 : 400 },
    );
  }

  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code) {
    return NextResponse.json(
      { ok: false, reason: "invalid_code" },
      { status: 400 },
    );
  }

  // 3) redeem — admin client (RLS 우회 필요, INSERT/UPDATE 차단되어 있음)
  const admin = createAdminClient();
  const result = await redeemReferral(admin, code, user.id);

  // ok=false 라도 status 200 으로 reason 전달 (가입 흐름 안 막힘 패턴 일관)
  return NextResponse.json(result);
}
