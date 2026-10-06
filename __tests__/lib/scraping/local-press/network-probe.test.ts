import { afterEach, expect, it, vi } from "vitest";
import { probeBlockedPressSites } from "@/lib/scraping/local-press/_network-probe";

afterEach(() => vi.unstubAllGlobals());

it("보안 접속만 끊기는지 확인하고 임의의 외부 주소는 호출하지 않는다", async () => {
  const fetcher = vi.fn(async (url: string) => {
    if (url.startsWith("https:")) throw Object.assign(new Error("연결 시간 초과"), { code: "ETIMEDOUT" });
    return new Response("공식 보도자료 목록");
  });
  vi.stubGlobal("fetch", fetcher);
  const rows = await probeBlockedPressSites();
  expect(rows.filter(row => "error" in row)).toHaveLength(2);
  expect(rows.filter(row => "status" in row && row.status === 200)).toHaveLength(2);
  expect(fetcher.mock.calls.every(([url]) => ["www.jungnang.go.kr", "www.miryang.go.kr"].includes(new URL(url).hostname))).toBe(true);
});
