import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { EDITORIAL_GUIDES } from "@/lib/editorial-guides";
import { getGuideEvidence } from "@/lib/guide-evidence";
import { getGuidePublication } from "@/lib/guide-publication";
import { getGuides } from "@/lib/policy-guides";
import { GuideArticleBody } from "@/components/guide-article-body";

vi.mock("@/lib/supabase/env", () => ({ hasSupabaseAnonEnv: () => false }));
const drafts = [
  ["bokjiro-vs-gov24-difference", "portal-comparison"],
  ["policy-application-call-script", "contact-preparation"],
  ["deadline-policy-not-missing", "deadline-check"],
] as const;

describe("승인한 다음 세 글의 내용과 화면", () => {
  for (const [slug, filename] of drafts) {
    it(`${slug}의 승인 본문을 그대로 반영하고 표를 읽을 수 있게 표시한다`, () => {
      // 윈도우와 운영 검사 서버의 줄바꿈 차이는 본문 변경으로 취급하지 않습니다.
      const draft = readFileSync(`docs/adsense-recovery/drafts/2026-10-05-${filename}.md`, "utf8").replace(/\r\n/g, "\n");
      const body = draft.split("\n## 본문\n\n")[1].split("\n## 공식 출처와 확인 범위")[0].trim();
      const sections = body.split("\n### ");
      const guide = EDITORIAL_GUIDES.find(item => item.slug === slug)!;
      expect(guide.title).toBe(draft.split("\n")[0].slice(2));
      expect(guide.posts).toEqual(sections.map((section, index) => index === 0 ? section.trim() : section.slice(section.indexOf("\n") + 1).trim()));
      const evidence = getGuideEvidence(guide)!;
      expect(getGuidePublication(guide).published).toBe(true);
      expect(getGuidePublication({ ...guide, posts: [...guide.posts, "승인 이후 변경"] }).published).toBe(false);
      const html = renderToStaticMarkup(<GuideArticleBody posts={guide.posts} headings={evidence.headings} />);
      const document = load(html);
      expect(document("table")).toHaveLength(1);
      expect(document("th").length).toBeGreaterThan(1);
      expect(document("td").length).toBeGreaterThan(1);
      expect(document("[data-guide-body]").text()).not.toContain("|---");
      if (slug === "policy-application-call-script") expect(document("blockquote").text()).toContain("사업명");
    });
  }
  it("공개 목록은 여덟 글만 포함한다", async () => {
    expect(await getGuides(50, { publicationOnly: true })).toHaveLength(8);
  });
  it("표와 본문의 외부 태그는 실행 가능한 요소로 만들지 않는다", () => {
    const html = renderToStaticMarkup(<GuideArticleBody posts={["| 항목 | 값 |\n|---|---|\n| <script>실행</script> | <img src=x> |"]} headings={["표"]} />);
    const document = load(html);
    expect(document("script, img")).toHaveLength(0);
    expect(document("td").first().text()).toBe("<script>실행</script>");
  });
});
