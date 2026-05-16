// ============================================================
// dispatchPolicyToSns 단위 테스트 (B 1차)
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sns/twitter", () => ({ publishTweet: vi.fn() }));
vi.mock("@/lib/sns/facebook", () => ({ publishFacebookPost: vi.fn() }));
vi.mock("@/lib/sns/threads", () => ({ publishThreadsPost: vi.fn() }));

import { dispatchPolicyToSns } from "@/lib/sns/policy-dispatch";
import * as twitter from "@/lib/sns/twitter";
import * as facebook from "@/lib/sns/facebook";
import * as threads from "@/lib/sns/threads";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dispatchPolicyToSns", () => {
  it("3 채널 (twitter/facebook/threads) 모두 호출", async () => {
    vi.mocked(twitter.publishTweet).mockResolvedValue({ ok: true, id: "t1" });
    vi.mocked(facebook.publishFacebookPost).mockResolvedValue({
      ok: true,
      id: "f1",
    });
    vi.mocked(threads.publishThreadsPost).mockResolvedValue({
      ok: true,
      id: "th1",
    });

    const out = await dispatchPolicyToSns({
      id: "p1",
      title: "청년 월세 지원",
      table: "welfare_programs",
      region: "전남",
      apply_end: "2026-06-30",
    });

    expect(twitter.publishTweet).toHaveBeenCalledOnce();
    expect(facebook.publishFacebookPost).toHaveBeenCalledOnce();
    expect(threads.publishThreadsPost).toHaveBeenCalledOnce();
    expect(out).toEqual([
      { channel: "twitter", ok: true, id: "t1" },
      { channel: "facebook", ok: true, id: "f1" },
      { channel: "threads", ok: true, id: "th1" },
    ]);
  });

  it("region/마감일 캡션에 포함", async () => {
    let tweetText = "";
    vi.mocked(twitter.publishTweet).mockImplementation(async (text) => {
      tweetText = text;
      return { ok: true, id: "t1" };
    });
    vi.mocked(facebook.publishFacebookPost).mockResolvedValue({
      ok: false,
      reason: "skipped_no_credentials",
    });
    vi.mocked(threads.publishThreadsPost).mockResolvedValue({
      ok: false,
      reason: "skipped_no_credentials",
    });

    await dispatchPolicyToSns({
      id: "p1",
      title: "청년 월세 지원",
      table: "welfare_programs",
      region: "전남",
      apply_end: "2026-06-30",
    });

    expect(tweetText).toContain("🔥 이번 주 인기 정책");
    expect(tweetText).toContain("[전남]");
    expect(tweetText).toContain("청년 월세 지원");
    expect(tweetText).toContain("마감 2026-06-30");
    expect(tweetText).toContain("/welfare/p1");
  });

  it("region 없는 정책 — [전국] prefix 생략", async () => {
    let tweetText = "";
    vi.mocked(twitter.publishTweet).mockImplementation(async (text) => {
      tweetText = text;
      return { ok: true, id: "t1" };
    });
    vi.mocked(facebook.publishFacebookPost).mockResolvedValue({
      ok: false,
      reason: "skipped",
    });
    vi.mocked(threads.publishThreadsPost).mockResolvedValue({
      ok: false,
      reason: "skipped",
    });

    await dispatchPolicyToSns({
      id: "p2",
      title: "전국 사업자 대출",
      table: "loan_programs",
      region: null,
      apply_end: null,
    });

    expect(tweetText).not.toContain("[null]");
    expect(tweetText).not.toContain("[전국]");
    expect(tweetText).toContain("전국 사업자 대출");
    expect(tweetText).toContain("/loan/p2"); // loan_programs path
  });

  it("partial 실패 허용 (twitter ok / facebook fail / threads ok)", async () => {
    vi.mocked(twitter.publishTweet).mockResolvedValue({ ok: true, id: "t1" });
    vi.mocked(facebook.publishFacebookPost).mockResolvedValue({
      ok: false,
      reason: "rate_limited",
    });
    vi.mocked(threads.publishThreadsPost).mockResolvedValue({
      ok: true,
      id: "th1",
    });

    const out = await dispatchPolicyToSns({
      id: "p3",
      title: "테스트",
      table: "welfare_programs",
      region: null,
      apply_end: null,
    });

    expect(out[0].ok).toBe(true);
    expect(out[1].ok).toBe(false);
    expect(out[1].reason).toBe("rate_limited");
    expect(out[2].ok).toBe(true);
  });
});
