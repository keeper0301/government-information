// ============================================================
// search-console buildSearchConsoleAlerts 단위 테스트
// ============================================================
// 클릭 0 (색인·robots·도메인) + 저 CTR (제목/meta 매력 저하) 검증.
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSearchConsoleAlerts,
  submitSearchConsoleSitemap,
} from "@/lib/external-console/search-console";

const ENV_KEYS = [
  "SC_SITE_URL",
  "SC_CLIENT_ID",
  "SC_CLIENT_SECRET",
  "SC_REFRESH_TOKEN",
] as const;

function setSearchConsoleEnv() {
  process.env.SC_SITE_URL = "https://www.keepioo.com/";
  process.env.SC_CLIENT_ID = "client-id";
  process.env.SC_CLIENT_SECRET = "client-value";
  process.env.SC_REFRESH_TOKEN = "refresh-value";
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function textResponse(body: string, status = 200) {
  return new Response(status === 204 ? null : body, { status });
}

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("buildSearchConsoleAlerts", () => {
  it("클릭 > 0 + CTR 정상 → alert 없음", () => {
    const out = buildSearchConsoleAlerts({
      clicks: 50,
      impressions: 1000,
      ctr: 0.05,
      position: 8.5,
    });
    expect(out.alerts).toHaveLength(0);
    expect(out.kpis.clicks).toBe(50);
  });

  it("클릭 0 → sc_no_clicks alert", () => {
    const out = buildSearchConsoleAlerts({
      clicks: 0,
      impressions: 100,
      ctr: 0,
      position: 50,
    });
    expect(out.alerts).toHaveLength(1);
    expect(out.alerts[0].key).toBe("sc_no_clicks");
    expect(out.alerts[0].message).toContain("노출 100");
  });

  it("저 CTR (< 0.5%) + 노출 충분 → sc_low_ctr alert", () => {
    const out = buildSearchConsoleAlerts({
      clicks: 2,
      impressions: 1000, // LOW_CTR_MIN_IMPRESSIONS 충족 가정
      ctr: 0.002, // 0.2%
      position: 20,
    });
    const lowCtr = out.alerts.find((a) => a.key === "sc_low_ctr");
    expect(lowCtr).toBeDefined();
    expect(lowCtr?.message).toContain("0.20%");
  });

  it("저 CTR 인데 노출 부족 → sc_low_ctr alert 안 함 (noisy 방지)", () => {
    const out = buildSearchConsoleAlerts({
      clicks: 0,
      impressions: 5,
      ctr: 0,
      position: 50,
    });
    expect(out.alerts.find((a) => a.key === "sc_low_ctr")).toBeUndefined();
    // 클릭 0 alert 는 별개로 떠야 함
    expect(out.alerts.find((a) => a.key === "sc_no_clicks")).toBeDefined();
  });

  it("kpis 반올림 — ctr 4자리 / position 2자리", () => {
    const out = buildSearchConsoleAlerts({
      clicks: 12,
      impressions: 567,
      ctr: 0.0211676,
      position: 14.6789,
    });
    expect(out.kpis.ctr).toBe(0.0212);
    expect(out.kpis.avg_position).toBe(14.68);
  });
});

describe("submitSearchConsoleSitemap", () => {
  it("env 누락 시 credentials missing 에러", async () => {
    await expect(submitSearchConsoleSitemap()).rejects.toThrow(
      "Search Console credentials missing",
    );
  });

  it("token refresh 후 URL-prefix property와 sitemap URL을 encode해서 PUT 호출", async () => {
    setSearchConsoleEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-token" }))
      .mockResolvedValueOnce(textResponse("", 204));
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitSearchConsoleSitemap();

    expect(result).toMatchObject({
      ok: true,
      siteUrl: "https://www.keepioo.com/",
      sitemapUrl: "https://www.keepioo.com/sitemap.xml",
      status: 204,
      body: "",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fwww.keepioo.com%2F/sitemaps/https%3A%2F%2Fwww.keepioo.com%2Fsitemap.xml",
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PUT",
      headers: { Authorization: "Bearer access-token" },
      cache: "no-store",
    });
  });

  it("token refresh 실패 body를 에러에 포함", async () => {
    setSearchConsoleEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(textResponse("invalid_grant", 401)),
    );

    await expect(submitSearchConsoleSitemap()).rejects.toThrow(
      "token refresh 401: invalid_grant",
    );
  });

  it("Google sitemap submit 403 body를 에러에 포함", async () => {
    setSearchConsoleEnv();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ access_token: "access-token" }))
        .mockResolvedValueOnce(
          textResponse('{"error":{"message":"insufficient permission"}}', 403),
        ),
    );

    await expect(submitSearchConsoleSitemap()).rejects.toThrow(
      /Search Console sitemap submit 403: .*insufficient permission/,
    );
  });
});
