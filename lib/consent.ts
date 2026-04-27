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

// ━━━ 광고성 정보 수신동의 정기 확인 (정보통신망법 제50조의8) ━━━
// 광고성 정보 수신 동의는 매 2년마다 사용자에게 의사 확인 의무.
// 미확인 사용자에게는 광고성 정보 발송 중단 + 처리 결과 통지.
// keepioo 의 marketing / kakao_messaging 모두 광고성으로 분류될 가능성이 있어
// 보수적으로 동일 정책 적용.
export const MARKETING_CONSENT_VALID_DAYS = 365 * 2;

// 만료 임박(60일 전) — 마이페이지에 노출하고 사용자에게 갱신 유도.
export const MARKETING_CONSENT_EXPIRY_WARN_DAYS = 60;

// 광고성 분류로 정기 확인 대상이 되는 동의 종류 — hasActiveConsent / 마이페이지
// 패널 / 알림 발송 게이트에서 일관 적용.
const REVALIDATION_REQUIRED: readonly ConsentType[] = [
  "marketing",
  "kakao_messaging",
];

function isRevalidationRequired(type: ConsentType): boolean {
  return (REVALIDATION_REQUIRED as readonly string[]).includes(type);
}

// 동의 시각 + 2년 = 만료 시각. ISO 문자열 또는 null 반환.
// 광고성 외 동의(privacy_policy / terms 등)는 만료 개념 X → null.
// 단위 테스트 가능하도록 export — 광고성 동의 만료 회귀 가드.
export function computeExpiresAt(
  consentType: ConsentType,
  consentedAt: string,
): string | null {
  if (!isRevalidationRequired(consentType)) return null;
  const t = new Date(consentedAt).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(
    t + MARKETING_CONSENT_VALID_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

// 만료까지 남은 일수 — 광고성 동의 60일 임박 안내·자동 만료 처리에 사용.
// expiresAt 이 null 이면 null (만료 개념 없는 동의).
// 음수면 이미 만료됨.
export function computeDaysLeft(
  expiresAt: string | null,
  now: Date = new Date(),
): number | null {
  if (!expiresAt) return null;
  const expMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expMs)) return null;
  return Math.floor((expMs - now.getTime()) / (24 * 60 * 60 * 1000));
}

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
// expiresAt / isExpired: 광고성 동의(2년 만료) 정보를 응용 레이어에서 계산.
export type ConsentStatus = {
  consentType: ConsentType;
  version: string;
  consentedAt: string;
  isActive: boolean;
  /** 광고성 동의에만 채워짐(2년). 그 외엔 null. */
  expiresAt: string | null;
  /** 만료된 광고성 동의는 isExpired=true. 비광고성 동의는 항상 false. */
  isExpired: boolean;
};

export async function getUserConsents(userId: string): Promise<ConsentStatus[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_latest_consent")
    .select("consent_type, version, consented_at, is_active")
    .eq("user_id", userId);

  if (error || !data) return [];

  const now = Date.now();
  return data.map(
    (r: {
      consent_type: ConsentType;
      version: string;
      consented_at: string;
      is_active: boolean;
    }) => {
      const expiresAt = computeExpiresAt(r.consent_type, r.consented_at);
      const isExpired = expiresAt
        ? new Date(expiresAt).getTime() < now
        : false;
      return {
        consentType: r.consent_type,
        version: r.version,
        consentedAt: r.consented_at,
        isActive: r.is_active,
        expiresAt,
        isExpired,
      };
    },
  );
}

// ━━━ 특정 동의가 현재 active 인가? (편의) ━━━
// 만료된 광고성 동의는 자동으로 false → 알림톡·마케팅 메일 발송 게이트에서 차단.
export async function hasActiveConsent(
  userId: string,
  consentType: ConsentType,
  /** 이 버전 이상이어야 인정. 안 주면 종류만 체크. */
  minVersion?: string,
): Promise<boolean> {
  const consents = await getUserConsents(userId);
  const c = consents.find((x) => x.consentType === consentType);
  if (!c || !c.isActive) return false;
  if (c.isExpired) return false; // 광고성 2년 만료 — 정보통신망법 제50조의8
  if (minVersion && c.version < minVersion) return false;
  return true;
}

// ━━━ 광고성 동의 만료 임박(60일 전) 또는 만료된 항목 조회 ━━━
// 마이페이지·홈 배너에서 사용 — 사용자에게 갱신 유도.
export type MarketingConsentExpiry = {
  consentType: "marketing" | "kakao_messaging";
  expiresAt: string;
  daysLeft: number; // 음수면 이미 만료됨
};

export async function getMarketingConsentExpiry(
  userId: string,
): Promise<MarketingConsentExpiry[]> {
  const consents = await getUserConsents(userId);
  const now = Date.now();
  const result: MarketingConsentExpiry[] = [];
  const nowDate = new Date(now);
  for (const c of consents) {
    if (!c.isActive || !c.expiresAt) continue;
    if (c.consentType !== "marketing" && c.consentType !== "kakao_messaging")
      continue;
    const daysLeft = computeDaysLeft(c.expiresAt, nowDate);
    if (daysLeft == null) continue;
    // 만료 임박 또는 이미 만료된 항목만 포함
    if (daysLeft <= MARKETING_CONSENT_EXPIRY_WARN_DAYS) {
      result.push({
        consentType: c.consentType,
        expiresAt: c.expiresAt,
        daysLeft,
      });
    }
  }
  return result;
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
