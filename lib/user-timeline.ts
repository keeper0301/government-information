// ============================================================
// 사용자 행동 timeline — admin_actions + alert_deliveries + consent_log
// ============================================================
// /admin/users/[userId] 에서 사용자 한 명의 모든 이벤트 시간순 통합.
// 가입 funnel 디버깅·이상 행동 진단·고객 문의 대응에 결정적.
//
// 소스 3종 (subscription_events 미존재라 보류):
//   - admin_actions: 관리자 수행 액션 (target_user_id 기준)
//   - alert_deliveries: 알림톡·이메일 발송 (user_id 기준)
//   - consent_log: 동의 변경 (user_id 기준)
//
// 결과: { kind, ts, summary, detail } 시간순 정렬.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { ACTION_LABELS, type AdminActionType } from "@/lib/admin-actions";

export type TimelineEvent = {
  id: string;
  kind: "admin" | "alert" | "consent";
  ts: string;                    // ISO timestamp
  summary: string;               // 한 줄 요약
  detail?: string;               // 보조 정보 (있으면)
  status?: "ok" | "warn" | "error" | "info";
};

const CONSENT_LABELS: Record<string, string> = {
  privacy_policy: "개인정보처리방침",
  terms: "이용약관",
  marketing: "마케팅 수신",
  sensitive_topic: "민감 주제 동의",
  kakao_messaging: "카카오톡 알림",
};

export async function getUserTimeline(
  userId: string,
  limit = 50,
): Promise<TimelineEvent[]> {
  const admin = createAdminClient();

  const [adminActions, alerts, consents] = await Promise.all([
    admin
      .from("admin_actions")
      .select("id, action, details, created_at")
      .eq("target_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("alert_deliveries")
      .select("id, channel, status, error_code, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("consent_log")
      .select("id, consent_type, version, withdrawn_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const events: TimelineEvent[] = [];

  // admin_actions → 관리자 액션
  for (const r of (adminActions.data ?? []) as {
    id: string;
    action: string;
    details: Record<string, unknown> | null;
    created_at: string;
  }[]) {
    const label = ACTION_LABELS[r.action as AdminActionType] ?? r.action;
    const reason =
      r.details && typeof r.details === "object" && "reason" in r.details
        ? String(r.details.reason)
        : null;
    events.push({
      id: `admin-${r.id}`,
      kind: "admin",
      ts: r.created_at,
      summary: `관리자 액션: ${label}`,
      detail: reason ?? undefined,
      status: "info",
    });
  }

  // alert_deliveries → 알림 발송
  for (const r of (alerts.data ?? []) as {
    id: string;
    channel: string;
    status: string;
    error_code: string | null;
    created_at: string;
  }[]) {
    const channelLabel = r.channel === "kakao" ? "카카오톡" : "이메일";
    const statusLabel =
      r.status === "sent"
        ? "발송 성공"
        : r.status === "failed"
          ? "발송 실패"
          : r.status === "skipped"
            ? "건너뜀"
            : r.status;
    events.push({
      id: `alert-${r.id}`,
      kind: "alert",
      ts: r.created_at,
      summary: `${channelLabel} 알림: ${statusLabel}`,
      detail: r.error_code ?? undefined,
      status:
        r.status === "sent" ? "ok" : r.status === "failed" ? "error" : "warn",
    });
  }

  // consent_log → 동의 변경
  for (const r of (consents.data ?? []) as {
    id: string;
    consent_type: string;
    version: string;
    withdrawn_at: string | null;
    created_at: string;
  }[]) {
    const label = CONSENT_LABELS[r.consent_type] ?? r.consent_type;
    const action = r.withdrawn_at ? "철회" : "동의";
    events.push({
      id: `consent-${r.id}`,
      kind: "consent",
      ts: r.withdrawn_at ?? r.created_at,
      summary: `${label} ${action} (v${r.version})`,
      status: r.withdrawn_at ? "warn" : "ok",
    });
  }

  // 시간순 (최신 먼저)
  return events
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, limit);
}
