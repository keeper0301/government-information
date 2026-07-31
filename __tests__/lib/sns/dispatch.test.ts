import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/sns/twitter", () => ({ publishTweet: vi.fn() }));
vi.mock("@/lib/sns/facebook", () => ({ publishFacebookPost: vi.fn() }));
vi.mock("@/lib/sns/threads", () => ({ publishThreadsPost: vi.fn() }));
vi.mock("@/lib/llm/text", () => ({
  callLLM: vi.fn(),
  parseJSONResponse: (text: string) => JSON.parse(text),
}));

import { buildThreadsText, dispatchBlogToSns } from "@/lib/sns/dispatch";
import { validateCaption } from "@/lib/validate-caption";
import * as twitter from "@/lib/sns/twitter";
import * as facebook from "@/lib/sns/facebook";
import * as threads from "@/lib/sns/threads";
import { callLLM } from "@/lib/llm/text";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildThreadsText", () => {
  it("keeper.punch 문체로 짧은 훅, 쉬운 설명, 인스타 CTA, 댓글 키워드를 포함한다", () => {
    const text = buildThreadsText({
      title: "세대를 이어주는 끈, 기초연금",
      slug: "basic-pension",
      description:
        "매월 25일 지급되는 기초연금이 생활비와 지역 소비로 이어지는 흐름을 정리했습니다. 수급자 개인의 소득 보완을 넘어 동네 가게 매출과 일자리에도 영향을 주는 구조를 짚었습니다.",
    });

    expect(text).toContain("기초연금");
    expect(text).toContain("@keepioo_official");
    expect(text).toMatch(/댓글에 \*\*기초연금\*\*|\*\*기초연금\*\*.*댓글/);
    expect(text).not.toContain("대상 맞으면 그냥 넘길 일이 아니야.\n\n근데 이게 진짜 아까운 이유는 따로 있어.");
    expect(text).not.toContain("https://www.keepioo.com/blog/basic-pension");
    expect(text).not.toContain("utm_source=threads");
    expect(text.length).toBeLessThanOrEqual(500);
    expect(text.trim().length).toBeGreaterThanOrEqual(120);
  });

  it("설명이 없는 글도 문단 간격이 있는 기본 문구로 만든다", () => {
    const text = buildThreadsText({
      title: "2026년 디딤돌 창업중심대학: 과학기술원 창업기업 사업화 자금 지원",
      slug: "2026년-디딤돌-창업중심대학-지원",
    });

    expect(text).toContain("자금 막힐 때 숨통 트일 수 있어.");
    expect(text).toMatch(/대상|서류|신청처|접수 기간/);
    expect(text).toContain("@keepioo_official");
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

    expect(text).toMatch(/^장애인가정에 해당된다면|^받을 수 있는 돈|^지역 공고는|^메모용/);
    expect(text).toContain("안양시 장애인가정 출산장려금 지원");
    expect(text).toMatch(/댓글에 \*\*출산장려금\*\*|\*\*출산장려금\*\*.*댓글/);
    expect(text.length).toBeLessThanOrEqual(500);
  });

  it("댓글 키워드는 소상공인 같은 넓은 분류보다 기억하기 쉬운 정책명을 우선한다", () => {
    const text = buildThreadsText({
      title: "2026년 춘천 땡겨요 소상공인 사업자금 최대 5천만원 보증",
      slug: "2026년-춘천-땡겨요-소상공인-사업자금-최대-5천만원-보증",
      description: "춘천 땡겨요 소상공인 사업자금은 조건에 맞는 사업자에게 보증을 지원하는 제도입니다.",
    });

    expect(text).toMatch(/댓글에 \*\*땡겨요\*\*|\*\*땡겨요\*\*.*댓글/);
    expect(text).not.toContain("**소상공인**");
  });

  it("최근 keeper.punch 발행처럼 동일한 문장 뼈대를 연속 반복하지 않는다", () => {
    const first = buildThreadsText({
      title: "2026년 기업가형 소상공인 협업보증 최대 2억원 지원",
      slug: "2026-enterprising-small-business-collaboration-guarantee",
      description: "기업가형 소상공인 협업보증은 조건에 맞는 사업자에게 최대 2억원 보증을 지원하는 제도입니다. 대상과 신청 전 확인할 내용을 정리했습니다.",
    });
    const second = buildThreadsText({
      title: "2026년 공주시 위기상권 소상공인 교육 컨설팅 신용보증 지원",
      slug: "2026-gongju-crisis-commercial-area-small-business-guarantee",
      description: "공주시 위기상권 소상공인 지원은 교육, 컨설팅, 신용보증을 함께 확인해야 하는 사업입니다. 지역과 대상 조건에 따라 신청 가능 여부가 달라질 수 있습니다.",
    });

    const repeatedMacroLines = [
      "급할 때 빌릴 돈, 비싸게 쓰지 마.",
      "대상 맞으면 그냥 넘길 일이 아니야.",
      "근데 이게 진짜 아까운 이유는 따로 있어.",
      "알아서 챙겨주지 않아.",
      "대상·기간·서류부터 확인해.",
      "공식 신청처도 같이 봐야 해.",
      "@keepioo_official 인스타에 카드뉴스로 정리해뒀어.",
    ].filter((line) => first.includes(line) && second.includes(line));

    expect(repeatedMacroLines.length).toBeLessThanOrEqual(1);
    expect(first.split("\n").slice(0, 2).join("\n")).not.toBe(second.split("\n").slice(0, 2).join("\n"));
    expect(first).toContain("@keepioo_official");
    expect(second).toContain("@keepioo_official");
  });

  it("관리자 preview 모드에서는 기존 A/B 리드 추적용 UTM을 보존한다", () => {
    const text = buildThreadsText(
      {
        title: "청년 월세 지원 신청 안내",
        slug: "청년-월세-지원-신청-안내",
        description: "청년 월세 지원의 대상과 신청 방법을 정리했습니다.",
      },
      { includeChallengerLeads: true },
    );

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
        { disabledLeadVariants: ["lead_1", "lead_3", "lead_4", "lead_5"], includeChallengerLeads: true },
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
        { disabledLeadVariants: ["lead_4", "lead_5"], includeChallengerLeads: true },
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
        { disabledLeadVariants: ["lead_4", "lead_5"], challengerTrafficPct: 35, includeChallengerLeads: true },
      );
      const lead = text.match(/utm_content=(lead_\d+)/)?.[1] ?? "missing";
      seen.set(lead, (seen.get(lead) ?? 0) + 1);
    }

    const challengerCount = seen.get("lead_3") ?? 0;
    expect(challengerCount).toBeGreaterThan(240);
    expect(challengerCount).toBeLessThanOrEqual(390);
    expect((seen.get("lead_0") ?? 0) + (seen.get("lead_1") ?? 0) + (seen.get("lead_2") ?? 0)).toBeGreaterThanOrEqual(610);
  });

  it("긴 한글 slug와 짧은 설명이어도 Threads substance 검증을 통과한다", () => {
    const text = buildThreadsText({
      title: "2026년 서울특별시 청년 월세 지원 신청 안내와 소득 기준 확인",
      slug: "2026년-서울특별시-청년-월세-지원-신청-안내와-소득-기준-확인-abcdef123456",
      description: "청년 월세 지원의 대상과 신청 방법을 정리했습니다.",
    });

    expect(text.length).toBeLessThanOrEqual(500);
    expect(text).toContain("@keepioo_official");
    expect(text).toMatch(/댓글에 \*\*청년월세\*\*|\*\*청년월세\*\*.*댓글/);
    expect(text.trim().length).toBeGreaterThanOrEqual(120);
    expect(() => validateCaption(text, { source: "threads", requireSubstance: true })).not.toThrow();
  });
});

describe("dispatchBlogToSns", () => {
  it("Threads live dispatch는 고정 템플릿 대신 LLM 편집 문구를 우선 사용한다", async () => {
    vi.mocked(callLLM).mockResolvedValue(JSON.stringify({
      text: "사장님 자금 공고 볼 때는\n금액보다 조건부터 보는 게 맞아요.\n\n협업보증은 최대 2억원까지 가능하지만\n대상·접수 가능 여부를 먼저 확인해야 합니다.\n\n신청 전 체크할 내용은 @keepioo_official 카드뉴스에 정리해뒀어요.\n댓글에 **협업보증** 남겨두면 다시 보기 편합니다.",
    }));
    vi.mocked(threads.publishThreadsPost).mockResolvedValue({ ok: true, id: "th-llm" });

    await dispatchBlogToSns({
      title: "2026년 기업가형 소상공인 협업보증 최대 2억원 지원",
      slug: "2026-enterprising-small-business-collaboration-guarantee",
      description: "기업가형 소상공인 협업보증은 조건에 맞는 사업자에게 최대 2억원 보증을 지원하는 제도입니다.",
    }, { channels: ["threads"] });

    expect(callLLM).toHaveBeenCalledOnce();
    expect(threads.publishThreadsPost).toHaveBeenCalledWith({
      text: expect.stringContaining("금액보다 조건부터"),
    });
    expect(vi.mocked(threads.publishThreadsPost).mock.calls[0][0].text).not.toContain("급할 때 빌릴 돈, 비싸게 쓰지 마");
  });

  it("LLM 편집 실패 시에도 안전한 deterministic fallback으로 발행한다", async () => {
    vi.mocked(callLLM).mockRejectedValue(new Error("llm down"));
    vi.mocked(threads.publishThreadsPost).mockResolvedValue({ ok: true, id: "th-fallback" });

    await dispatchBlogToSns({
      title: "2026년 기업가형 소상공인 협업보증 최대 2억원 지원",
      slug: "2026-enterprising-small-business-collaboration-guarantee",
      description: "기업가형 소상공인 협업보증은 조건에 맞는 사업자에게 최대 2억원 보증을 지원하는 제도입니다.",
    }, { channels: ["threads"] });

    expect(callLLM).toHaveBeenCalledOnce();
    expect(threads.publishThreadsPost).toHaveBeenCalledWith({
      text: expect.stringContaining("@keepioo_official"),
    });
  });

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
      text: expect.stringContaining("@keepioo_official"),
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
      text: expect.stringContaining("@keepioo_official"),
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
    expect(threadsText).toContain("@keepioo_official");
    expect(threadsText).toMatch(/댓글에 \*\*출산장려금\*\*|\*\*출산장려금\*\*.*댓글/);
    expect(threadsText).not.toContain(encodedUrl);
    expect(threadsText.length).toBeLessThanOrEqual(500);
  });

  it("긴 한글 slug 때문에 최후 fallback으로 가도 Threads 본문 실질 기준을 통과한다", () => {
    const cases = [
      {
        title: "2026년 김천시 노인활동보조기 지원: 거동 불편 어르신 현물 지원",
        slug: "2026년-김천시-노인활동보조기-지원-거동-불편-어르신-현물-지원",
        description:
          "김천시가 거동이 불편한 어르신에게 활동보조기를 지원하는 사업입니다. 지원 대상, 신청 절차, 준비 서류와 확인할 내용을 정리했습니다.",
      },
      {
        title: "2026년 농식품 시뮬레이션 지원사업: 전북 IT·식품 중소기업 실증 지원",
        slug: "2026년-농식품-시뮬레이션-지원사업-전북-it-식품-중소기업-실증-지원",
        description:
          "전북 지역 IT·식품 중소기업이 농식품 시뮬레이션 기술을 실증할 수 있도록 지원하는 사업입니다. 참여 대상, 지원 내용, 신청 전 확인할 항목을 정리했습니다.",
      },
    ];

    for (const post of cases) {
      const text = buildThreadsText(post);
      const withoutUrls = text.replace(/https?:\/\/\S+/g, "").trim();
      const lines = withoutUrls
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      expect(text.length).toBeLessThanOrEqual(500);
      expect(withoutUrls.length).toBeGreaterThanOrEqual(120);
      expect(lines.length).toBeGreaterThanOrEqual(3);
      expect(() => validateCaption(text, { source: "threads-test", requireSubstance: true })).not.toThrow();
    }
  });
});
