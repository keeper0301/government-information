// 느린 공식 사이트에서도 10글을 제한 시간 안에 읽는지 확인합니다.
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { scrapeGeumcheonAndInsert } from "@/lib/scraping/local-press/geumcheon";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("글마다 9초가 걸려도 60초 안에 10글을 저장하고 동시 요청은 두 개 이하이다", async () => {
  vi.useFakeTimers();
  const list = readFileSync("__tests__/fixtures/local-press/geumcheon-current-list.html", "utf8");
  const body = `<td class="p-table__content">${"금천구가 주민을 위한 지원 사업을 안내합니다. ".repeat(60)}</td>`;
  let active = 0, maximum = 0, done = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 9000));
    active--;
    return new Response(url.includes("List.do") ? list : body);
  }));
  const admin = { from: vi.fn(() => ({ insert: vi.fn(async () => ({ error: null })) })) };
  const pending = scrapeGeumcheonAndInsert(admin as never, 10).then(result => { done = true; return result; });
  await vi.advanceTimersByTimeAsync(60000);
  expect(done).toBe(true);
  expect(maximum).toBeLessThanOrEqual(2);
  expect((await pending).inserted).toBe(10);
});
