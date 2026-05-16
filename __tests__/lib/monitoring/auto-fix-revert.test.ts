// ============================================================
// D-4 step 5 자동 revert 단위 테스트
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/git-bot/github-update", () => ({
  createBranch: vi.fn(),
  getFileContent: vi.fn(),
  updateFile: vi.fn(),
  createPullRequest: vi.fn(),
}));

import {
  isRevertEnabled,
  revertAlertToPr,
  formatRevertResults,
  type RevertResult,
} from "@/lib/monitoring/auto-fix-revert";
import * as supabase from "@/lib/supabase/admin";
import * as gh from "@/lib/git-bot/github-update";
import type { RollbackAlert } from "@/lib/monitoring/auto-fix-rollback";

function makeAlert(overrides?: Partial<RollbackAlert>): RollbackAlert {
  return {
    prNumber: 42,
    domain: "suncheon",
    currentSkippedRate: 0.75,
    reason: "skipped 75%",
    revertGuideUrl: "https://github.com/x/y/pull/42",
    ...overrides,
  };
}

function mockSupabaseReturn(details: unknown) {
  vi.mocked(supabase.createAdminClient).mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: details ? { details } : null }),
            }),
          }),
        }),
      }),
    }),
  } as unknown as ReturnType<typeof supabase.createAdminClient>);
}

describe("isRevertEnabled", () => {
  beforeEach(() => {
    delete process.env.D4_AUTO_FIX_REVERT_ENABLED;
  });

  it("env 미설정 → false", () => {
    expect(isRevertEnabled()).toBe(false);
  });

  it("'true' → true", () => {
    process.env.D4_AUTO_FIX_REVERT_ENABLED = "true";
    expect(isRevertEnabled()).toBe(true);
  });
});

describe("revertAlertToPr", () => {
  beforeEach(() => {
    process.env.D4_AUTO_FIX_REVERT_ENABLED = "true";
    vi.clearAllMocks();
  });

  it("env 비활성화 → error", async () => {
    process.env.D4_AUTO_FIX_REVERT_ENABLED = "false";
    const r = await revertAlertToPr(makeAlert());
    expect(r.error).toContain("비활성화");
  });

  it("audit 의 d4_step3_prs_detailed 없음 → error", async () => {
    mockSupabaseReturn({});
    const r = await revertAlertToPr(makeAlert());
    expect(r.error).toContain("audit 에 없음");
  });

  it("audit 의 prNumber·domain 매칭 없음 → error", async () => {
    mockSupabaseReturn({
      d4_step3_prs_detailed: [
        { pr: 99, domain: "gwangju", filePath: "x", currentRegex: "a", proposedRegex: "b" },
      ],
    });
    const r = await revertAlertToPr(makeAlert());
    expect(r.error).toContain("audit 에 없음");
  });

  it("파일에 신규 regex 없으면 → error (이미 revert 됨)", async () => {
    mockSupabaseReturn({
      d4_step3_prs_detailed: [
        {
          pr: 42,
          domain: "suncheon",
          filePath: "lib/x.ts",
          currentRegex: "old_regex",
          proposedRegex: "new_regex",
        },
      ],
    });
    vi.mocked(gh.getFileContent).mockResolvedValue({
      content: "// 완전 다른 코드 patterns",
      sha: "sha",
    });
    const r = await revertAlertToPr(makeAlert());
    expect(r.error).toContain("신규 regex 없음");
  });

  it("정상 흐름 → branch + swap + PR 모두 호출", async () => {
    mockSupabaseReturn({
      d4_step3_prs_detailed: [
        {
          pr: 42,
          domain: "suncheon",
          filePath: "lib/scraping/local-press/suncheon.ts",
          currentRegex: "old_regex",
          proposedRegex: "new_regex",
        },
      ],
    });
    vi.mocked(gh.getFileContent).mockResolvedValue({
      content: "const X = /new_regex/;",
      sha: "sha_base",
    });
    vi.mocked(gh.createBranch).mockResolvedValue();
    vi.mocked(gh.updateFile).mockResolvedValue();
    vi.mocked(gh.createPullRequest).mockResolvedValue({
      url: "https://github.com/x/y/pull/99",
      number: 99,
    });

    const r = await revertAlertToPr(makeAlert());

    expect(gh.createBranch).toHaveBeenCalled();
    expect(gh.updateFile).toHaveBeenCalled();
    expect(gh.createPullRequest).toHaveBeenCalled();
    expect(r.revertPrNumber).toBe(99);
    expect(r.revertPrUrl).toContain("/pull/99");
  });

  it("GitHub API 실패 → graceful error", async () => {
    mockSupabaseReturn({
      d4_step3_prs_detailed: [
        {
          pr: 42,
          domain: "suncheon",
          filePath: "x",
          currentRegex: "a",
          proposedRegex: "b",
        },
      ],
    });
    vi.mocked(gh.getFileContent).mockRejectedValue(new Error("API rate limit"));
    const r = await revertAlertToPr(makeAlert());
    expect(r.error).toContain("rate limit");
  });
});

describe("formatRevertResults", () => {
  it("빈 → 빈 문자열", () => {
    expect(formatRevertResults([])).toBe("");
  });

  it("성공 → '⏪ D-4 step 5' + revert PR link", () => {
    const results: RevertResult[] = [
      {
        rollbackAlert: {
          prNumber: 42,
          domain: "suncheon",
          currentSkippedRate: 0.75,
          reason: "test",
          revertGuideUrl: "x",
        },
        revertPrNumber: 99,
        revertPrUrl: "https://github.com/x/y/pull/99",
      },
    ];
    const txt = formatRevertResults(results);
    expect(txt).toContain("⏪ D-4 step 5");
    expect(txt).toContain("PR #42 → revert PR #99");
    expect(txt).toContain("/pull/99");
  });

  it("실패 → ❌", () => {
    const results: RevertResult[] = [
      {
        rollbackAlert: {
          prNumber: 42,
          domain: "x",
          currentSkippedRate: 0,
          reason: "",
          revertGuideUrl: "",
        },
        error: "API down",
      },
    ];
    expect(formatRevertResults(results)).toContain("API down");
  });
});
