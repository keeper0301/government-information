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

  it("안산시 배치 결과를 저장한다", async () => {
    const response = await POST(
      request({
        city: "ansan",
        items: [
          {
            title: "안산시, 생활밀착형 지원사업 추진",
            sourceUrl:
              "https://www.ansan.go.kr/www/common/bbs/selectBbsDetail.do?bbs_code=B0238&bbs_seq=1",
            publishedDate: "2026-05-28",
            body: "안산시는 주민 생활과 밀접한 지원사업을 추진한다고 밝혔다. ".repeat(3),
          },
        ],
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      city: "ansan",
      inserted: 1,
    });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ministry: "안산시청",
        source_outlet: "안산시청",
        source_code: "local-press-ansan",
      }),
    );
  });

  it("김포시 배치 결과를 저장한다", async () => {
    const response = await POST(
      request({
        city: "gimpo",
        items: [
          {
            title: "김포시, 주민 안전 점검 강화",
            sourceUrl:
              "https://www.gimpo.go.kr/news/selectBbsNttView.do?nttNo=1",
            publishedDate: "2026-05-28",
            body: "김포시는 주민 안전을 위해 현장 점검을 강화한다고 밝혔다. ".repeat(3),
          },
        ],
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      city: "gimpo",
      inserted: 1,
    });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ministry: "김포시청",
        source_outlet: "김포시청",
        source_code: "local-press-gimpo",
      }),
    );
  });
});
