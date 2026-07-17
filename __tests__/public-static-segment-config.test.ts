import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const staticPages = [
  "app/help/page.tsx",
  "app/guides/page.tsx",
  "app/privacy/page.tsx",
  "app/terms/page.tsx",
  "app/refund/page.tsx",
];

const staticLayouts = [
  "app/consult/layout.tsx",
  "app/login/layout.tsx",
  "app/signup/layout.tsx",
  "app/forgot-password/layout.tsx",
  "app/reset-password/layout.tsx",
];

describe("safe public page static segment config", () => {
  it("explicitly marks server-rendered public pages as force-static", () => {
    for (const file of staticPages) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source).toContain('export const dynamic = "force-static";');
    }
  });

  it("marks client-page auth/consult shells as force-static from server layouts", () => {
    for (const file of staticLayouts) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source).toContain('export const dynamic = "force-static";');
    }
  });

  it("does not put segment config inside client page modules", () => {
    for (const file of [
      "app/consult/page.tsx",
      "app/login/page.tsx",
      "app/signup/page.tsx",
      "app/signup/sent/page.tsx",
      "app/forgot-password/page.tsx",
      "app/reset-password/page.tsx",
    ]) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source).not.toContain('export const dynamic = "force-static";');
    }
  });
});
