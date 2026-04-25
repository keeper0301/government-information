// ============================================================
// 동의 기록 헬퍼
// ============================================================
// 개인정보처리방침·약관·마케팅·민감토픽·카톡 알림 동의를 일관되게 기록.
//
// 사용 예 (server action 또는 API route):
//   import { recordConsent, PRIVACY_POLICY_VERSION } from '@/lib/consent';
//   await recordConsent({
//     userId: user.id,
//     consentType: 'privacy_policy',
//     version: PRIVACY_POLICY_VERSION,
//     fullText: PRIVACY_POLICY_TEXT,
//   });
//
// 모든 함수는 server-side 전용 (admin client 사용 — RLS 우회).
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

// ━━━ 방침/약관 현재 버전 ━━━
// 이 상수만 바꾸면 사용자에게 재동의 요청.
// 본문이 바뀌면 반드시 같이 변경.
export const PRIVACY_POLICY_VERSION = "2026-04-25";
export const TERMS_VERSION = "2026-04-22";
export const KAKAO_MESSAGING_VERSION = "2026-04-24";

export type ConsentType =
  | "privacy_policy"
  | "terms"
  | "marketing"
  | "sensitive_topic"
  | "kakao_messaging";

export type RecordConsentInput = {
  userId: string;
  consentType: ConsentType;
  version: string;
  /** 동의 시점의 방침/약관 전문 (개정 시점에도 입증 가능하도록) */
  fullText?: string;
  ipAddress?: string;
  userAgent?: string;
};

// ━━━ 동의 기록 ━━━
// 같은 (user, type) 에 새 동의가 들어오면 그 자체로 최신값이 됨 (DELETE 안 함).
// 철회 후 재동의도 새 row 생성 → user_latest_consent view 가 자동 정리.
export async function recordConsent(input: RecordConsentInput): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("consent_log").insert({
    user_id: input.userId,
    consent_type: input.consentType,
    version: input.version,
    full_text: input.fullText ?? null,
    ip_address: input.ipAddress ?? null,
    user_agent: input.userAgent ?? null,
  });
  if (error) {
    // 동의 기록 실패는 운영 위험 — 호출자가 try/catch 해야 함
    throw new Error(`consent 기록 실패: ${error.message}`);
  }
}

// ━━━ 동의 철회 ━━━
// row 삭제 X — withdrawn_at 만 채움. 감사 추적 보존.
// 같은 (user, type) 의 가장 최근 동의 1행만 영향.
export async function withdrawConsent(
  userId: string,
  consentType: ConsentType,
): Promise<void> {
  const admin = createAdminClient();
  // 가장 최근 active 동의 row 의 withdrawn_at 갱신
  const { data: latest } = await admin
    .from("consent_log")
    .select("id")
    .eq("user_id", userId)
    .eq("consent_type", consentType)
    .is("withdrawn_at", null)
    .order("consented_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) return; // 동의 자체가 없거나 이미 철회됨

  await admin
    .from("consent_log")
    .update({ withdrawn_at: new Date().toISOString() })
    .eq("id", latest.id);
}

// ━━━ 현재 동의 상태 조회 ━━━
// user_latest_consent view 사용 — DISTINCT ON 으로 사용자 × 종류별 최신 1행.
export type ConsentStatus = {
  consentType: ConsentType;
  version: string;
  consentedAt: string;
  isActive: boolean;
};

export async function getUserConsents(userId: string): Promise<ConsentStatus[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_latest_consent")
    .select("consent_type, version, consented_at, is_active")
    .eq("user_id", userId);

  if (error || !data) return [];

  return data.map(
    (r: {
      consent_type: ConsentType;
      version: string;
      consented_at: string;
      is_active: boolean;
    }) => ({
      consentType: r.consent_type,
      version: r.version,
      consentedAt: r.consented_at,
      isActive: r.is_active,
    }),
  );
}

// ━━━ 특정 동의가 현재 active 인가? (편의) ━━━
export async function hasActiveConsent(
  userId: string,
  consentType: ConsentType,
  /** 이 버전 이상이어야 인정. 안 주면 종류만 체크. */
  minVersion?: string,
): Promise<boolean> {
  const consents = await getUserConsents(userId);
  const c = consents.find((x) => x.consentType === consentType);
  if (!c || !c.isActive) return false;
  if (minVersion && c.version < minVersion) return false;
  return true;
}

// ━━━ 재동의가 필요한지 체크 ━━━
// 필수 동의(privacy_policy, terms) 중 active 가 아니거나 버전이 현재보다 낮으면 needs=true.
// - 2026-04-24 이전 가입자 (consent_log 없음) → 둘 다 missing
// - 이미 동의했지만 방침 개정 후 → missing 에 포함
// 루트 layout 에서 호출해 배너 렌더 조건으로 사용.
export async function needsReconsent(userId: string): Promise<{
  needs: boolean;
  missing: Array<"privacy_policy" | "terms">;
}> {
  const consents = await getUserConsents(userId);

  const missing: Array<"privacy_policy" | "terms"> = [];

  const p = consents.find(
    (c) => c.consentType === "privacy_policy" && c.isActive,
  );
  if (!p || p.version < PRIVACY_POLICY_VERSION) missing.push("privacy_policy");

  const t = consents.find((c) => c.consentType === "terms" && c.isActive);
  if (!t || t.version < TERMS_VERSION) missing.push("terms");

  return { needs: missing.length > 0, missing };
}
