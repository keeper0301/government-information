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

export type QuotaFeature = "ai_chat" | "recommend";

// 기능별 일일 제한 정의. 가격표와 같은 단일 소스.
const QUOTAS: Record<QuotaFeature, Record<Tier, number>> = {
  ai_chat: {
    free: 5,
    basic: 5,
    pro: Infinity, // 프로는 카운터 안 올림 (RPC 호출 자체 스킵)
  },
  recommend: {
    free: 5,
    basic: Infinity, // 베이직 이상: 맞춤 추천 무제한
    pro: Infinity,
  },
};

// 결과 타입 — 호출자가 분기 처리하기 쉽게 4가지로 나눔
export type QuotaResult =
  | { ok: true; remaining: number; tier: Tier }
  | { ok: false; reason: "over_limit"; tier: Tier; limit: number }
  | { ok: false; reason: "fail_open"; tier: Tier; error?: string };

function getKstDate(): string {
  // 한국 시간(KST) 기준 오늘 날짜 — 자정에 카운터가 리셋되는 의미.
  // Vercel 서버는 UTC 라 +9시간 더해서 KST 변환.
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kstNow.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function checkAndConsumeFeatureQuota(
  userId: string,
  feature: QuotaFeature,
): Promise<QuotaResult> {
  const tier = await getUserTier(userId);
  const limit = QUOTAS[feature][tier];

  // 무제한 티어 — 카운터 안 올리고 통과해서 DB 부하·라운드트립 절약.
  if (limit === Infinity) {
    return { ok: true, remaining: Infinity, tier };
  }

  const admin = createAdminClient();

  try {
    // 신규 generic RPC. DDL 117 미적용 환경에서는 아래 fallback 으로 기존 AI quota 유지.
    const { data, error } = await admin.rpc("increment_feature_usage", {
      p_user_id: userId,
      p_feature: feature,
      p_date: getKstDate(),
    });

    if (error) {
      // DDL 117 적용 전 production 에서 AI 상담 기존 기능이 풀리지 않도록 legacy RPC fallback.
      if (feature === "ai_chat") {
        const legacy = await admin.rpc("increment_ai_usage", {
          p_user_id: userId,
          p_date: getKstDate(),
        });
        if (!legacy.error) {
          const legacyCount = typeof legacy.data === "number" ? legacy.data : 0;
          if (legacyCount > limit) {
            return { ok: false, reason: "over_limit", tier, limit };
          }
          return { ok: true, remaining: limit - legacyCount, tier };
        }
      }

      // CEO Q4: Fail-open. 비용 안전망은 provider Hard limit 으로 별도 확보.
      console.warn(`[quota] ${feature} DB error, fail-open:`, error.message);
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
    console.warn(`[quota] ${feature} exception, fail-open:`, msg);
    return { ok: false, reason: "fail_open", tier, error: msg };
  }
}

// ============================================================
// AI 채팅 quota 체크 + 소비
// ============================================================
// 무료/베이직: 5회/일. 프로: 무제한.
// ============================================================
export async function checkAndConsumeAiQuota(userId: string): Promise<QuotaResult> {
  return checkAndConsumeFeatureQuota(userId, "ai_chat");
}

// ============================================================
// 맞춤 추천 quota 체크 + 소비
// ============================================================
// 무료: 5회/일. 베이직/프로: 무제한.
// ============================================================
export async function checkAndConsumeRecommendQuota(userId: string): Promise<QuotaResult> {
  return checkAndConsumeFeatureQuota(userId, "recommend");
}
