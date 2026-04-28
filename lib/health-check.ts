// lib/health-check.ts
// Phase 6 — 운영 모니터링 헬스 신호 + 임계치 점검 helper.
// 사용처:
//   - app/api/cron/health-alert/route.ts (매일 09:00 KST 임계치 점검 → 이메일)
//   - app/admin/health/page.tsx (실시간 헬스 신호 4 카드 표시)

import { createAdminClient } from "@/lib/supabase/admin";
// W1 fix (Phase 6 후속) — listUsers 중복 호출 회피.
// 같은 요청 안에서 lib/admin-health 등이 getAuthUsersCached 를 이미 호출했다면
// react cache 가 결과 공유 → round trip 1회.
import { getAuthUsersCached } from "@/lib/admin-stats";

export type HealthSignals = {
  // 24h 신규 가입 수
  signups24h: number;
  // 7d 활성 사용자 수 (last_sign_in_at >= 7d ago)
  active7d: number;
  // 24h 결제 실패·해지 (subscriptions.cancelled_at 24h)
  failed24h: number;
  // 24h cron 실패 알림 건수 (cron_failure_log notified_at)
  cronFailures24h: number;
  // 24h 알림 발송 실패 (alert_deliveries status = 'failed')
  deliveryFailures24h: number;
};

export type ThresholdAlert = {
  key: "low_activity" | "payment_fail" | "cron_fail";
  message: string;
};

const CRON_FAIL_ALERT_THRESHOLD = Number(
  process.env.CRON_FAIL_ALERT_THRESHOLD ?? "3",
);
const ACTIVE_7D_FLOOR = 5;

export async function getHealthSignals(): Promise<HealthSignals> {
  const sb = createAdminClient();
  const since24Iso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7dIso = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // auth.users 24h 신규·7d 활성 — getAuthUsersCached 로 round trip 공유.
  // /admin/health 페이지가 lib/admin-health 와 함께 호출해도 listUsers 1회만.
  const allUsers = await getAuthUsersCached();
  const signups24h = allUsers.filter(
    (u) => u.created_at && u.created_at >= since24Iso,
  ).length;
  const active7d = allUsers.filter(
    (u) => u.last_sign_in_at && u.last_sign_in_at >= since7dIso,
  ).length;

  // 결제 실패 — subscriptions cancelled_at 24h
  const { count: cancelled } = await sb
    .from("subscriptions")
    .select("*", { count: "exact", head: true })
    .gte("cancelled_at", since24Iso);
  const failed24h = cancelled ?? 0;

  // cron 실패 알림 24h (notified_at — 신규 알림 발송된 것)
  const { count: cronCount } = await sb
    .from("cron_failure_log")
    .select("*", { count: "exact", head: true })
    .gte("notified_at", since24Iso);
  const cronFailures24h = cronCount ?? 0;

  // alert_deliveries 실패 24h
  const { count: delCount } = await sb
    .from("alert_deliveries")
    .select("*", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("created_at", since24Iso);
  const deliveryFailures24h = delCount ?? 0;

  return {
    signups24h,
    active7d,
    failed24h,
    cronFailures24h,
    deliveryFailures24h,
  };
}

// 임계치 점검 — health-alert cron 이 호출, 위반 항목만 반환
export function checkThresholds(s: HealthSignals): ThresholdAlert[] {
  const alerts: ThresholdAlert[] = [];

  // 가입 활성도 — 둘 다 충족만 알림 (false positive 방지)
  if (s.signups24h === 0 && s.active7d < ACTIVE_7D_FLOOR) {
    alerts.push({
      key: "low_activity",
      message: `24h 신규 가입 0 + 7d 활성 ${s.active7d}명 (< ${ACTIVE_7D_FLOOR}). 가입 funnel 점검 필요.`,
    });
  }

  // 결제 실패
  if (s.failed24h >= 1) {
    alerts.push({
      key: "payment_fail",
      message: `24h 사용자 해지 ${s.failed24h}건. /admin/insights 확인.`,
    });
  }

  // cron 실패 (환경변수 임계치)
  if (s.cronFailures24h >= CRON_FAIL_ALERT_THRESHOLD) {
    alerts.push({
      key: "cron_fail",
      message: `24h cron 실패 알림 ${s.cronFailures24h}건 (임계치 ${CRON_FAIL_ALERT_THRESHOLD}). /admin/cron-failures 확인.`,
    });
  }

  return alerts;
}
