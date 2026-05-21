import { describe, expect, it } from "vitest";
import {
  buildPolicyInboxStorageStatus,
  normalizePolicyInboxStorageError,
} from "@/lib/admin/policy-inbox-storage-status";

describe("policy inbox storage status", () => {
  it("marks storage ready when the table count succeeds", () => {
    expect(
      buildPolicyInboxStorageStatus({
        count: 12,
        readCount: 7,
        savedCount: 3,
        hiddenCount: 2,
        error: null,
      }),
    ).toEqual({
      status: "ready",
      label: "정책함 저장소 정상",
      tone: "good",
      count: 12,
      readCount: 7,
      savedCount: 3,
      hiddenCount: 2,
      hint: "읽음·저장·숨김 상태 저장 가능",
    });
  });

  it("marks storage pending when the table does not exist yet", () => {
    expect(
      buildPolicyInboxStorageStatus({
        count: null,
        error: {
          code: "42P01",
          message: 'relation "public.user_policy_inbox_items" does not exist',
        },
      }),
    ).toEqual({
      status: "pending_migration",
      label: "정책함 저장소 미적용",
      tone: "warn",
      count: 0,
      readCount: 0,
      savedCount: 0,
      hiddenCount: 0,
      hint: "Supabase migration 20260520191551 적용 필요",
    });
  });

  it("normalizes unknown storage errors without exposing raw details", () => {
    expect(
      normalizePolicyInboxStorageError({
        code: "42501",
        message: "permission denied for table user_policy_inbox_items",
      }),
    ).toEqual({
      kind: "error",
      safeMessage: "정책함 저장소 확인 실패",
    });
  });
});
