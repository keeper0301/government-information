import { describe, expect, it } from "vitest";
import { convertToNaverBlog } from "@/lib/naver-blog/format";

describe("convertToNaverBlog — keepioo HTML → 네이버 plain text", () => {
  const basePost = {
    slug: "2026-경기도-청년-기본소득",
    title: "2026년 경기도 청년 기본소득 — 분기 25만원 자격 1분 확인",
    content: `
      <h2>이 정책은 무엇인가요?</h2>
      <p><strong>경기도 청년 기본소득</strong>은 만 24세 청년에게 분기별 25만원을 지급하는 제도입니다.</p>
      <table>
        <tr><th>지원 대상</th><td>만 24세 경기도 거주 청년</td></tr>
        <tr><th>지원 금액</th><td><strong>분기 25만원</strong></td></tr>
        <tr><th>신청 마감</th><td>2026-12-31</td></tr>
      </table>
      <h3>신청 자격</h3>
      <ul>
        <li>만 24세 청년</li>
        <li>경기도 3년 이상 거주</li>
      </ul>
      <p>자세한 내용은 <a href="https://example.go.kr/apply">공식 신청 페이지</a>에서 확인.</p>
      <p>더 많은 청년 정책은 <a href="/recommend">나에게 맞는 정책 찾기</a> 에서.</p>
    `,
    meta_description: "만 24세 경기도 청년에게 분기별 25만원을 지급하는 기본소득 제도. 신청 자격과 절차를 1분 안에 확인하세요.",
    category: "청년",
  };

  it("제목은 그대로 보존된다 (네이버 글쓰기 페이지 제목 필드)", () => {
    const out = convertToNaverBlog(basePost);
    expect(out.title).toBe(basePost.title);
  });

  it("백링크 URL 은 keepioo 도메인 + slug 로 조립된다", () => {
    const out = convertToNaverBlog(basePost);
    expect(out.backlinkUrl).toBe(
      "https://www.keepioo.com/blog/2026-경기도-청년-기본소득",
    );
  });

  it("본문에는 HTML 태그가 남아 있지 않다 (네이버 에디터는 평문 처리)", () => {
    const out = convertToNaverBlog(basePost);
    expect(out.body).not.toMatch(/<h2|<p>|<table|<strong|<ul|<li|<a /);
  });

  it("h2 는 📍 prefix, h3 는 ▶ prefix 로 변환된다", () => {
    const out = convertToNaverBlog(basePost);
    expect(out.body).toContain("📍 이 정책은 무엇인가요?");
    expect(out.body).toContain("▶ 신청 자격");
  });

  it("table 행은 'key: value' 평면화된다", () => {
    const out = convertToNaverBlog(basePost);
    expect(out.body).toContain("지원 대상: 만 24세 경기도 거주 청년");
    expect(out.body).toContain("지원 금액: 분기 25만원");
  });

  it("ul 리스트는 • 기호로 변환된다", () => {
    const out = convertToNaverBlog(basePost);
    expect(out.body).toContain("• 만 24세 청년");
    expect(out.body).toContain("• 경기도 3년 이상 거주");
  });

  it("외부 링크는 'label (url)' 형태로 보존된다", () => {
    const out = convertToNaverBlog(basePost);
    expect(out.body).toContain("공식 신청 페이지 (https://example.go.kr/apply)");
  });

  it("keepioo 내부 링크는 텍스트만 (백링크 footer 와 중복 방지)", () => {
    const out = convertToNaverBlog(basePost);
    // /recommend 같은 keepioo 내부 링크는 URL 없이 텍스트만
    expect(out.body).toContain("나에게 맞는 정책 찾기");
    expect(out.body).not.toMatch(/나에게 맞는 정책 찾기 \(\/recommend\)/);
  });

  it("백링크 footer 가 본문 끝에 자동 추가된다 (SEO 핵심)", () => {
    const out = convertToNaverBlog(basePost);
    expect(out.body).toContain("📌 더 자세한 자격·금액·신청 방법");
    expect(out.body).toContain(
      "https://www.keepioo.com/blog/2026-경기도-청년-기본소득",
    );
    expect(out.body).toContain("정책알리미 keepioo");
    expect(out.body).toContain("https://www.keepioo.com/recommend");
  });

  it("meta_description 이 도입부로 사용된다", () => {
    const out = convertToNaverBlog(basePost);
    // meta 가 본문 시작부에 포함
    const introSection = out.body.split("📍")[0];
    expect(introSection).toContain("만 24세 경기도 청년에게 분기별 25만원");
  });

  it("meta_description 이 null 이면 도입부 없이 본문 바로 시작", () => {
    const out = convertToNaverBlog({ ...basePost, meta_description: null });
    expect(out.body).toMatch(/^📍/);
  });

  it("HTML 엔티티가 디코딩된다 (&amp;·&nbsp; 등)", () => {
    const out = convertToNaverBlog({
      ...basePost,
      content: "<p>저소득 &amp; 장애인 가구&nbsp;대상</p>",
    });
    expect(out.body).toContain("저소득 & 장애인 가구 대상");
    expect(out.body).not.toContain("&amp;");
    expect(out.body).not.toContain("&nbsp;");
  });
});
