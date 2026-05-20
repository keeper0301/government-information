import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("check-policy-inbox-storage script", () => {
  it("checks the committed migration without requiring Supabase credentials", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/check-policy-inbox-storage.mjs", "--json"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const parsed = JSON.parse(output) as {
      ok: boolean;
      migration: { exists: boolean; hasTable: boolean; hasRls: boolean; hasPolicies: boolean };
      env: { checked: boolean };
    };

    expect(parsed.ok).toBe(true);
    expect(parsed.migration).toMatchObject({
      exists: true,
      hasTable: true,
      hasRls: true,
      hasPolicies: true,
    });
    expect(parsed.env.checked).toBe(true);
  });
});
