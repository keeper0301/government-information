import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishReel } from "@/lib/instagram/reels";

vi.mock("@/lib/validate-caption", () => ({
  validateCaption: vi.fn(),
}));

describe("publishReel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a REELS container with public video_url parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "fixture stop" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishReel(
      {
        title: "청년 지원금 안내",
        meta_description: "신청 기간과 자격을 확인하세요.",
        category: "청년",
        tags: ["정부지원"],
        detailUrl: "https://www.keepioo.com/blog/slug",
        videoUrl: "https://cdn.keepioo.com/reels/slug.mp4",
      },
      { token: "token", userId: "ig-user" },
    );

    expect(result).toMatchObject({ ok: false, error: "reels container 생성 실패: fixture stop" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.instagram.com/v23.0/ig-user/media");
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("media_type")).toBe("REELS");
    expect(body.get("video_url")).toBe("https://cdn.keepioo.com/reels/slug.mp4");
    expect(body.get("share_to_feed")).toBe("true");
    expect(body.get("access_token")).toBe("token");
    expect(body.get("caption")).toContain("청년 지원금 안내");
  });

  it("rejects non-https video_url before calling Graph API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishReel(
      {
        title: "청년 지원금 안내",
        meta_description: "신청 기간과 자격을 확인하세요.",
        category: "청년",
        tags: [],
        detailUrl: "https://www.keepioo.com/blog/slug",
        videoUrl: "http://cdn.keepioo.com/reels/slug.mp4",
      },
      { token: "token", userId: "ig-user" },
    );

    expect(result).toMatchObject({ ok: false, error: "reels video_url 은 https public URL 이어야 함" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
