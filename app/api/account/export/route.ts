// ============================================================
// 내 개인정보 내보내기 API — /api/account/export
// ============================================================
// 「개인정보 보호법」 제35조(열람권)·제35조의2(전송요구권) 대응.
// 본인 인증된 사용자가 자신의 모든 식별 데이터를 JSON 으로 다운로드.
//
// 흐름:
//   1) 본인 세션 검증 → 401 차단
//   2) auth.users + 사용자 식별 데이터를 가진 모든 테이블에서 user_id 일치 row 만 select
//   3) 한 번의 JSON 객체로 묶어 첨부 다운로드 헤더와 함께 반환
//
// 보안 주의:
//   - admin client 로 select 하지만 모든 쿼리에 user_id = 본인 id 조건 강제
//   - alert_deliveries 같이 행이 많은 테이블은 최근 1000건만 (전체 dump 부하 방지)
//   - 다른 사용자 data 가 절대 섞이지 않도록 본인 user_id 외 필터 추가 X
//
// 응답:
//   Content-Type: application/json
//   Content-Disposition: attachment; filename="keepioo-mydata-{date}.json"
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// alert_deliveries 같이 한 사용자에 수백~수천건 쌓일 수 있는 테이블은 상한 둠.
// 1000 건이면 일반 사용자가 1년 알림을 모두 받아도 충분하고, 응답 크기도 안전.
const HISTORY_ROW_LIMIT = 1000;

export async function GET() {
  // 1) 본인 세션 검증
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "로그인이 필요해요." },
      { status: 401 },
    );
  }

  const admin = createAdminClient();
  const userId = user.id;

  // 2) 식별 데이터 보유 테이블 모두 select — 모든 쿼리에 user_id 조건 강제
  const [
    profile,
    business,
    alertRules,
    alertDeliveries,
    bookmarks,
    subscription,
    payments,
    consents,
    pending,
    aiUsage,
  ] = await Promise.all([
    admin.from("user_profiles").select("*").eq("user_id", userId),
    admin.from("business_profiles").select("*").eq("user_id", userId),
    admin.from("user_alert_rules").select("*").eq("user_id", userId),
    admin
      .from("alert_deliveries")
      .select("*")
      .eq("user_id", userId)
      .order("sent_at", { ascending: false })
      .limit(HISTORY_ROW_LIMIT),
    admin.from("user_bookmarks").select("*").eq("user_id", userId),
    admin.from("subscriptions").select("*").eq("user_id", userId),
    admin
      .from("payment_history")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_ROW_LIMIT),
    admin
      .from("consent_log")
      .select("*")
      .eq("user_id", userId)
      .order("consented_at", { ascending: false }),
    admin.from("pending_deletions").select("*").eq("user_id", userId),
    admin
      .from("ai_usage_log")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(HISTORY_ROW_LIMIT),
  ]);

  // 3) 응답 본문 — auth.users 의 민감 필드(비밀번호 해시·세션 등)는 노출하지 않음.
  // 사용자 본인이 가진 정보만 골라 담는다.
  const exportPayload = {
    meta: {
      exported_at: new Date().toISOString(),
      service: "keepioo.com",
      legal_basis: "「개인정보 보호법」 제35조 열람권",
      note:
        "본 파일은 회원 본인이 keepioo.com 에서 직접 다운로드한 개인정보 사본입니다. " +
        "외부에 공유 시 개인정보가 유출될 수 있으니 안전한 곳에 보관하세요.",
      history_row_limit: HISTORY_ROW_LIMIT,
    },
    account: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at ?? null,
      provider:
        (user.app_metadata as { provider?: string } | null)?.provider ?? null,
      user_metadata: user.user_metadata ?? null,
    },
    user_profiles: profile.data ?? [],
    business_profiles: business.data ?? [],
    user_alert_rules: alertRules.data ?? [],
    alert_deliveries: alertDeliveries.data ?? [],
    user_bookmarks: bookmarks.data ?? [],
    subscriptions: subscription.data ?? [],
    payment_history: payments.data ?? [],
    consent_log: consents.data ?? [],
    pending_deletions: pending.data ?? [],
    ai_usage_log: aiUsage.data ?? [],
  };

  // 다운로드 파일명은 날짜 + user_id 앞 8자 — 사용자가 여러 번 받아도 구분 가능
  const datePart = new Date().toISOString().slice(0, 10);
  const idPart = user.id.slice(0, 8);
  const filename = `keepioo-mydata-${datePart}-${idPart}.json`;

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
