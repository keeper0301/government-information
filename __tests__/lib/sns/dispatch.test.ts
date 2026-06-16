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

    expect(text).toContain("세대를 이어주는 끈, 기초연금");
    expect(text).toContain("생활비와 지역 소비");
    expect(text).toContain("자세히 보기");
    expect(text).toContain("https://www.keepioo.com/blog/basic-pension");
    expect(text).not.toBe("세대를 이어주는 끈, 기초연금\n\nhttps://www.keepioo.com/blog/basic-pension");
    expect(text.replace(/https?:\/\/\S+/g, "").trim().length).toBeGreaterThanOrEqual(120);
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
    expect(out).toEqual([{ channel: "threads", ok: true, id: "th1" }]);
  });
});
