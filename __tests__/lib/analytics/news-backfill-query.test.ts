import { describe, it, expect, vi } from "vitest";
const fixtures = vi.hoisted(() => ({ news: [
  { category: "policy", summary: "s", classified_at: "date", ai_commentary: "commentary" },
  { category: "policy", summary: "s", classified_at: "date", ai_commentary: null },
  { category: "press", summary: "s", classified_at: "date", ai_commentary: null },
  { category: "policy", summary: null, classified_at: "date", ai_commentary: null },
] }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from(table: string) {
  let rows = table === "news_posts" ? [...fixtures.news] : [];
  const builder = {
    select() { return builder; },
    neq(column: string, value: unknown) { rows = rows.filter(row => row[column as keyof typeof row] !== value); return builder; },
    not(column: string, _operator: string, value: unknown) { rows = rows.filter(row => row[column as keyof typeof row] !== value); return builder; },
    then(resolve: (value: unknown) => unknown) { return Promise.resolve({ count: rows.length, error: null }).then(resolve); },
  };
  return builder;
} }) }));
import { getNewsRatio } from "@/lib/analytics/local-press-stats";
describe("백필 조회 모집단", () => {
  it("해설 없는 분류 뉴스도 분모에 포함하고 press·미분류는 제외한다", async () => {
    const result = await getNewsRatio();
    expect(result.newsIndexable).toBe(1);
    expect(result.commentaryBackfillRatio).toBe(0.5);
  });
});
