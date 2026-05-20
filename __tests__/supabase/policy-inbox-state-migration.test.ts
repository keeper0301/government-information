import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260520191551_user_policy_inbox_items.sql",
);

describe("user_policy_inbox_items migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("creates a per-user policy state table with dedupe key", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.user_policy_inbox_items");
    expect(sql).toContain("program_type TEXT NOT NULL CHECK (program_type IN ('welfare', 'loan'))");
    expect(sql).toContain("UNIQUE (user_id, program_type, program_id)");
    expect(sql).toContain("read_at TIMESTAMPTZ");
    expect(sql).toContain("saved_at TIMESTAMPTZ");
    expect(sql).toContain("hidden_at TIMESTAMPTZ");
  });

  it("enables RLS and grants only authenticated user access", () => {
    expect(sql).toContain("ALTER TABLE public.user_policy_inbox_items ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_policy_inbox_items TO authenticated");
    expect(sql).toContain("USING (user_id = (SELECT auth.uid()))");
    expect(sql).toContain("WITH CHECK (user_id = (SELECT auth.uid()))");
  });
});
