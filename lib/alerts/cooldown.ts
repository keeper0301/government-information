// ============================================================
// health-alert cooldown — 같은 alert key 가 N시간 안에 SMS 발화 됐으면 skip
// ============================================================
// 사장님 100% 자동화 정신 — SMS noise 차단.
// 매일 같은 alert (예: policy_inflow_zero 가 12일 연속) 으로 사장님 SMS
// 피로도 → unsubscribe 위험. cooldown 으로 같은 key 는 ALERT_COOLDOWN_HOURS
// 안에 1번만 SMS.
//
// 정책:
// - audit 은 항상 기록 (admin_actions.health_alert_run) — 흔적은 모두 남음
// - SMS 만 cooldown 적용 — 발화한 alert 도 audit details.alertKeys 에 있음
// - 새 alert key (이번 처음 발화) 는 항상 통과
// - 같은 key 가 ALERT_COOLDOWN_HOURS 안 발화 흔적 있으면 SMS 에서 제외
// - cooldown=0 → 비활성 (기존 동작 유지)
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import type { ThresholdAlert } from "@/lib/health-check";

const COOLDOWN_HOURS = Number(process.env.ALERT_COOLDOWN_HOURS ?? "72");

// admin_actions 의 health_alert_run audit 에서 N시간 안에 SMS 발화된 alert key 집합 조회.
// 실패해도 빈 Set 반환 — cooldown 안 적용 (안전 default: 알림 빠지는 것보다 폭주가 나음).
//
// 중요 (codex P1 fix): `details.smsAlertKeys` 만 봄. `alertKeys` (전체 발화)
// 를 보면 cooldown 으로 suppress 된 alert 도 cooldown 갱신 → 영원히 SMS mute
// 사고. `smsAlertKeys` = 실제 SMS 발송된 key 만 → cooldown 정확.
// 구 audit row (smsAlertKeys 없음) 는 backward compat 으로 alertKeys 사용.
// 새 코드 deploy 후 72h 지나면 자동으로 새 audit 만 보게 됨.
export async function getRecentlyFiredAlertKeys(
  cooldownHours: number = COOLDOWN_HOURS,
): Promise<Set<string>> {
  if (cooldownHours <= 0) return new Set(); // 비활성
  try {
    const admin = createAdminClient();
    const sinceIso = new Date(
      Date.now() - cooldownHours * 3600_000,
    ).toISOString();
    const { data, error } = await admin
      .from("admin_actions")
      .select("details")
      .eq("action", "health_alert_run")
      .gte("created_at", sinceIso);
    if (error) {
      console.warn("[alert-cooldown] fetch fail:", error.message);
      return new Set();
    }
    const fired = new Set<string>();
    for (const row of data ?? []) {
      const d = row.details as
        | { smsAlertKeys?: string[]; alertKeys?: string[] }
        | null;
      // smsAlertKeys 우선 (새 audit). 없으면 alertKeys (구 audit, backward compat).
      const keys = d?.smsAlertKeys ?? d?.alertKeys;
      if (Array.isArray(keys)) {
        for (const k of keys) fired.add(k);
      }
    }
    return fired;
  } catch (e) {
    console.warn("[alert-cooldown] error:", (e as Error).message);
    return new Set();
  }
}

// pure 함수 — alerts 중 firedKeys 에 있는 key 는 SMS 에서 제외.
// audit 은 별도 (호출자가 모든 alert audit 후 이 함수로 SMS 용 filter).
export function filterAlertsByCooldown(
  alerts: ThresholdAlert[],
  recentlyFiredKeys: Set<string>,
): { smsAlerts: ThresholdAlert[]; suppressedKeys: string[] } {
  const smsAlerts: ThresholdAlert[] = [];
  const suppressedKeys: string[] = [];
  for (const a of alerts) {
    if (recentlyFiredKeys.has(a.key)) {
      suppressedKeys.push(a.key);
    } else {
      smsAlerts.push(a);
    }
  }
  return { smsAlerts, suppressedKeys };
}
