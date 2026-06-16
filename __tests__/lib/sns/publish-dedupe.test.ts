import { describe, expect, it } from "vitest";
import { pendingChannelsForPost, successfulChannelsForPost } from "@/lib/sns/publish-dedupe";

describe("SNS publish channel dedupe", () => {
  it("성공한 채널만 완료로 취급하고 실패 채널은 재시도 대상으로 남긴다", () => {
    const rows = [
      {
        details: {
          id: "post-1",
          results: [
            { channel: "twitter", ok: false },
            { channel: "facebook", ok: false },
            { channel: "threads", ok: true },
          ],
        },
      },
    ];

    expect([...successfulChannelsForPost(rows, "post-1")]).toEqual(["threads"]);
    expect(pendingChannelsForPost(rows, "post-1")).toEqual(["twitter", "facebook"]);
  });

  it("이전 실행이 모두 실패했으면 모든 채널을 재시도한다", () => {
    const rows = [
      {
        details: {
          id: "post-1",
          results: [
            { channel: "twitter", ok: false },
            { channel: "facebook", ok: false },
            { channel: "threads", ok: false },
          ],
        },
      },
    ];

    expect(pendingChannelsForPost(rows, "post-1")).toEqual(["twitter", "facebook", "threads"]);
  });

  it("모든 채널이 성공한 글은 재시도하지 않는다", () => {
    const rows = [
      {
        details: {
          id: "post-1",
          results: [
            { channel: "twitter", ok: true },
            { channel: "facebook", ok: true },
            { channel: "threads", ok: true },
          ],
        },
      },
    ];

    expect(pendingChannelsForPost(rows, "post-1")).toEqual([]);
  });
});
