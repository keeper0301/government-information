// ============================================================
// /api/admin/alimtalk-test — 어드민 테스트 발송
// ============================================================
// 용도: Solapi + 카카오 템플릿 심사 통과 후 실제 수신이 가능한지 검증.
// 어드민이 자기 휴대폰 번호 입력 → POLICY_NEW 템플릿을 sendAlimtalk 로 발송.
// 결과(성공·실패·사유) 를 그대로 돌려줘서 어드민 페이지에서 표시.
//
// 설계 원칙:
//   - admin 권한 필수 (ADMIN_EMAILS 환경변수 기반)
//   - alert_deliveries 에는 기록하지 않음 — 테스트 발송은 실제 운영 데이터 아님.
//     대신 admin_actions 테이블에 alimtalk_test 로 기록 (감사 추적용, 번호 마스킹).
//   - body.variables override 허용 — 심사 시 사용한 샘플 데이터와 맞추거나
//     다른 문안 변형을 빠르게 점검 가능.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { sendAlimtalk } from "@/lib/kakao-alimtalk";
import { logAdminAction } from "@/lib/admin-actions";

// 휴대폰 번호 마스킹 — 감사 로그에 원본 저장 금지 (개인정보 최소화).
// 010-1234-5678 → 010****5678, 01012345678 → 010****5678
function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

export async function POST(request: NextRequest) {
  // 1) 인증·권한 체크
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!isAdminUser(user.email)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  // 2) body 파싱
  const body = await request.json().catch(() => ({}));
  const phoneNumber = typeof body?.phoneNumber === "string" ? body.phoneNumber.trim() : "";
  if (!phoneNumber) {
    return NextResponse.json(
      { error: "phoneNumber 를 입력해 주세요." },
      { status: 400 },
    );
  }

  // 3) 변수 — 기본값 + body.variables override
  // 기본값은 심사 통과 후 사장님이 자기 번호로 빠르게 검증 가능한 현실적 샘플.
  const overrides =
    body?.variables && typeof body.variables === "object" ? body.variables : {};
  const variables = {
    rule_name: overrides.rule_name ?? "[테스트] 내 맞춤 알림",
    title: overrides.title ?? "[테스트] 청년 주거 지원 정책 2026",
    deadline: overrides.deadline ?? "2026-12-31",
    detail_path: overrides.detail_path ?? "/mypage/notifications",
  };

  // 4) 발송
  const result = await sendAlimtalk({
    phoneNumber,
    templateCode: "POLICY_NEW",
    variables,
  });

  // 5) 감사 로그 (번호 마스킹). 기록 실패해도 발송 결과는 돌려줌 — 사장님이
  // 결과를 못 보면 테스트 도구로서 가치가 0 이라 fail-open.
  try {
    await logAdminAction({
      actorId: user.id,
      action: "alimtalk_test",
      details: {
        phone_masked: maskPhone(phoneNumber),
        result_ok: result.ok,
        result_reason: result.ok ? null : result.reason,
        result_error: result.ok
          ? null
          : "error" in result && result.error
            ? result.error.slice(0, 200)
            : null,
      },
    });
  } catch (e) {
    console.warn("[alimtalk-test] admin_actions 기록 실패:", e);
  }

  return NextResponse.json({ result });
}
