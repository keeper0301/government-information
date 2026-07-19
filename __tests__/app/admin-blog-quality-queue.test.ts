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
    expect(listPage).toContain("외부 발행 차단 해소 순서");
    expect(listPage).toContain("수정 → LLM 재검수 → 승인");
    expect(listPage).toContain('isQualityReviewQueue ? "처리" : "수정"');
  });

  it("adds an audited one-click approval action on the blog edit page", () => {
    expect(editPage).toContain("async function approveExternalQuality");
    expect(editPage).toContain("admin_review_required: false");
    expect(editPage).toContain("admin_reviewed_at: new Date().toISOString()");
    expect(editPage).toContain('action: "blog_quality_approve"');
    expect(adminActions).toContain('| "blog_quality_approve"');
    expect(editPage).toContain("직접 확인 완료 · 수동 승인");
    expect(editPage).toContain('/admin/blog?quality=needs_review');
    expect(editPage).toContain("통과하지 못했지만 운영자가 직접 확인한 경우에만 수동 품질 승인");
  });

  it("adds an audited LLM recheck action before manual approval", () => {
    expect(editPage).toContain("async function recheckExternalQuality");
    expect(editPage).toContain("evaluateBlogQuality");
    expect(editPage).toContain("isTransientQualityReviewFailure");
    expect(editPage).toContain('action: "blog_quality_recheck"');
    expect(adminActions).toContain('| "blog_quality_recheck"');
    expect(adminActions).toContain('blog_quality_recheck: "블로그 품질 재검수"');
    expect(editPage).toContain("저장 후 LLM 재검수");
  });
});
