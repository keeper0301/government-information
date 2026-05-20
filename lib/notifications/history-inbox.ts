import {
  scoreProgram,
  type ScorableItem,
} from "@/lib/personalization/score";
import type { MatchSignal, UserSignals } from "@/lib/personalization/types";
import type { PolicyInboxProgramRef } from "@/lib/notifications/policy-inbox-state";

export const NOTIFICATION_HISTORY_PER_PAGE = 30;

export type HistoryStatusParam = "all" | "sent" | "failed" | "pending";
export type HistoryPeriodParam = "7d" | "30d" | "all";

export type NotificationHistoryState = {
  page: number;
  offset: number;
  statusParam: HistoryStatusParam;
  periodParam: HistoryPeriodParam;
  q?: string;
};

export type NotificationDelivery = {
  id: string;
  program_table: string | null;
  program_id: string | null;
  program_title: string | null;
  channel: string | null;
  status: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
};

export type NotificationPolicy = ScorableItem;

export type DeliveryStatusTone = "success" | "danger" | "warning" | "neutral";

export type DeliveryStatusMeta = {
  label: string;
  tone: DeliveryStatusTone;
  badgeClassName: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function statusToDb(status: string): "sent" | "failed" | "queued" | null {
  if (status === "sent") return "sent";
  if (status === "failed") return "failed";
  if (status === "pending") return "queued";
  return null;
}

export function periodToStartIso(period: string, now = new Date()): string | null {
  if (period !== "7d" && period !== "30d") return null;

  const date = new Date(now);
  date.setDate(date.getDate() - (period === "7d" ? 7 : 30));
  return date.toISOString();
}

export function normalizeHistorySearchParams(
  params: {
    page?: string;
    status?: string;
    period?: string;
    q?: string;
  },
  perPage = NOTIFICATION_HISTORY_PER_PAGE,
): NotificationHistoryState {
  const parsedPage = Number.parseInt(params.page || "1", 10);
  const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  const statusParam: HistoryStatusParam =
    params.status === "sent" ||
    params.status === "failed" ||
    params.status === "pending"
      ? params.status
      : "all";
  const periodParam: HistoryPeriodParam =
    params.period === "7d" || params.period === "all" ? params.period : "30d";
  const q = params.q?.trim() ? params.q.trim().slice(0, 100) : undefined;

  return {
    page,
    offset: (page - 1) * perPage,
    statusParam,
    periodParam,
    q,
  };
}

export function buildNotificationHistoryUrl(
  state: NotificationHistoryState,
  overrides: Partial<Record<"page" | "status" | "period" | "q" | "box", string>>,
): string {
  const next: Record<string, string> = {
    page: String(state.page),
    ...(state.statusParam !== "all" ? { status: state.statusParam } : {}),
    ...(state.periodParam !== "30d" ? { period: state.periodParam } : {}),
    ...(state.q ? { q: state.q } : {}),
    ...overrides,
  };

  if (next.status === "all") delete next.status;
  if (next.period === "30d") delete next.period;
  if (!next.q) delete next.q;
  if (next.page === "1") delete next.page;

  const qs = new URLSearchParams(next).toString();
  return qs ? `/mypage/notifications/history?${qs}` : "/mypage/notifications/history";
}

export function groupDeliveryPolicyIds(deliveries: NotificationDelivery[]): {
  welfareIds: string[];
  loanIds: string[];
} {
  const welfareIds = new Set<string>();
  const loanIds = new Set<string>();

  for (const delivery of deliveries) {
    if (!delivery.program_id) continue;
    if (delivery.program_table === "welfare_programs") {
      welfareIds.add(delivery.program_id);
    } else if (delivery.program_table === "loan_programs") {
      loanIds.add(delivery.program_id);
    }
  }

  return {
    welfareIds: [...welfareIds],
    loanIds: [...loanIds],
  };
}

export function buildDeliveryPolicyRefOrFilter(
  refs: PolicyInboxProgramRef[],
): string | null {
  const welfareIds = new Set<string>();
  const loanIds = new Set<string>();

  for (const ref of refs) {
    if (!UUID_RE.test(ref.program_id)) continue;
    if (ref.program_type === "welfare") {
      welfareIds.add(ref.program_id);
    } else if (ref.program_type === "loan") {
      loanIds.add(ref.program_id);
    }
  }

  const parts: string[] = [];
  if (welfareIds.size > 0) {
    parts.push(
      `and(program_table.eq.welfare_programs,program_id.in.(${[...welfareIds].join(",")}))`,
    );
  }
  if (loanIds.size > 0) {
    parts.push(
      `and(program_table.eq.loan_programs,program_id.in.(${[...loanIds].join(",")}))`,
    );
  }

  return parts.length > 0 ? parts.join(",") : null;
}

export function buildDeliveryHref(delivery: NotificationDelivery): string {
  if (!delivery.program_id) return "/policy";
  if (delivery.program_table === "welfare_programs") {
    return `/welfare/${delivery.program_id}`;
  }
  if (delivery.program_table === "loan_programs") {
    return `/loan/${delivery.program_id}`;
  }
  return "/policy";
}

export function getDeliveryStatusMeta(status: string | null): DeliveryStatusMeta {
  if (status === "sent") {
    return {
      label: "도착",
      tone: "success",
      badgeClassName: "bg-emerald-50 text-emerald-700 border-emerald-100",
    };
  }
  if (status === "failed") {
    return {
      label: "실패",
      tone: "danger",
      badgeClassName: "bg-red-50 text-red-700 border-red-100",
    };
  }
  if (status === "queued") {
    return {
      label: "대기",
      tone: "warning",
      badgeClassName: "bg-amber-50 text-amber-700 border-amber-100",
    };
  }
  return {
    label: "제외",
    tone: "neutral",
    badgeClassName: "bg-grey-50 text-grey-600 border-grey-100",
  };
}

export function getDeliveryChannelLabel(channel: string | null): string {
  if (channel === "email") return "이메일";
  if (channel === "kakao") return "알림톡";
  if (channel === "push") return "푸시";
  if (channel === "sms") return "문자";
  return channel || "알림";
}

export function getDeliveryReasonSignals(
  policy: NotificationPolicy | undefined,
  userSignals: UserSignals | null | undefined,
): MatchSignal[] {
  if (!policy || !userSignals) return [];
  return scoreProgram(policy, userSignals).signals;
}
