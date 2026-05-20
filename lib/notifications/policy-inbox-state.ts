export type PolicyInboxProgramType = "welfare" | "loan";

export type PolicyInboxProgramRef = {
  program_type: PolicyInboxProgramType;
  program_id: string;
};

export type PolicyInboxSourceRef = {
  program_table: string | null;
  program_id: string | null;
};

export type PolicyInboxAction =
  | "read"
  | "unread"
  | "save"
  | "unsave"
  | "hide"
  | "unhide";

export type PolicyInboxStateRow = {
  read_at: string | null;
  saved_at: string | null;
  hidden_at: string | null;
};

export type PolicyInboxStatePatch = Partial<PolicyInboxStateRow>;

export type MergedPolicyInboxState = {
  isRead: boolean;
  isSaved: boolean;
  isHidden: boolean;
  readAt: string | null;
  savedAt: string | null;
  hiddenAt: string | null;
};

export type PolicyInboxUpsertPayload = PolicyInboxProgramRef &
  PolicyInboxStatePatch & {
    user_id: string;
    updated_at: string;
  };

export function normalizePolicyInboxProgramRef(
  ref: PolicyInboxSourceRef,
): PolicyInboxProgramRef | null {
  if (!ref.program_id) return null;
  if (ref.program_table === "welfare_programs") {
    return {
      program_type: "welfare",
      program_id: ref.program_id,
    };
  }
  if (ref.program_table === "loan_programs") {
    return {
      program_type: "loan",
      program_id: ref.program_id,
    };
  }
  return null;
}

export function buildPolicyInboxStatePatch(
  action: PolicyInboxAction,
  now = new Date(),
): PolicyInboxStatePatch {
  const iso = now.toISOString();

  if (action === "read") return { read_at: iso };
  if (action === "unread") return { read_at: null };
  if (action === "save") return { saved_at: iso };
  if (action === "unsave") return { saved_at: null };
  if (action === "hide") return { hidden_at: iso };
  return { hidden_at: null };
}

export function mergePolicyInboxState(
  row: PolicyInboxStateRow | null | undefined,
): MergedPolicyInboxState {
  const readAt = row?.read_at ?? null;
  const savedAt = row?.saved_at ?? null;
  const hiddenAt = row?.hidden_at ?? null;

  return {
    isRead: Boolean(readAt),
    isSaved: Boolean(savedAt),
    isHidden: Boolean(hiddenAt),
    readAt,
    savedAt,
    hiddenAt,
  };
}

export function buildPolicyInboxUpsertPayload({
  userId,
  ref,
  action,
  now = new Date(),
}: {
  userId: string;
  ref: PolicyInboxSourceRef;
  action: PolicyInboxAction;
  now?: Date;
}): PolicyInboxUpsertPayload | null {
  const normalized = normalizePolicyInboxProgramRef(ref);
  if (!normalized) return null;

  return {
    user_id: userId,
    ...normalized,
    ...buildPolicyInboxStatePatch(action, now),
    updated_at: now.toISOString(),
  };
}
