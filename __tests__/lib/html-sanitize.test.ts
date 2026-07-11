import { describe, expect, it } from "vitest";
import { sanitizeBlogHtml } from "@/lib/html-sanitize";

describe("sanitizeBlogHtml", () => {
  it("removes script tags and inline event handlers", async () => {
    const html = await sanitizeBlogHtml(
      `<p onclick="alert(1)">안내</p><script>alert(1)</script><img src="https://example.com/a.png" onerror="alert(2)">`,
    );

    expect(html).toContain("안내");
    expect(html).not.toContain("script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onerror");
  });

  it("blocks javascript and non-image data URLs while keeping safe links", async () => {
    const html = await sanitizeBlogHtml(
      `<a href="javascript:alert(1)">bad</a><a href="/recommend">safe</a><img src="data:text/html;base64,PHNjcmlwdD4="><img src="data:image/png;base64,AAAA">`,
    );

    expect(html).toContain(`href="/recommend"`);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    expect(html).toContain("data:image/png;base64,AAAA");
  });

  it("keeps allowed blog structure tags", async () => {
    const html = await sanitizeBlogHtml(
      `<h2>누가 받을 수 있나요?</h2><table><tbody><tr><th>대상</th><td><strong>청년</strong></td></tr></tbody></table><ol><li>신청</li></ol>`,
    );

    expect(html).toContain("<h2>");
    expect(html).toContain("<table>");
    expect(html).toContain("<strong>");
    expect(html).toContain("<ol>");
  });
});
