import { createAdminClient } from "@/lib/supabase/admin";

export type PolicyInboxStorageTone = "good" | "warn" | "danger";

export type PolicyInboxStorageStatus =
  | "ready"
  | "pending_migration"
  | "error";

export type PolicyInboxStorageSummary = {
  status: PolicyInboxStorageStatus;
  label: string;
  tone: PolicyInboxStorageTone;
  count: number;
  hint: string;
};

export type PolicyInboxStorageCountResult = {
  count: number | null;
  error: {
    code?: string;
    message?: string;
  } | null;
};

export function normalizePolicyInboxStorageError(
  error: NonNullable<PolicyInboxStorageCountResult["error"]>,
): { kind: "pending_migration" | "error"; safeMessage: string } {
  const message = error.message ?? "";
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("Could not find the table")
  ) {
    return {
      kind: "pending_migration",
      safeMessage: "Supabase migration 20260520191551 적용 필요",
    };
  }

  return {
    kind: "error",
    safeMessage: "정책함 저장소 확인 실패",
  };
}

export function buildPolicyInboxStorageStatus(
  result: PolicyInboxStorageCountResult,
): PolicyInboxStorageSummary {
  if (!result.error) {
    return {
      status: "ready",
      label: "정책함 저장소 정상",
      tone: "good",
      count: result.count ?? 0,
      hint: "읽음·저장·숨김 상태 저장 가능",
    };
  }

  const normalized = normalizePolicyInboxStorageError(result.error);
  if (normalized.kind === "pending_migration") {
    return {
      status: "pending_migration",
      label: "정책함 저장소 미적용",
      tone: "warn",
      count: 0,
      hint: normalized.safeMessage,
    };
  }

  return {
    status: "error",
    label: "정책함 저장소 점검 필요",
    tone: "danger",
    count: 0,
    hint: normalized.safeMessage,
  };
}

export async function getPolicyInboxStorageStatus(): Promise<PolicyInboxStorageSummary> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("user_policy_inbox_items")
    .select("id", { count: "exact", head: true });

  return buildPolicyInboxStorageStatus({
    count: count ?? 0,
    error: error
      ? {
          code: error.code,
          message: error.message,
        }
      : null,
  });
}
