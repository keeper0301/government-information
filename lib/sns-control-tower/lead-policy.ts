import { createAdminClient } from "@/lib/supabase/admin";

export type SnsLeadVariant = "lead_0" | "lead_1" | "lead_2";
export type SnsLeadPolicyStatus = "active" | "paused";

export type SnsLeadPolicy = {
  content: SnsLeadVariant;
  status: SnsLeadPolicyStatus;
  reason: string | null;
  updatedAt: string | null;
};

export type SnsLeadPolicySnapshot = {
  policies: SnsLeadPolicy[];
  disabledLeadVariants: SnsLeadVariant[];
  warning: string | null;
};

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

type AdminActionLeadPolicyRow = {
  details: Record<string, unknown> | null;
  created_at: string | null;
};

export const LEAD_VARIANTS: SnsLeadVariant[] = ["lead_0", "lead_1", "lead_2"];

function isLeadVariant(value: unknown): value is SnsLeadVariant {
  return value === "lead_0" || value === "lead_1" || value === "lead_2";
}

function isPolicyStatus(value: unknown): value is SnsLeadPolicyStatus {
  return value === "active" || value === "paused";
}

function defaultPolicies(): SnsLeadPolicy[] {
  return LEAD_VARIANTS.map((content) => ({
    content,
    status: "active",
    reason: null,
    updatedAt: null,
  }));
}

export function buildLeadPolicySnapshot(rows: AdminActionLeadPolicyRow[]): SnsLeadPolicySnapshot {
  const byContent = new Map<SnsLeadVariant, SnsLeadPolicy>();

  for (const row of rows) {
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
    warning: null,
  };
}

export async function loadSnsLeadPolicySnapshot(admin?: SupabaseAdmin): Promise<SnsLeadPolicySnapshot> {
  try {
    const client = admin ?? createAdminClient();
    const { data, error } = await client
      .from("admin_actions")
      .select("details, created_at")
      .eq("action", "sns_lead_policy_update")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);
    return buildLeadPolicySnapshot((data ?? []) as AdminActionLeadPolicyRow[]);
  } catch (error) {
    return {
      policies: defaultPolicies(),
      disabledLeadVariants: [],
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
