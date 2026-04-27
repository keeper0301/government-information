import { describe, it, expect } from "vitest";
import { extractOgImage } from "@/lib/og-image";

// ============================================================
// extractOgImage — naver-news 기사 페이지 og:image meta 파싱
// ============================================================
describe("extractOgImage", () => {
  it("표준 og:image (property → content)", () => {
    const html = `<head><meta property="og:image" content="https://example.com/img.jpg"></head>`;
    expect(extractOgImage(html)).toBe("https://example.com/img.jpg");
  });

  it("속성 순서 반대 (content → property)", () => {
    const html = `<meta content="https://example.com/img.jpg" property="og:image">`;
    expect(extractOgImage(html)).toBe("https://example.com/img.jpg");
  });

  it("og:image:secure_url 도 매칭", () => {
    const html = `<meta property="og:image:secure_url" content="https://example.com/secure.jpg">`;
    expect(extractOgImage(html)).toBe("https://example.com/secure.jpg");
  });

  it("og:image 없으면 twitter:image fallback", () => {
    const html = `<meta name="twitter:image" content="https://example.com/twitter.jpg">`;
    expect(extractOgImage(html)).toBe("https://example.com/twitter.jpg");
  });

  it("twitter:image:src variant 도 매칭", () => {
    const html = `<meta name="twitter:image:src" content="https://example.com/src.jpg">`;
    expect(extractOgImage(html)).toBe("https://example.com/src.jpg");
  });

  it("og:image 우선 (twitter:image 보다)", () => {
    const html = `
      <meta name="twitter:image" content="https://example.com/twitter.jpg">
      <meta property="og:image" content="https://example.com/og.jpg">
    `;
    expect(extractOgImage(html)).toBe("https://example.com/og.jpg");
  });

  it("protocol-relative URL → https: 보강", () => {
    const html = `<meta property="og:image" content="//cdn.example.com/img.jpg">`;
    expect(extractOgImage(html)).toBe("https://cdn.example.com/img.jpg");
  });

  it("http: URL → null (mixed content 회피)", () => {
    const html = `<meta property="og:image" content="http://insecure.com/img.jpg">`;
    expect(extractOgImage(html)).toBeNull();
  });

  it("상대 URL → null", () => {
    const html = `<meta property="og:image" content="/img.jpg">`;
    expect(extractOgImage(html)).toBeNull();
  });

  it("og:image meta 없음 → null", () => {
    const html = `<head><title>제목</title></head><body>본문</body>`;
    expect(extractOgImage(html)).toBeNull();
  });

  it("빈 html → null", () => {
    expect(extractOgImage("")).toBeNull();
  });

  it("싱글 쿼트 사용", () => {
    const html = `<meta property='og:image' content='https://example.com/single.jpg'>`;
    expect(extractOgImage(html)).toBe("https://example.com/single.jpg");
  });

  it("실제 한국 언론사 패턴 — 동아일보 류", () => {
    const html = `
<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<meta property="og:type" content="article">
<meta property="og:title" content="제목">
<meta property="og:image" content="https://dimg.donga.com/wps/NEWS/IMAGE/2026/04/27/abc.jpg">
<meta property="og:url" content="https://www.donga.com/news/abc.html">
</head>`;
    expect(extractOgImage(html)).toBe(
      "https://dimg.donga.com/wps/NEWS/IMAGE/2026/04/27/abc.jpg",
    );
  });

  it("query string 포함된 og:image URL", () => {
    const html = `<meta property="og:image" content="https://cdn.example.com/img.jpg?w=600&h=400">`;
    expect(extractOgImage(html)).toBe(
      "https://cdn.example.com/img.jpg?w=600&h=400",
    );
  });
});
