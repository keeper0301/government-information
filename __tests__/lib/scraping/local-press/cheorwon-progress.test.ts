// 첨부 한 개가 잘못되어도 다른 정상 글을 저장해야 합니다.
import { expect, it, vi } from "vitest";
import { scrapeCheorwonBrowserAndInsert } from "@/lib/scraping/local-press/cheorwon-browser";

const state = vi.hoisted(() => ({ url: "" }));
vi.mock("playwright-core", () => ({ chromium: { launch: async () => ({
  close: async () => {},
  newPage: async () => ({
    goto: async (url: string) => { state.url = url; },
    waitForURL: async () => {}, waitForSelector: async () => {},
    content: async () => state.url.endsWith("/2") ? "정상 본문" : "목록 또는 잘못된 첨부",
    locator: () => ({ first() { return this; }, filter() { return this; },
      evaluate: async () => {}, count: async () => 1, click: async () => {} }),
    waitForEvent: async () => ({ createReadStream: async function* () { yield Buffer.from("첨부 다운로드 오류 화면"); } }),
  }),
}) } }));
vi.mock("@/lib/scraping/local-press/cheorwon", () => ({
  LIST_URL: "https://www.cwg.go.kr/list",
  parseListPage: () => [1, 2].map(seq => ({ seq: String(seq), title: `철원 지원 안내 ${seq}`,
    sourceUrl: `https://www.cwg.go.kr/${seq}`, publishedDate: "2026-10-06" })),
}));
vi.mock("@/lib/scraping/local-press/_si_ntt_helper", () => ({
  parseSiNttBody: (html: string) => html === "정상 본문" ? "철원군 지원 내용을 안내합니다. ".repeat(30) : null,
}));

it("잘못된 첨부의 오류를 남기고 다음 정상 글을 저장한다", async () => {
  const insert = vi.fn(async () => ({ error: null }));
  const result = await scrapeCheorwonBrowserAndInsert({ from: () => ({ insert }) } as never, 2);
  expect(insert).toHaveBeenCalledTimes(1);
  expect(result.inserted).toBe(1);
  expect(result.errors.join(" ")).toContain("첨부 형식 오류");
});
