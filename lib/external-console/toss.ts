// ============================================================
// 토스 결제 환경 점검 (Phase 3 외부 console)
// ============================================================
// TOSS_SECRET_KEY 가용성 ping + DB subscriptions 24h funnel 종합.
//
// 결제 거래 조회 API 의 정확한 시그니처는 토스 정책 변경에 따라 변하므로
// 보수적으로 "키 인증 ping + DB 기반 funnel 점검" 만 수행.
// 진짜 거래 조회 (transactions list) 가 필요하면 토스 docs 확인 후 별도 spec.
//
// 점검 항목:
//   - TOSS_SECRET_KEY 환경변수 존재 (없으면 skipped — keepioo 결제 비활성)
//   - 24h 신규 활성 구독 (subscriptions.created_at ≥ now-24h AND status='active')
//   - 24h 해지 (이미 health-alert 가 점검하지만 여기선 funnel KPI 로 함께)
//   - 7d 활성 구독 합계 추세 (현재는 KPI 만, alert 없음)
//
// 결제 활동 0건은 정상 (저트래픽). webhook 도달 여부 확인은 별도 spec
// (토스 거래 조회 API + DB subscriptions 비교 필요).
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import type { ConsoleCheckResult, ConsoleAlert } from "./types";

interface FunnelStats {
  new_active_24h: number;
  cancelled_24h: number;
  active_total: number;
}

// pure function — 통계 → alerts/kpis. 단위 테스트 가능.
export function buildTossAlerts(
  stats: FunnelStats,
  hasSecretKey: boolean,
): { alerts: ConsoleAlert[]; kpis: Record<string, unknown> } {
  const alerts: ConsoleAlert[] = [];

  // TOSS_SECRET_KEY 미설정 — 결제 자체 비활성. alert 가 아닌 INFO.
  if (!hasSecretKey) {
    return {
      alerts: [],
      kpis: {
        info: "TOSS_SECRET_KEY 미설정 — 결제 비활성 (skip)",
      },
    };
  }

  // 24h 해지 ≥ 24h 신규 (활성 사용자 감소 추세) — 단 small sample 시 noisy 라
  // 7d 추세 후속 spec 으로. 여기선 24h 해지가 활성 대비 ≥10% 면 alert
  if (
    stats.cancelled_24h >= 1 &&
    stats.active_total > 0 &&
    stats.cancelled_24h / stats.active_total >= 0.1
  ) {
    alerts.push({
      key: "toss_high_churn",
      message: `24h 해지 ${stats.cancelled_24h}건 (활성 ${stats.active_total} 대비 ${Math.round(
        (stats.cancelled_24h / stats.active_total) * 100,
      )}%).`,
      recommendation:
        "/admin/insights 에서 해지 사유·타이밍 확인. 토스 정산 API 직접 점검은 별도 spec",
    });
  }

  return {
    alerts,
    kpis: {
      ...stats,
      churn_rate_24h:
        stats.active_total > 0
          ? Number((stats.cancelled_24h / stats.active_total).toFixed(3))
          : 0,
    },
  };
}

// console checker — cron route 에서 호출. DB 쿼리 위주, 외부 API 호출 최소.
export async function checkToss(): Promise<ConsoleCheckResult> {
  const hasSecretKey = Boolean(process.env.TOSS_SECRET_KEY);

  if (!hasSecretKey) {
    return {
      console: "toss",
      ...buildTossAlerts(
        { new_active_24h: 0, cancelled_24h: 0, active_total: 0 },
        false,
      ),
    };
  }

  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [newActive, cancelled, activeTotal] = await Promise.all([
    admin
      .from("subscriptions")
      .select("user_id", { count: "exact", head: true })
      .eq("status", "active")
      .gte("created_at", since24h),
    admin
      .from("subscriptions")
      .select("user_id", { count: "exact", head: true })
      .gte("cancelled_at", since24h),
    admin
      .from("subscriptions")
      .select("user_id", { count: "exact", head: true })
      .eq("status", "active"),
  ]);

  const stats: FunnelStats = {
    new_active_24h: newActive.count ?? 0,
    cancelled_24h: cancelled.count ?? 0,
    active_total: activeTotal.count ?? 0,
  };

  const result = buildTossAlerts(stats, hasSecretKey);
  return { console: "toss", ...result };
}
