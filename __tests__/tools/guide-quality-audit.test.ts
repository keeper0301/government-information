import { describe, expect, it } from "vitest";

import {
  analyzeGuideHtml,
  parseArgs,
  parseSitemapGuideUrls,
  stripHtml,
} from "@/tools/guide-quality-audit.mjs";
import { EDITORIAL_GUIDES } from "@/lib/editorial-guides";

describe("guide-quality-audit", () => {
  it("parses only same-origin guide review-surface URLs from sitemap", () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://www.keepioo.com/guides</loc></url>
      <url><loc>https://www.keepioo.com/guides/youth-rent-checklist-2026</loc></url>
      <url><loc>https://www.keepioo.com/c/business</loc></url>
      <url><loc>https://evil.example/guides/copied</loc></url>
      <url><loc>https://www.keepioo.com/guides/small-business-policy-fund-mistakes</loc></url>
    </urlset>`;

    expect(parseSitemapGuideUrls(xml, "https://www.keepioo.com")).toEqual([
      "https://www.keepioo.com/guides",
      "https://www.keepioo.com/guides/small-business-policy-fund-mistakes",
      "https://www.keepioo.com/guides/youth-rent-checklist-2026",
    ]);
  });

  it("detects all review-quality signals in a complete representative guide", () => {
    const result = analyzeGuideHtml(
      `<!doctype html><html><head><title>테스트 가이드 — 정책알리미</title></head><body>
        <h1>청년 월세 지원 신청 전 체크리스트</h1>
        <article>
          <p>공식 공고와 문의처를 기준으로 최종 확인해야 합니다.</p>
          <p>신청 전에는 자격, 대상, 소득 기준을 먼저 점검하세요.</p>
          <p>주민등록등본, 임대차계약서, 월세 납부 증빙 같은 서류를 준비합니다.</p>
          <p>마감 기간과 접수 예산 소진 가능성을 함께 봅니다.</p>
          <p>중복 지원 제한, 제외 대상, 환수 가능성을 확인합니다.</p>
        </article>
      </body></html>`,
      "https://www.keepioo.com/guides/test",
    );

    expect(result.title).toBe("청년 월세 지원 신청 전 체크리스트");
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(Object.fromEntries(result.checks.map((check) => [check.key, check.ok]))).toMatchObject({
      official_source: true,
      before_apply: true,
      eligibility: true,
      documents: true,
      deadline: true,
      duplicate_limits: true,
    });
  });

  it("reports missing guide signals by key without inventing pass state", () => {
    const result = analyzeGuideHtml(
      `<!doctype html><html><body>
        <h1>짧은 가이드</h1>
        <p>신청 전 대상 기준만 확인하세요.</p>
      </body></html>`,
      "https://www.keepioo.com/guides/short",
    );

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([
      "official_source",
      "documents",
      "deadline",
      "duplicate_limits",
    ]);
  });

  it("strips script/style noise and decodes common entities", () => {
    expect(stripHtml(`<style>.x{}</style><script>evil()</script><p>R&amp;D&nbsp;지원 &#39;확인&#39;</p>`)).toBe(
      "R&D 지원 '확인'",
    );
  });

  it("keeps CLI parsing deterministic", () => {
    expect(parseArgs(["--base-url", "https://example.com/", "--min-guides", "21", "--fail-on-issues", "--json"])).toMatchObject({
      baseUrl: "https://example.com",
      minGuides: 21,
      failOnIssues: true,
      json: true,
    });
  });

  it("keeps the previously flagged editorial guides covered for duplicate-limit risk", () => {
    const previouslyFlagged = new Set([
      "bokjiro-vs-gov24-difference",
      "deadline-policy-not-missing",
      "documents-before-government-benefit",
      "parents-benefit-check-guide",
    ]);

    const failures = EDITORIAL_GUIDES.filter((guide) => previouslyFlagged.has(guide.slug)).map((guide) => {
      const html = `<article><h1>${guide.title}</h1>${guide.posts.map((post) => `<p>${post}</p>`).join("")}</article>`;
      return analyzeGuideHtml(html, `https://www.keepioo.com/guides/${guide.slug}`);
    }).filter((result) => result.missing.includes("duplicate_limits"));

    expect(failures.map((result) => ({ slug: result.path.split("/").pop(), missing: result.missing }))).toEqual([]);
  });
});
