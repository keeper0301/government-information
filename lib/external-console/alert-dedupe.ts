// ============================================================
// external-console alert per-key 24h dedupe (5/17 G7)
// ============================================================
// 1주차 모니터링 결과 매일 동일 5종 alert (site_slow / solapi_balance_low /
// ga4_no_traffic / supabase_advisor_warn / sc_fetch_failed) 가 사장님 SMS 폭주
// → 메모리 [Phase 3 Vercel + Supabase 2026-05-10] 권고 적용.
//
// admin_actions.external_console_alert_sent row 의 details.alert_key 와 비교 →
// 24h 내 발송된 key 는 다음 cron 에서 skip. 새 key 만 SMS·텔레그램 발송.
// ============================================================

import type { ConsoleAlert } from "@/lib/external-console/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-actions";

export type DedupeResult = {
  active: ConsoleAlert[];     // 새 alert (발송 대상)
  suppressed: string[];    // 24h 내 이미 발송된 key (audit 노출용)
};

/**
 * 24h 내 이미 발송된 alert key 를 제외하고 새 alert 만 반환.
 * admin_actions.external_console_alert_sent row 의 details.alert_key 와 비교.
 *
 * fetch 실패 시 보수적으로 모두 active (SMS 발송 보장 > dedupe 정확).
 */
export async function filterRecentlyAlertedKeys(
  alerts: ConsoleAlert[],
): Promise<DedupeResult> {
  if (alerts.length === 0) return { active: [], suppressed: [] };

  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();

  let recentKeys: Set<string>;
  try {
    const { data } = await admin
      .from("admin_actions")
      .select("details")
      .eq("action", "external_console_alert_sent")
      .gte("created_at", since);
    recentKeys = new Set<string>();
    for (const row of (data ?? []) as Array<{
      details: { alert_key?: string } | null;
    }>) {
      const key = row.details?.alert_key;
      if (key) recentKeys.add(key);
    }
  } catch (e) {
    // 보수적 fallback — fetch 실패 시 dedupe 미적용 (SMS 발송 우선)
    console.warn(
      "[external-console-dedupe] fetch 실패 (모두 active fallback):",
      e instanceof Error ? e.message : String(e),
    );
    return { active: alerts, suppressed: [] };
  }

  return partitionByKey(alerts, recentKeys);
}

// 순수 함수 — 단위 테스트 가능. recentKeys 주입식
export function partitionByKey(
  alerts: ConsoleAlert[],
  recentKeys: Set<string>,
): DedupeResult {
  const active: ConsoleAlert[] = [];
  const suppressed: string[] = [];
  for (const a of alerts) {
    if (recentKeys.has(a.key)) {
      suppressed.push(a.key);
    } else {
      active.push(a);
    }
  }
  return { active, suppressed };
}

/**
 * 발송된 alert key 들을 admin_actions 에 row 1개씩 기록.
 * 실패해도 cron 죽지 않게 try/catch (다음 cron 에서 다시 시도 — 사장님 SMS 보장).
 */
export async function recordAlertsSent(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  for (const key of keys) {
    try {
      await logAdminAction({
        actorId: null,
        action: "external_console_alert_sent",
        details: { alert_key: key },
      });
    } catch (e) {
      console.warn(
        `[external-console-dedupe] alert_sent audit 실패 (${key}):`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }
}
