import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("consult mobile layout guards", () => {
  it("allows the text input to shrink beside the send button on narrow screens", () => {
    const source = readFileSync(join(ROOT, "app/consult/page.tsx"), "utf8");

    expect(source).toContain('className="min-w-0 flex-1');
  });
});
