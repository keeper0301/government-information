import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const approvalSource = readFileSync(
  join(process.cwd(), "lib/naver-blog/approval-candidate.ts"),
  "utf8",
);

describe("naver approval candidate schema contract", () => {
  it("checks duplicate publish audits through the deployed post_id column", () => {
    expect(approvalSource).toContain('.from("naver_publish_audit")');
    expect(approvalSource).toContain('.eq("post_id", row.blog_post_id)');
    expect(approvalSource).not.toContain('.eq("blog_post_id", row.blog_post_id)');
  });
});
