import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm/text", () => ({
  callLLM: vi.fn(),
  parseJSONResponse: (text: string) => JSON.parse(text),
}));
vi.mock("@/lib/sns/threads", () => ({ publishThreadsPost: vi.fn() }));

import { callLLM } from "@/lib/llm/text";
import { publishThreadsPost } from "@/lib/sns/threads";
import {
  buildFallbackCandidateThreadsText,
  buildThreadsCandidateDraft,
  normalizeThreadsCandidateKeyword,
  publishApprovedThreadsCandidates,
  validateCandidateThreadsText,
} from "@/lib/sns/threads-candidate-publisher";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.THREADS_CANDIDATE_PUBLISH_ENABLED;
});

describe("threads-candidate-publisher", () => {
  const candidate = {
    title: "2026년 경기 중소기업 홈쇼핑·라이브커머스 방송 송출비 1,500만원 추가지원",
    region: "경기",
  };

  it("후보 제목에서 댓글 키워드를 뽑고 fallback 문안을 안전하게 만든다", () => {
    expect(normalizeThreadsCandidateKeyword(candidate.title)).toBe("라이브커머스");
    const text = buildFallbackCandidateThreadsText(candidate);
    const validation = validateCandidateThreadsText(text, candidate);
    expect(text).toContain("@keepioo_official");
    expect(text).toContain("라이브커머스");
    expect(text).not.toMatch(/https?:\/\//);
    expect(validation.ok).toBe(true);
  });

  it("LLM 문안이 검증을 통과하면 live editorial draft를 사용한다", async () => {
    vi.mocked(callLLM).mockResolvedValue(JSON.stringify({
      text: "제품은 있는데 판매 채널이 약하면 방송 송출비부터 확인해보세요.\n\n경기 기업 대상이라 조건부터 봐야 합니다.\n\n자세한 조건은 @keepioo_official 카드뉴스로 정리해둘게요. 댓글에 **라이브커머스** 남겨두면 다시 찾기 쉽습니다.",
    }));
    const draft = await buildThreadsCandidateDraft(candidate);
    expect(draft.source).toBe("llm");
    expect(draft.validation.ok).toBe(true);
  });

  it("LLM 실패/검증 실패 시 deterministic fallback으로 닫힌다", async () => {
    vi.mocked(callLLM).mockRejectedValue(new Error("OPENAI missing"));
    const draft = await buildThreadsCandidateDraft(candidate);
    expect(draft.source).toBe("fallback");
    expect(draft.validation.ok).toBe(true);
  });

  it("dry-run 기본값에서는 Threads API를 호출하지 않는다", async () => {
    const results = await publishApprovedThreadsCandidates([candidate], { approved: true });
    expect(results[0].published).toBe(false);
    expect(publishThreadsPost).not.toHaveBeenCalled();
  });

  it("승인 + feature gate가 있어야 실제 Threads publish를 호출한다", async () => {
    process.env.THREADS_CANDIDATE_PUBLISH_ENABLED = "true";
    vi.mocked(publishThreadsPost).mockResolvedValue({ ok: true, id: "threads-1" });
    const results = await publishApprovedThreadsCandidates([candidate], { dryRun: false, approved: true });
    expect(publishThreadsPost).toHaveBeenCalledOnce();
    expect(results[0].published).toBe(true);
    expect(results[0].result).toEqual({ ok: true, id: "threads-1" });
  });

  it("승인되어도 feature gate가 꺼져 있으면 publish하지 않는다", async () => {
    const results = await publishApprovedThreadsCandidates([candidate], { dryRun: false, approved: true });
    expect(publishThreadsPost).not.toHaveBeenCalled();
    expect(results[0].published).toBe(false);
    expect(results[0].result).toEqual({ ok: false, reason: "candidate_publish_gate_disabled" });
  });
});
