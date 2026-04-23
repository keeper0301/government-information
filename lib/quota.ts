// ============================================================
// 일일 사용량 제한 (quota) 가드
// ============================================================
// 가격표 약속을 실제로 강제하는 헬퍼.
// 현재는 AI 정책 상담만 지원 — 무료/베이직: 5회/일, 프로: 무제한.
//
// 사용 예 (/api/chatbot/route.ts):
//   const quota = await checkAndConsumeAiQuota(user.id);
//   if (!quota.ok && quota.reason === 'over_limit') {
//     return NextResponse.json({ ... }, { status: 429 });
//   }
//
// CEO 리뷰 Q4 결정 (Codex 검토 후 변경):
//   DB 장애 시 Fail-open + 경고 로그.
//   채팅 신뢰가 비용 폭주 위험보다 우선이라는 판단.
//   비용 안전망은 OpenAI Billing 의 Hard limit 으로 별도 확보.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { getUserTier, type Tier } from "@/lib/subscription";

// 기능별 일일 제한 정의. 추가될 때 여기에 한 줄.
const QUOTAS: Record<"ai_chat", Record<Tier, number>> = {
  ai_chat: {
    free:  5,
    basic: 5,
    pro:   Infinity, // 프로는 카운터 안 올림 (RPC 호출 자체 스킵)
  },
};

// 결과 타입 — 호출자가 분기 처리하기 쉽게 4가지로 나눔
export type QuotaResult =
  | { ok: true;  remaining: number;     tier: Tier; }
  | { ok: false; reason: "over_limit";  tier: Tier; limit: number; }
  | { ok: false; reason: "fail_open";   tier: Tier; error?: string; };

// ============================================================
// AI 채팅 quota 체크 + 소비
// ============================================================
// 1) 사용자 티어 조회
// 2) 프로면 카운터 안 올리고 통과 (성능)
// 3) 무료/베이직이면 atomic UPSERT(+1) 후 limit 비교
// 4) DB 장애 시 fail-open (경고 로그 + 통과 신호 따로 표시)
// ============================================================
export async function checkAndConsumeAiQuota(userId: string): Promise<QuotaResult> {
  const tier = await getUserTier(userId);
  const limit = QUOTAS.ai_chat[tier];

  // 프로 — 무제한. RPC 호출 자체를 스킵해서 DB 부하·라운드트립 절약.
  if (limit === Infinity) {
    return { ok: true, remaining: Infinity, tier };
  }

  // 한국 시간(KST) 기준 오늘 날짜 — 자정에 카운터가 리셋되는 의미.
  // Vercel 서버는 UTC 라 +9시간 더해서 KST 변환.
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = kstNow.toISOString().slice(0, 10); // YYYY-MM-DD

  const admin = createAdminClient();

  try {
    // Atomic UPSERT(+1) — race condition 안전.
    // 같은 사용자가 두 탭에서 동시에 호출해도 중복 증가 없음.
    const { data, error } = await admin.rpc("increment_ai_usage", {
      p_user_id: userId,
      p_date: today,
    });

    if (error) {
      // CEO Q4: Fail-open. 비용 안전망은 OpenAI Hard limit 으로 별도 확보.
      console.warn("[quota] ai_chat DB error, fail-open:", error.message);
      return { ok: false, reason: "fail_open", tier, error: error.message };
    }

    const newCount = typeof data === "number" ? data : 0;

    if (newCount > limit) {
      return { ok: false, reason: "over_limit", tier, limit };
    }

    return { ok: true, remaining: limit - newCount, tier };
  } catch (e) {
    // 네트워크 단절·타임아웃 등 예외도 fail-open
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[quota] ai_chat exception, fail-open:", msg);
    return { ok: false, reason: "fail_open", tier, error: msg };
  }
}
