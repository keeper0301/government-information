import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/118_user_bookmarks_free_limit_guard.sql",
  "utf8",
);

describe("118_user_bookmarks_free_limit_guard migration", () => {
  it("adds a DB trigger that enforces the free bookmark limit", () => {
    expect(sql).toContain("CREATE TRIGGER user_bookmarks_plan_limit_before_insert");
    expect(sql).toContain("BEFORE INSERT ON public.user_bookmarks");
    expect(sql).toContain("existing_count >= 5");
    expect(sql).toContain("free_bookmark_limit_exceeded");
  });

  it("treats active Basic/Pro subscriptions as unlimited", () => {
    expect(sql).toContain("s.tier IN ('basic', 'pro')");
    expect(sql).toContain("s.status <> 'pending'");
    expect(sql).toContain("s.status <> 'cancelled'");
    expect(sql).toContain("s.current_period_end");
  });

  it("does not expose helper functions to browser client roles", () => {
    expect(sql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.user_has_active_paid_subscription(UUID) FROM anon, authenticated;",
    );
    expect(sql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.enforce_user_bookmarks_plan_limit() FROM anon, authenticated;",
    );
  });
});
