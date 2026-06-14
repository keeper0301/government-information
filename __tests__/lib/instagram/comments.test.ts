import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { collectRecentComments, postCommentReply } from "@/lib/instagram/comments";

const origFetch = global.fetch;
afterEach(() => {
  global.fetch = origFetch;
});
beforeEach(() => {
  vi.restoreAllMocks();
});

function mockFetchSequence(handlers: ((url: string, init?: RequestInit) => unknown)[]) {
  let i = 0;
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = handlers[Math.min(i, handlers.length - 1)](String(url), init);
    i++;
    return { ok: true, json: async () => body, text: async () => JSON.stringify(body) } as Response;
  }) as unknown as typeof fetch;
}

describe("collectRecentComments", () => {
  it("미디어 목록 → 각 미디어 댓글 수집, 빈 text 제외", async () => {
    mockFetchSequence([
      (url) => (url.includes("/media") ? { data: [{ id: "m1" }, { id: "m2" }] } : { data: [] }),
      () => ({ data: [{ id: "c1", text: "좋아요", username: "u1", timestamp: "2026-06-14T00:00:00Z" }, { id: "c2", text: "  " }] }),
      () => ({ data: [{ id: "c3", text: "질문 있어요", username: "u3" }] }),
    ]);
    const comments = await collectRecentComments("tok", "ig1", { mediaLimit: 2, perMedia: 25 });
    expect(comments.map((c) => c.commentId)).toEqual(["c1", "c3"]); // c2(빈칸) 제외
    expect(comments[0]).toMatchObject({ mediaId: "m1", text: "좋아요", username: "u1" });
    expect(comments[1]).toMatchObject({ mediaId: "m2", text: "질문 있어요" });
  });

  it("한 미디어 댓글 조회 실패해도 나머지 진행", async () => {
    let call = 0;
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      call++;
      const u = String(url);
      if (u.includes("/media")) return { ok: true, json: async () => ({ data: [{ id: "m1" }, { id: "m2" }] }) } as Response;
      if (call === 2) return { ok: false, status: 500, text: async () => "err" } as Response; // m1 실패
      return { ok: true, json: async () => ({ data: [{ id: "c9", text: "정상" }] }) } as Response;
    }) as unknown as typeof fetch;
    const comments = await collectRecentComments("tok", "ig1", { mediaLimit: 2 });
    expect(comments.map((c) => c.commentId)).toEqual(["c9"]);
  });
});

describe("postCommentReply", () => {
  it("성공 시 reply id 반환", async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ id: "r123" }) }) as Response) as unknown as typeof fetch;
    const id = await postCommentReply("tok", "c1", "감사합니다");
    expect(id).toBe("r123");
  });

  it("실패 시 throw", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 400, text: async () => "bad" }) as Response) as unknown as typeof fetch;
    await expect(postCommentReply("tok", "c1", "x")).rejects.toThrow(/답글 게시 실패 400/);
  });

  it("200 이지만 id 없으면 throw (게시 추적 불가 방지)", async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response) as unknown as typeof fetch;
    await expect(postCommentReply("tok", "c1", "x")).rejects.toThrow(/reply id 없음/);
  });

  it("에러 본문의 access_token 은 마스킹", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 400, text: async () => "fail access_token=SECRET123 here" }) as Response) as unknown as typeof fetch;
    await expect(postCommentReply("tok", "c1", "x")).rejects.toThrow(/access_token=\*\*\*/);
  });
});
