import { createAdminClient } from "@/lib/supabase/admin";

export type SnsLeadVariant = "lead_0" | "lead_1" | "lead_2" | "lead_3" | "lead_4" | "lead_5";
export type SnsLeadPolicyStatus = "active" | "paused";
export type SnsChallengerTrafficPct = 20 | 35 | 50;

export type SnsLeadPolicy = {
  content: SnsLeadVariant;
  status: SnsLeadPolicyStatus;
  reason: string | null;
  updatedAt: string | null;
};

export type SnsLeadPolicySnapshot = {
  policies: SnsLeadPolicy[];
  disabledLeadVariants: SnsLeadVariant[];
  challengerTrafficPct: SnsChallengerTrafficPct;
  challengerTrafficReason: string | null;
  challengerTrafficUpdatedAt: string | null;
  warning: string | null;
};

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

type AdminActionLeadPolicyRow = {
  action?: string | null;
  details: Record<string, unknown> | null;
  created_at: string | null;
};

export const LEAD_VARIANTS: SnsLeadVariant[] = ["lead_0", "lead_1", "lead_2", "lead_3", "lead_4", "lead_5"];
export const DEFAULT_ACTIVE_LEAD_VARIANTS: SnsLeadVariant[] = ["lead_0", "lead_1", "lead_2"];
export const CHALLENGER_LEAD_VARIANTS: SnsLeadVariant[] = ["lead_3", "lead_4", "lead_5"];
export const CHALLENGER_LEAD_TRAFFIC_PCT: SnsChallengerTrafficPct = 20;
export const CHALLENGER_LEAD_TRAFFIC_STAGES: SnsChallengerTrafficPct[] = [20, 35, 50];

function isLeadVariant(value: unknown): value is SnsLeadVariant {
  return LEAD_VARIANTS.includes(value as SnsLeadVariant);
}

function isPolicyStatus(value: unknown): value is SnsLeadPolicyStatus {
  return value === "active" || value === "paused";
}

function isChallengerTrafficPct(value: unknown): value is SnsChallengerTrafficPct {
  return CHALLENGER_LEAD_TRAFFIC_STAGES.includes(Number(value) as SnsChallengerTrafficPct);
}

function defaultPolicies(): SnsLeadPolicy[] {
  return LEAD_VARIANTS.map((content) => ({
    content,
    status: DEFAULT_ACTIVE_LEAD_VARIANTS.includes(content) ? "active" : "paused",
    reason: DEFAULT_ACTIVE_LEAD_VARIANTS.includes(content) ? null : "신규 challenger 후보: 관리자 승인 전까지 자동 발행 제외",
    updatedAt: null,
  }));
}

export function buildLeadPolicySnapshot(rows: AdminActionLeadPolicyRow[]): SnsLeadPolicySnapshot {
  const byContent = new Map<SnsLeadVariant, SnsLeadPolicy>();
  let challengerTrafficPct: SnsChallengerTrafficPct = CHALLENGER_LEAD_TRAFFIC_PCT;
  let challengerTrafficReason: string | null = null;
  let challengerTrafficUpdatedAt: string | null = null;

  for (const row of rows) {
    if (row.action === "sns_challenger_traffic_update" && challengerTrafficUpdatedAt === null) {
      const pct = row.details?.pct;
      if (!isChallengerTrafficPct(pct)) continue;
      challengerTrafficPct = Number(pct) as SnsChallengerTrafficPct;
      challengerTrafficReason = typeof row.details?.reason === "string" ? row.details.reason : null;
      challengerTrafficUpdatedAt = row.created_at;
      continue;
    }

    const content = row.details?.content;
    const status = row.details?.status;
    if (!isLeadVariant(content) || !isPolicyStatus(status) || byContent.has(content)) continue;
    byContent.set(content, {
      content,
      status,
      reason: typeof row.details?.reason === "string" ? row.details.reason : null,
      updatedAt: row.created_at,
    });
  }

  const policies = defaultPolicies().map((policy) => byContent.get(policy.content) ?? policy);
  return {
    policies,
    disabledLeadVariants: policies
      .filter((policy) => policy.status === "paused")
      .map((policy) => policy.content),
    challengerTrafficPct,
    challengerTrafficReason,
    challengerTrafficUpdatedAt,
    warning: null,
  };
}

export async function loadSnsLeadPolicySnapshot(admin?: SupabaseAdmin): Promise<SnsLeadPolicySnapshot> {
  try {
    const client = admin ?? createAdminClient();
    const { data, error } = await client
      .from("admin_actions")
      .select("action, details, created_at")
      .in("action", ["sns_lead_policy_update", "sns_challenger_traffic_update"])
      .order("created_at", { ascending: false })
      .limit(150);

    if (error) throw new Error(error.message);
    return buildLeadPolicySnapshot((data ?? []) as AdminActionLeadPolicyRow[]);
  } catch (error) {
    return {
      policies: defaultPolicies(),
      disabledLeadVariants: defaultPolicies()
        .filter((policy) => policy.status === "paused")
        .map((policy) => policy.content),
      challengerTrafficPct: CHALLENGER_LEAD_TRAFFIC_PCT,
      challengerTrafficReason: null,
      challengerTrafficUpdatedAt: null,
      warning: `SNS lead 정책 조회 실패, 기본 3종 균등 사용: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function normalizeLeadPolicyInput(input: {
  content: string;
  status: string;
  reason?: string | null;
}): { content: SnsLeadVariant; status: SnsLeadPolicyStatus; reason: string | null } {
  if (!isLeadVariant(input.content)) throw new Error("invalid_lead_variant");
  if (!isPolicyStatus(input.status)) throw new Error("invalid_lead_status");
  return {
    content: input.content,
    status: input.status,
    reason: input.reason?.trim().slice(0, 160) || null,
  };
}

export function normalizeChallengerTrafficInput(input: {
  pct: string;
  reason?: string | null;
}): { pct: SnsChallengerTrafficPct; reason: string | null } {
  const pct = Number.parseInt(input.pct, 10);
  if (!isChallengerTrafficPct(pct)) throw new Error("invalid_challenger_traffic_pct");
  return {
    pct: pct as SnsChallengerTrafficPct,
    reason: input.reason?.trim().slice(0, 180) || null,
  };
}

export function nextChallengerTrafficPct(current: number): SnsChallengerTrafficPct | null {
  return CHALLENGER_LEAD_TRAFFIC_STAGES.find((stage) => stage > current) ?? null;
}
