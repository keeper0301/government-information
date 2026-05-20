import { describe, expect, it } from "vitest";
import {
  buildPolicyInboxUpsertPayload,
  buildPolicyInboxStatePatch,
  mergePolicyInboxState,
  normalizePolicyInboxProgramRef,
} from "@/lib/notifications/policy-inbox-state";

describe("policy inbox state helpers", () => {
  it("normalizes notification delivery refs to stable policy inbox refs", () => {
    expect(
      normalizePolicyInboxProgramRef({
        program_table: "welfare_programs",
        program_id: "9f34b4df-0000-4000-8000-111111111111",
      }),
    ).toEqual({
      program_type: "welfare",
      program_id: "9f34b4df-0000-4000-8000-111111111111",
    });

    expect(
      normalizePolicyInboxProgramRef({
        program_table: "loan_programs",
        program_id: "9f34b4df-0000-4000-8000-222222222222",
      }),
    ).toEqual({
      program_type: "loan",
      program_id: "9f34b4df-0000-4000-8000-222222222222",
    });

    expect(
      normalizePolicyInboxProgramRef({
        program_table: "news_posts",
        program_id: "9f34b4df-0000-4000-8000-333333333333",
      }),
    ).toBeNull();
    expect(
      normalizePolicyInboxProgramRef({
        program_table: "welfare_programs",
        program_id: null,
      }),
    ).toBeNull();
  });

  it("builds timestamp patches for read, save, and hide actions", () => {
    const now = new Date("2026-05-21T00:00:00.000Z");

    expect(buildPolicyInboxStatePatch("read", now)).toEqual({
      read_at: "2026-05-21T00:00:00.000Z",
    });
    expect(buildPolicyInboxStatePatch("unread", now)).toEqual({ read_at: null });
    expect(buildPolicyInboxStatePatch("save", now)).toEqual({
      saved_at: "2026-05-21T00:00:00.000Z",
    });
    expect(buildPolicyInboxStatePatch("unsave", now)).toEqual({ saved_at: null });
    expect(buildPolicyInboxStatePatch("hide", now)).toEqual({
      hidden_at: "2026-05-21T00:00:00.000Z",
    });
    expect(buildPolicyInboxStatePatch("unhide", now)).toEqual({ hidden_at: null });
  });

  it("merges nullable DB state into booleans for policy cards", () => {
    expect(
      mergePolicyInboxState({
        read_at: "2026-05-21T00:00:00.000Z",
        saved_at: null,
        hidden_at: "2026-05-21T01:00:00.000Z",
      }),
    ).toEqual({
      isRead: true,
      isSaved: false,
      isHidden: true,
      readAt: "2026-05-21T00:00:00.000Z",
      savedAt: null,
      hiddenAt: "2026-05-21T01:00:00.000Z",
    });

    expect(mergePolicyInboxState(null)).toEqual({
      isRead: false,
      isSaved: false,
      isHidden: false,
      readAt: null,
      savedAt: null,
      hiddenAt: null,
    });
  });

  it("builds an authenticated upsert payload from a delivery ref and action", () => {
    const payload = buildPolicyInboxUpsertPayload({
      userId: "user-1",
      ref: {
        program_table: "loan_programs",
        program_id: "9f34b4df-0000-4000-8000-222222222222",
      },
      action: "save",
      now: new Date("2026-05-21T02:00:00.000Z"),
    });

    expect(payload).toEqual({
      user_id: "user-1",
      program_type: "loan",
      program_id: "9f34b4df-0000-4000-8000-222222222222",
      saved_at: "2026-05-21T02:00:00.000Z",
      updated_at: "2026-05-21T02:00:00.000Z",
    });

    expect(
      buildPolicyInboxUpsertPayload({
        userId: "user-1",
        ref: { program_table: "news_posts", program_id: "news-1" },
        action: "hide",
        now: new Date("2026-05-21T02:00:00.000Z"),
      }),
    ).toBeNull();
  });
});
