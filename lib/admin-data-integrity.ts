// ============================================================
// 데이터 일관성 모니터링 — orphan FK / 만료 cron 탐지
// ============================================================
// /admin/health 5번째 섹션. Supabase advisor 외부 API 없이도 DB 자체
// query 만으로 가능한 정합성 체크. 정상 운영이면 모두 0건.
//
// 항목:
//   1. user_profiles orphan — auth.users 에 없는 user_id 의 profile
//   2. subscriptions orphan — auth.users 에 없는 user_id 의 구독
//   3. user_alert_rules orphan — auth.users 에 없는 user_id 의 규칙
//   4. pending_deletions overdue — expires_at < now() 인데 still pending
//      (cron /api/finalize-deletions 실패 신호)
//
// 비용: getAuthUsersCached (react cache 라 페이지 1회 fetch) + 3 SELECT user_id
// + 1 SELECT count head:true. 사용자 100명 미만 운영 트래픽에서는 무시 가능.
// 사용자 1000명 넘으면 listUsers perPage 페이지네이션 필요 — 후속.
// ============================================================

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUsersCached } from "@/lib/admin-stats";

export type IntegrityCheckItem = {
  label: string;
  value: string;
  status: "ok" | "warn" | "error" | "info";
  hint?: string;
};

export const getDataIntegritySnapshot = cache(
  async (): Promise<IntegrityCheckItem[]> => {
    const admin = createAdminClient();

    const [authUsers, profiles, subs, rules, overdueDel] = await Promise.all([
      getAuthUsersCached(),
      admin.from("user_profiles").select("user_id"),
      admin.from("subscriptions").select("user_id"),
      admin.from("user_alert_rules").select("user_id"),
      admin
        .from("pending_deletions")
        .select("user_id", { count: "exact", head: true })
        .lt("expires_at", new Date().toISOString()),
    ]);

    // auth.users.id Set — 비교 키
    const authIds = new Set(authUsers.map((u) => u.id));

    // 각 테이블의 user_id 중 auth.users 에 없는 row 카운트
    function countOrphans(
      rows: { user_id: string | null }[] | null | undefined,
    ): number {
      if (!rows) return 0;
      return rows.filter((r) => r.user_id && !authIds.has(r.user_id)).length;
    }

    const profileOrphans = countOrphans(profiles.data);
    const subOrphans = countOrphans(subs.data);
    const ruleOrphans = countOrphans(rules.data);
    const overdueCount = overdueDel.count ?? 0;

    return [
      {
        label: "user_profiles 정합성",
        value: profileOrphans === 0 ? "정상" : `orphan ${profileOrphans}건`,
        // profile orphan 은 CASCADE FK 가 있으면 0 — 발생 시 마이그레이션 점검
        status:
          profileOrphans === 0 ? "ok" : profileOrphans <= 2 ? "warn" : "error",
        hint:
          profileOrphans === 0
            ? "auth.users 와 동기화"
            : "탈퇴 사용자 profile 잔존 — CASCADE FK 누락 또는 수동 정리 필요",
      },
      {
        label: "subscriptions 정합성",
        value: subOrphans === 0 ? "정상" : `orphan ${subOrphans}건`,
        // subscription orphan 은 결제 정합성 위험 — 즉시 error
        status: subOrphans === 0 ? "ok" : "error",
        hint:
          subOrphans === 0
            ? "결제 정합성 OK"
            : "탈퇴 사용자 구독 잔존 — 토스 빌링키 미해지 위험",
      },
      {
        label: "user_alert_rules 정합성",
        value: ruleOrphans === 0 ? "정상" : `orphan ${ruleOrphans}건`,
        // rule orphan 은 발송 시 무시되지만 운영 청결 권장
        status: ruleOrphans === 0 ? "ok" : "warn",
        hint:
          ruleOrphans === 0
            ? "알림 규칙 정합성 OK"
            : "탈퇴 사용자 규칙 잔존 — 발송 시 무시되지만 수동 정리 권장",
      },
      {
        label: "pending_deletions 만료",
        value: overdueCount === 0 ? "정상" : `${overdueCount}건 미처리`,
        // overdue 는 cron 실패 신호 — 즉시 error
        status: overdueCount === 0 ? "ok" : "error",
        hint:
          overdueCount === 0
            ? "/api/finalize-deletions cron 정상"
            : "30일 만료 됐는데 still pending — cron 실패 점검",
      },
    ];
  },
);
