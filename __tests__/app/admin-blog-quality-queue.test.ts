import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const listPage = readFileSync(join(process.cwd(), "app/admin/blog/page.tsx"), "utf8");
const editPage = readFileSync(join(process.cwd(), "app/admin/blog/[id]/page.tsx"), "utf8");
const adminActions = readFileSync(join(process.cwd(), "lib/admin-actions.ts"), "utf8");

describe("admin blog quality queue UX", () => {
  it("adds a quality filter and quality status columns to the admin blog list", () => {
    expect(listPage).toContain('quality?: "all" | "needs_review" | "pending_review" | "approved"');
    expect(listPage).toContain('query = query.eq("admin_review_required", true)');
    expect(listPage).toContain('query = query.is("admin_reviewed_at", null)');
    expect(listPage).toContain('name="quality"');
    expect(listPage).toContain('value="needs_review"');
    expect(listPage).toContain("품질 보류");
  });

  it("adds an audited one-click approval action on the blog edit page", () => {
    expect(editPage).toContain("async function approveExternalQuality");
    expect(editPage).toContain("admin_review_required: false");
    expect(editPage).toContain("admin_reviewed_at: new Date().toISOString()");
    expect(editPage).toContain('action: "blog_quality_approve"');
    expect(adminActions).toContain('| "blog_quality_approve"');
    expect(editPage).toContain("수정 완료 · 품질 승인");
    expect(editPage).toContain('/admin/blog?quality=needs_review');
  });
});
