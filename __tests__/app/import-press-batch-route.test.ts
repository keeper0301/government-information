import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/import-press-batch/route";

const mocks = vi.hoisted(() => {
  const insert = vi.fn(async () => ({ error: null }));
  return {
    insert,
    from: vi.fn(() => ({ insert })),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mocks.from })),
}));

const OLD_IMPORT_PRESS_API_KEY = process.env.IMPORT_PRESS_API_KEY;

function restoreEnv() {
  if (OLD_IMPORT_PRESS_API_KEY === undefined) {
    delete process.env.IMPORT_PRESS_API_KEY;
    return;
  }
  process.env.IMPORT_PRESS_API_KEY = OLD_IMPORT_PRESS_API_KEY;
}

function request(body: unknown, apiKey = "test-key") {
  return new Request("https://www.keepioo.com/api/admin/import-press-batch", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
}

describe("플레이wright 보도자료 배치 수신", () => {
  beforeEach(() => {
    process.env.IMPORT_PRESS_API_KEY = "test-key";
    mocks.insert.mockClear();
    mocks.from.mockClear();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("수영구 배치 결과를 저장한다", async () => {
    const response = await POST(
      request({
        city: "suyeong",
        items: [
          {
            title: "수영구, 생활밀착형 지원사업 추진",
            sourceUrl: "https://www.suyeong.go.kr/board/view.suyeong?dataSid=1",
            publishedDate: "2026-05-28",
            body: "수영구는 주민 생활과 밀접한 지원사업을 추진한다고 밝혔다. ".repeat(3),
          },
        ],
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      city: "suyeong",
      inserted: 1,
    });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ministry: "수영구청",
        source_outlet: "수영구청",
        source_code: "local-press-suyeong",
      }),
    );
  });

  it("해운대구 배치 결과를 저장한다", async () => {
    const response = await POST(
      request({
        city: "haeundae",
        items: [
          {
            title: "해운대구, 주민 안전 점검 강화",
            sourceUrl:
              "https://www.haeundae.go.kr/board/view.haeundae?dataSid=1",
            publishedDate: "2026-05-28",
            body: "해운대구는 주민 안전을 위해 현장 점검을 강화한다고 밝혔다. ".repeat(3),
          },
        ],
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      city: "haeundae",
      inserted: 1,
    });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ministry: "해운대구청",
        source_outlet: "해운대구청",
        source_code: "local-press-haeundae",
      }),
    );
  });
});
