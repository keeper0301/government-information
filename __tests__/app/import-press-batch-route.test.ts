import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/import-press-batch/route";
import { logAdminAction } from "@/lib/admin-actions";

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

vi.mock("@/lib/admin-actions", () => ({
  logAdminAction: vi.fn(async () => undefined),
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
    vi.mocked(logAdminAction).mockClear();
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
            body: "안산시는 주민 생활과 밀접한 지원사업을 추진한다고 밝혔다. ".repeat(10),
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
            body: "김포시는 주민 안전을 위해 현장 점검을 강화한다고 밝혔다. ".repeat(10),
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

  // 401 negative — timing-safe 인증 변환 후 회귀 안전망
  it("잘못된 API key 는 401 반환", async () => {
    const response = await POST(
      request({ city: "ansan", items: [] }, "wrong-key"),
    );
    expect(response.status).toBe(401);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("API key 헤더가 없으면 401 반환", async () => {
    const req = new Request("https://www.keepioo.com/api/admin/import-press-batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ city: "ansan", items: [] }),
    });
    const response = await POST(req);
    expect(response.status).toBe(401);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("API key 길이만 다른 입력은 401 반환 (timingSafeEqual length 분기)", async () => {
    // expected="test-key"(8자), 입력 "test-key-extra"(14자) — length 다르면 early-return.
    const response = await POST(
      request({ city: "ansan", items: [] }, "test-key-extra"),
    );
    expect(response.status).toBe(401);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("같은 길이 다른 바이트 키는 401 반환 (timingSafeEqual 실 경로)", async () => {
    // expected="test-key"(8자), 입력 "test-keX"(8자) — 같은 length, 마지막 byte 다름.
    // timingSafeEqual 가 실제 byte-level 비교에서 false 반환하는 경로 검증.
    const response = await POST(
      request({ city: "ansan", items: [] }, "test-keX"),
    );
    expect(response.status).toBe(401);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("빈 items 도 local_press_scrape audit 를 남겨 no_audit 오탐을 막는다", async () => {
    const response = await POST(request({ city: "seongnam", items: [] }));

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      city: "seongnam",
      fetched: 0,
      inserted: 0,
    });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "local_press_scrape",
        details: expect.objectContaining({
          city: "성남시",
          fetched: 0,
          inserted: 0,
          errors: [],
        }),
      }),
    );
  });

  it("runnerError 를 audit errors 에 남겨 collector 실패 원인을 보존한다", async () => {
    const response = await POST(
      request({ city: "uijeongbu", items: [], runnerError: "navigation timeout" }),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      city: "uijeongbu",
      fetched: 0,
    });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "local_press_scrape",
        details: expect.objectContaining({
          city: "의정부시",
          errors: ["runner_error: navigation timeout"],
        }),
      }),
    );
  });
});
