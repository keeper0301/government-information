// ============================================================
// D-4 step 3 auto-fix-commit 단위 테스트 — mock GitHub API
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/git-bot/github-update", () => ({
  createBranch: vi.fn(),
  getFileContent: vi.fn(),
  updateFile: vi.fn(),
  createPullRequest: vi.fn(),
}));

import {
  isCommitEnabled,
  commitRegexProposal,
  formatCommitResults,
  type CommitProposalResult,
} from "@/lib/monitoring/auto-fix-commit";
import * as gh from "@/lib/git-bot/github-update";
import type { RegexProposal } from "@/lib/monitoring/llm-regex-fix";

function makeProposal(overrides?: Partial<RegexProposal>): RegexProposal {
  return {
    domain: "suncheon",
    fnName: "parseDetailBody",
    currentRegex: 'class="content"',
    proposedRegex: 'class="new_content"',
    sampleMatchTested: true,
    sampleExtract: "test 본문",
    reason: "사이트 class 변경 감지",
    ...overrides,
  };
}

describe("isCommitEnabled", () => {
  beforeEach(() => {
    delete process.env.D4_AUTO_FIX_COMMIT_ENABLED;
  });

  it("env 미설정 → false", () => {
    expect(isCommitEnabled()).toBe(false);
  });

  it("'true' → true", () => {
    process.env.D4_AUTO_FIX_COMMIT_ENABLED = "true";
    expect(isCommitEnabled()).toBe(true);
  });
});

describe("commitRegexProposal", () => {
  beforeEach(() => {
    process.env.D4_AUTO_FIX_COMMIT_ENABLED = "true";
    vi.clearAllMocks();
  });

  it("env 비활성화 → error 반환", async () => {
    process.env.D4_AUTO_FIX_COMMIT_ENABLED = "false";
    const r = await commitRegexProposal(makeProposal());
    expect(r).toEqual({ error: expect.stringContaining("비활성화") });
  });

  it("sample 매칭 실패 → commit 차단", async () => {
    const r = await commitRegexProposal(
      makeProposal({ sampleMatchTested: false }),
    );
    expect(r).toEqual({ error: expect.stringContaining("매칭 실패") });
  });

  it("unknown domain → error", async () => {
    const r = await commitRegexProposal(makeProposal({ domain: "unknown" }));
    expect(r).toEqual({ error: expect.stringContaining("unknown domain") });
  });

  it("현재 regex 가 파일에 없으면 → error", async () => {
    vi.mocked(gh.getFileContent).mockResolvedValue({
      content: "// 전혀 다른 코드",
      sha: "abc123",
    });
    const r = await commitRegexProposal(makeProposal());
    expect(r).toEqual({ error: expect.stringContaining("파일에 없음") });
  });

  it("정상 흐름 → branch + file update + PR 모두 호출", async () => {
    vi.mocked(gh.getFileContent).mockResolvedValue({
      content: 'const BODY_REGEX = /class="content"/;',
      sha: "sha_base",
    });
    vi.mocked(gh.createBranch).mockResolvedValue();
    vi.mocked(gh.updateFile).mockResolvedValue();
    vi.mocked(gh.createPullRequest).mockResolvedValue({
      url: "https://github.com/keeper0301/government-information/pull/42",
      number: 42,
    });

    const r = await commitRegexProposal(makeProposal());

    expect(gh.createBranch).toHaveBeenCalled();
    expect(gh.updateFile).toHaveBeenCalled();
    expect(gh.createPullRequest).toHaveBeenCalled();
    expect(r).toEqual({
      domain: "suncheon",
      fnName: "parseDetailBody",
      filePath: "lib/scraping/local-press/suncheon.ts",
      branch: expect.stringContaining("auto-fix/"),
      prUrl: expect.stringContaining("/pull/42"),
      prNumber: 42,
      // step 5 revert 위해 보존 (step 3 audit + step 5 swap)
      currentRegex: 'class="content"',
      proposedRegex: 'class="new_content"',
    });
  });

  it("GitHub API 실패 → error graceful", async () => {
    vi.mocked(gh.getFileContent).mockRejectedValue(
      new Error("GitHub API 403: rate limit"),
    );
    const r = await commitRegexProposal(makeProposal());
    expect(r).toEqual({ error: expect.stringContaining("rate limit") });
  });
});

describe("formatCommitResults", () => {
  it("빈 배열 → 빈 문자열", () => {
    expect(formatCommitResults([])).toBe("");
  });

  it("성공 PR → ✅ + URL 표시", () => {
    const results: CommitProposalResult[] = [
      {
        domain: "suncheon",
        fnName: "parseDetailBody",
        filePath: "lib/scraping/local-press/suncheon.ts",
        branch: "auto-fix/2026-05-16-suncheon",
        prUrl: "https://github.com/keeper0301/government-information/pull/42",
        prNumber: 42,
        currentRegex: "old",
        proposedRegex: "new",
      },
    ];
    const txt = formatCommitResults(results);
    expect(txt).toContain("🚀 D-4 step 3");
    expect(txt).toContain("✅ suncheon → PR #42");
    expect(txt).toContain("/pull/42");
  });

  it("실패 → ❌ + error", () => {
    const results: CommitProposalResult[] = [
      { error: "현재 regex 가 파일에 없음" },
    ];
    const txt = formatCommitResults(results);
    expect(txt).toContain("❌ PR 생성 실패");
    expect(txt).toContain("파일에 없음");
  });
});
