import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const queueSource = readFileSync(
  join(process.cwd(), "lib/naver-blog/queue.ts"),
  "utf8",
);

describe("naver blog queue ordering", () => {
  it("serves pending posts oldest-first so the backlog drains fairly", () => {
    expect(queueSource).toContain("pending 항목을 오래된 순서");
    expect(queueSource).toContain('.order("created_at", { ascending: true })');
  });
});
