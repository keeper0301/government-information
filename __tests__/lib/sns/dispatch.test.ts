import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/sns/twitter", () => ({ publishTweet: vi.fn() }));
vi.mock("@/lib/sns/facebook", () => ({ publishFacebookPost: vi.fn() }));
vi.mock("@/lib/sns/threads", () => ({ publishThreadsPost: vi.fn() }));

import { buildThreadsText, dispatchBlogToSns } from "@/lib/sns/dispatch";
import * as twitter from "@/lib/sns/twitter";
import * as facebook from "@/lib/sns/facebook";
import * as threads from "@/lib/sns/threads";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildThreadsText", () => {
  it("제목+링크 단독이 아니라 설명과 CTA를 포함한다", () => {
    const text = buildThreadsText({
      title: "세대를 이어주는 끈, 기초연금",
      slug: "basic-pension",
      description:
        "매월 25일 지급되는 기초연금이 생활비와 지역 소비로 이어지는 흐름을 정리했습니다. 수급자 개인의 소득 보완을 넘어 동네 가게 매출과 일자리에도 영향을 주는 구조를 짚었습니다.",
    });

    expect(text).toContain("부모님이나 본인의 복지 혜택을 확인 중이라면");
    expect(text).toContain("원문\n세대를 이어주는 끈, 기초연금");
    expect(text).toContain("생활비와 지역 소비");
    expect(text).toContain("핵심 요약");
    expect(text).toContain("확인 포인트");
    expect(text).toContain("• 수급자 개인의 소득 보완");
    expect(text).toContain("자세히 보기");
    expect(text).toContain("https://www.keepioo.com/blog/basic-pension");
    expect(text).toContain("utm_source=threads");
    expect(text).toContain("utm_campaign=blog_auto");
    expect(text).not.toBe("세대를 이어주는 끈, 기초연금\n\nhttps://www.keepioo.com/blog/basic-pension");
    expect(text).toMatch(/^부모님이나 본인의 복지 혜택을 확인 중이라면/);
    expect(text).toMatch(/\n\n원문\n세대를 이어주는 끈, 기초연금\n\n핵심 요약\n/);
    expect(text).toMatch(/\n\n확인 포인트\n• /);
    expect(text).toMatch(/\n\n자세히 보기\nhttps:\/\/www\.keepioo\.com\/blog\/basic-pension\?utm_source=threads&/);
    expect(text.length).toBeLessThanOrEqual(500);
    expect(text.replace(/https?:\/\/\S+/g, "").trim().length).toBeGreaterThanOrEqual(120);
  });

  it("설명이 없는 글도 문단 간격이 있는 기본 문구로 만든다", () => {
    const text = buildThreadsText({
      title: "2026년 디딤돌 창업중심대학: 과학기술원 창업기업 사업화 자금 지원",
      slug: "2026년-디딤돌-창업중심대학-지원",
    });

    expect(text).toMatch(/^사업을 운영하거나 창업을 준비 중이라면/);
    expect(text).toContain("대상 조건, 신청 시점, 준비할 내용을 먼저 확인하세요.");
    expect(text).toContain("확인 포인트");
    expect(text).toContain("• 대상 조건 확인");
    expect(text).toContain("• 한도·금리·상환 조건 확인");
    expect(text).toMatch(/\n\n자세히 보기\nhttps:\/\/www\.keepioo\.com\/blog\/2026%EB%85%84-%EB%94%94%EB%94%A4%EB%8F%8C-%EC%B0%BD%EC%97%85%EC%A4%91%EC%8B%AC%EB%8C%80%ED%95%99-%EC%A7%80%EC%9B%90\?utm_source=threads&/);
    expect(text).not.toContain("/blog/2026년");
    expect(text.length).toBeLessThanOrEqual(500);
  });

  it("행정 제목보다 대상자에게 말 거는 첫 문장으로 시작한다", () => {
    const text = buildThreadsText({
      title: "2026년 안양시 장애인가정 출산장려금 지원",
      slug: "2026년-안양시-장애인가정-출산장려금-지원",
      description:
        "안양시 장애인가정 출산장려금의 대상과 신청 전 확인할 내용을 정리했습니다. 출산 시점과 거주 요건에 따라 지원 여부가 달라질 수 있습니다.",
    });

    expect(text).toMatch(/^안양시에서 장애인가정에 해당된다면/);
    expect(text).toContain("원문\n2026년 안양시 장애인가정 출산장려금 지원");
    expect(text).toContain("• 출산 시점과 거주 요건");
    expect(text.length).toBeLessThanOrEqual(500);
  });

  it("Threads 링크에 A/B 리드 추적용 UTM을 붙인다", () => {
    const text = buildThreadsText({
      title: "청년 월세 지원 신청 안내",
      slug: "청년-월세-지원-신청-안내",
      description: "청년 월세 지원의 대상과 신청 방법을 정리했습니다.",
    });

    expect(text).toContain("utm_source=threads");
    expect(text).toContain("utm_medium=social");
    expect(text).toContain("utm_campaign=blog_auto");
    expect(text).toMatch(/utm_content=lead_[0-2]/);
  });

  it("중단된 lead variant는 새 Threads 문구에서 제외한다", () => {
    for (let i = 0; i < 12; i += 1) {
      const text = buildThreadsText(
        {
          title: `청년 월세 지원 신청 안내 ${i}`,
          slug: `청년-월세-지원-신청-안내-${i}`,
          description: "청년 월세 지원의 대상과 신청 방법을 정리했습니다.",
        },
        { disabledLeadVariants: ["lead_1", "lead_3", "lead_4", "lead_5"] },
      );
      expect(text).not.toContain("utm_content=lead_1");
      expect(text).toMatch(/utm_content=lead_[02]/);
    }
  });

  it("승인된 challenger lead도 최대 20% 제한 노출로만 섞는다", () => {
    const seen = new Map<string, number>();
    for (let i = 0; i < 1000; i += 1) {
      const text = buildThreadsText(
        {
          title: `청년 월세 지원 신청 안내 ${i}`,
          slug: `청년-월세-지원-신청-안내-${i}`,
          description: "청년 월세 지원의 대상과 신청 방법을 정리했습니다.",
        },
        { disabledLeadVariants: ["lead_4", "lead_5"] },
      );
      const lead = text.match(/utm_content=(lead_\d+)/)?.[1] ?? "missing";
      seen.set(lead, (seen.get(lead) ?? 0) + 1);
    }

    const challengerCount = seen.get("lead_3") ?? 0;
    expect(challengerCount).toBeGreaterThan(0);
    expect(challengerCount).toBeLessThanOrEqual(240);
    expect((seen.get("lead_0") ?? 0) + (seen.get("lead_1") ?? 0) + (seen.get("lead_2") ?? 0)).toBeGreaterThanOrEqual(760);
  });

  it("관리자 승인 단계에 따라 challenger 제한 노출 상한을 35%까지 올릴 수 있다", () => {
    const seen = new Map<string, number>();
    for (let i = 0; i < 1000; i += 1) {
      const text = buildThreadsText(
        {
          title: `청년 월세 지원 신청 안내 ${i}`,
          slug: `청년-월세-지원-신청-안내-${i}`,
          description: "청년 월세 지원의 대상과 신청 방법을 정리했습니다.",
        },
        { disabledLeadVariants: ["lead_4", "lead_5"], challengerTrafficPct: 35 },
      );
      const lead = text.match(/utm_content=(lead_\d+)/)?.[1] ?? "missing";
      seen.set(lead, (seen.get(lead) ?? 0) + 1);
    }

    const challengerCount = seen.get("lead_3") ?? 0;
    expect(challengerCount).toBeGreaterThan(240);
    expect(challengerCount).toBeLessThanOrEqual(390);
    expect((seen.get("lead_0") ?? 0) + (seen.get("lead_1") ?? 0) + (seen.get("lead_2") ?? 0)).toBeGreaterThanOrEqual(610);
  });
});

describe("dispatchBlogToSns", () => {
  it("channels 옵션에 지정된 채널만 발행한다", async () => {
    vi.mocked(twitter.publishTweet).mockResolvedValue({ ok: true, id: "t1" });
    vi.mocked(facebook.publishFacebookPost).mockResolvedValue({ ok: true, id: "f1" });
    vi.mocked(threads.publishThreadsPost).mockResolvedValue({ ok: true, id: "th1" });

    const out = await dispatchBlogToSns(
      {
        title: "세대를 이어주는 끈, 기초연금",
        slug: "basic-pension",
        description:
          "매월 25일 지급되는 기초연금이 생활비와 지역 소비로 이어지는 흐름을 정리했습니다.",
      },
      { channels: ["threads"] },
    );

    expect(twitter.publishTweet).not.toHaveBeenCalled();
    expect(facebook.publishFacebookPost).not.toHaveBeenCalled();
    expect(threads.publishThreadsPost).toHaveBeenCalledOnce();
    expect(threads.publishThreadsPost).toHaveBeenCalledWith({
      text: expect.stringContaining("https://www.keepioo.com/blog/basic-pension"),
    });
    expect(threads.publishThreadsPost).toHaveBeenCalledWith({
      text: expect.stringContaining("utm_source=threads"),
    });
    expect(out).toEqual([{ channel: "threads", ok: true, id: "th1" }]);
  });

  it("한글 slug 외부 링크는 모든 SNS 채널에 percent-encoded URL로 넘긴다", async () => {
    vi.mocked(twitter.publishTweet).mockResolvedValue({ ok: true, id: "t1" });
    vi.mocked(facebook.publishFacebookPost).mockResolvedValue({ ok: true, id: "f1" });
    vi.mocked(threads.publishThreadsPost).mockResolvedValue({ ok: true, id: "th1" });

    await dispatchBlogToSns({
      title: "2026년 안양시 장애인가정 출산장려금 지원",
      slug: "2026년-안양시-장애인가정-출산장려금-지원-최대-n만원-o4muhe6c",
      description: "안양시 장애인가정 출산장려금의 대상과 신청 전 확인할 내용을 정리했습니다.",
    });

    const encodedUrl = "https://www.keepioo.com/blog/2026%EB%85%84-%EC%95%88%EC%96%91%EC%8B%9C-%EC%9E%A5%EC%95%A0%EC%9D%B8%EA%B0%80%EC%A0%95-%EC%B6%9C%EC%82%B0%EC%9E%A5%EB%A0%A4%EA%B8%88-%EC%A7%80%EC%9B%90-%EC%B5%9C%EB%8C%80-n%EB%A7%8C%EC%9B%90-o4muhe6c";
    expect(twitter.publishTweet).toHaveBeenCalledWith(expect.stringContaining(encodedUrl));
    expect(twitter.publishTweet).toHaveBeenCalledWith(expect.stringContaining("utm_source=twitter"));
    expect(facebook.publishFacebookPost).toHaveBeenCalledWith(expect.objectContaining({ link: expect.stringContaining(encodedUrl) }));
    expect(facebook.publishFacebookPost).toHaveBeenCalledWith(expect.objectContaining({ link: expect.stringContaining("utm_source=facebook") }));
    expect(threads.publishThreadsPost).toHaveBeenCalledWith({
      text: expect.stringContaining(encodedUrl),
    });
    expect(threads.publishThreadsPost).toHaveBeenCalledWith({
      text: expect.stringContaining("utm_source=threads"),
    });
  });

  it("긴 제목이어도 X/Threads 링크 본문에서 URL을 잘라먹지 않는다", async () => {
    vi.mocked(twitter.publishTweet).mockResolvedValue({ ok: true, id: "t1" });
    vi.mocked(facebook.publishFacebookPost).mockResolvedValue({ ok: true, id: "f1" });
    vi.mocked(threads.publishThreadsPost).mockResolvedValue({ ok: true, id: "th1" });

    await dispatchBlogToSns({
      title: "2026년 안양시 장애인가정 출산장려금 지원 ".repeat(8),
      slug: "2026년-안양시-장애인가정-출산장려금-지원-최대-n만원-o4muhe6c",
      description: "신청 대상과 지급 조건을 먼저 확인해야 합니다. 출산 시점, 거주 요건, 신청 서류에 따라 결과가 달라질 수 있습니다.",
    });

    const encodedUrl = "https://www.keepioo.com/blog/2026%EB%85%84-%EC%95%88%EC%96%91%EC%8B%9C-%EC%9E%A5%EC%95%A0%EC%9D%B8%EA%B0%80%EC%A0%95-%EC%B6%9C%EC%82%B0%EC%9E%A5%EB%A0%A4%EA%B8%88-%EC%A7%80%EC%9B%90-%EC%B5%9C%EB%8C%80-n%EB%A7%8C%EC%9B%90-o4muhe6c";
    const tweetText = vi.mocked(twitter.publishTweet).mock.calls[0][0];
    const threadsText = vi.mocked(threads.publishThreadsPost).mock.calls[0][0].text;

    expect(tweetText).toContain(encodedUrl);
    expect(tweetText).toContain("utm_source=twitter");
    expect(tweetText.length).toBeLessThanOrEqual(280);
    expect(threadsText).toContain(encodedUrl);
    expect(threadsText).toContain("utm_source=threads");
    expect(threadsText).toMatch(/\n\n자세히 보기\nhttps:\/\/www\.keepioo\.com\/blog\//);
    expect(threadsText.length).toBeLessThanOrEqual(500);
  });
});
