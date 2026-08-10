// ============================================================
// dispatchPolicyToSns 단위 테스트 (B 1차)
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sns/twitter", () => ({ publishTweet: vi.fn() }));
vi.mock("@/lib/sns/facebook", () => ({ publishFacebookPost: vi.fn() }));
vi.mock("@/lib/sns/threads", () => ({ publishThreadsPost: vi.fn() }));

import { buildPolicySnsCaption, dispatchPolicyToSns } from "@/lib/sns/policy-dispatch";
import { validateCaption } from "@/lib/validate-caption";
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

  it("인기 정책 Threads 캡션은 제목+링크 단독으로 퇴화하지 않는다", () => {
    const samples = [
      {
        id: "d269c544-0964-49cf-9a65-9c2a456c11a7",
        title: "제천시 다자녀가구 등록금 지원 사업 (충청북도 제천시)",
        table: "welfare_programs" as const,
        region: "충청북도 제천시",
        apply_end: null,
        benefits: "현금지급",
        description: "둘 이상 다자녀가구의 대학생 등록금 지원을 통한 자녀키우기 좋은 도시 조성",
      },
      {
        id: "e216132e-29da-45d3-a2c7-7c83f2f290c3",
        title: "공공형(어르신) 행복택시 운영",
        table: "welfare_programs" as const,
        region: "제주특별자치도",
        apply_end: null,
        benefits: "전자바우처(바우처)",
        description: "대중교통 이용에 취약한 어르신들에게 이동편의 제공 및 교통복지 증진",
      },
      {
        id: "0124f426-eec0-4a1b-920a-6d0e18bd5f06",
        title: "세종특별자치시 소상공인 자금 (세종신용보증재단)",
        table: "loan_programs" as const,
        region: "세종특별자치시",
        apply_end: null,
        target: "소상공인",
        eligibility: "소상공인",
        loan_amount: "7000만원",
        description: "지원대상: 소상공인\n상세조건: 세종특별자치시 소재 소상공인\n대출용도: 운영",
      },
    ];

    for (const sample of samples) {
      const { threads: text } = buildPolicySnsCaption(sample);
      const withoutUrls = text.replace(/https?:\/\/\S+/g, "").trim();
      const lines = withoutUrls.split("\n").map((line) => line.trim()).filter(Boolean);
      expect(withoutUrls.length).toBeGreaterThanOrEqual(120);
      expect(lines.length).toBeGreaterThanOrEqual(3);
      expect(() => validateCaption(text, { source: "threads", requireSubstance: true })).not.toThrow();
    }
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
