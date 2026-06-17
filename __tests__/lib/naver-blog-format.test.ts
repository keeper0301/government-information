import { describe, expect, it } from "vitest";
import { convertToNaverBlog, convertToNaverBlogHtml } from "@/lib/naver-blog/format";

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
    expect(out.body).toContain("자세한 자격·금액·신청 방법 정리");
    expect(out.body).toContain(
      "https://www.keepioo.com/blog/2026-경기도-청년-기본소득",
    );
    expect(out.body).toContain("공식 조건은 모집 시점·지역·예산에 따라 달라질 수 있어요.");
    expect(out.body).toContain("https://www.keepioo.com/recommend");
  });

  it("meta_description 이 도입부로 사용된다", () => {
    const out = convertToNaverBlog(basePost);
    // meta 가 본문 시작부에 포함
    const introSection = out.body.split("📍")[0];
    expect(introSection).toContain("만 24세 경기도 청년에게 분기별 25만원");
  });

  it("네이버 전용 도입부와 중복되는 원문 첫 문단은 한 번만 보인다", () => {
    const duplicateLead =
      "만 24세 경기도 청년에게 분기별 25만원을 지급하는 기본소득 제도. 신청 자격과 절차를 1분 안에 확인하세요.";
    const out = convertToNaverBlog({
      ...basePost,
      meta_description: duplicateLead,
      content: `<p>${duplicateLead}</p>${basePost.content}`,
    });
    expect(out.body.match(new RegExp(duplicateLead, "g"))?.length).toBe(1);
  });

  it("웹 상세 페이지용 목차 섹션은 네이버 평문 본문에서 제거된다", () => {
    const out = convertToNaverBlog({
      ...basePost,
      content: `
        <h2>이 글에서 확인할 수 있는 것</h2>
        <ul><li>신청 전에 먼저 확인해야 할 대상 조건</li></ul>
        ${basePost.content}
      `,
    });
    expect(out.body).not.toContain("이 글에서 확인할 수 있는 것");
    expect(out.body).not.toContain("신청 전에 먼저 확인해야 할 대상 조건");
    expect(out.body).toContain("📍 이 정책은 무엇인가요?");
  });

  it("본문 초반에 핵심 요약과 정책 확인 체크리스트가 들어간다", () => {
    const out = convertToNaverBlog(basePost);
    expect(out.body).toContain("한눈에 보는 핵심");
    expect(out.body).toContain("신청 전 체크포인트");
    expect(out.body).toContain("대상: 만 24세 경기도 거주 청년");
    expect(out.body).toContain("혜택: 분기 25만원");
    expect(out.body).toContain("기간: 신청 마감2026-12-31");
    expect(out.body).toContain("서류: 증빙 필요 여부 확인");
    expect(out.body).toContain("경로: 자세한 내용은 공식 신청 페이지에서 확인.");
  });

  it("meta_description 이 null 이면 도입부 없이 본문 바로 시작", () => {
    const out = convertToNaverBlog({ ...basePost, meta_description: null });
    expect(out.body).toMatch(/^한눈에 보는 핵심/);
    expect(out.body).toContain("📍 이 정책은 무엇인가요?");
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

describe("convertToNaverBlogHtml — RPA 자동 발행용 SE3 호환 HTML", () => {
  const post = {
    slug: "2026-청년-월세-지원",
    title: "2026 청년 월세 — 월 20만원 1년 지원",
    content: `
      <h2 class="big">신청 대상</h2>
      <p style="color: red;">만 19~34세 청년</p>
      <h3>지원 금액</h3>
      <ul>
        <li>월 20만원</li>
        <li>최대 12개월</li>
      </ul>
      <p>자세한 내용은 <a href="https://example.go.kr/apply">신청 페이지</a></p>
      <div>div 는 제거되고 내용만 유지</div>
      <script>alert('xss')</script>
    `,
    meta_description: "만 19~34세 청년에게 월 20만원, 최대 12개월 월세 지원.",
    category: "청년",
  };

  it("제목 + 백링크 URL 정상", () => {
    const out = convertToNaverBlogHtml(post);
    expect(out.title).toBe(post.title);
    expect(out.backlinkUrl).toBe(
      "https://www.keepioo.com/blog/2026-청년-월세-지원",
    );
  });

  it("도입부 (meta_description) hook 단락 으로 들어간다 (강조)", () => {
    const out = convertToNaverBlogHtml(post);
    expect(out.bodyHtml).toContain("<p>만 19~34세 청년에게 월 20만원, 최대 12개월 월세 지원.</p>");
  });

  it("SE3 HTML 본문에도 핵심 요약과 정책 확인 체크리스트가 들어간다", () => {
    const out = convertToNaverBlogHtml(post);
    expect(out.bodyHtml).toContain("<p><strong>한눈에 보는 핵심</strong></p>");
    expect(out.bodyHtml).toContain("<p><strong>신청 전 체크포인트</strong></p>");
    expect(out.bodyHtml).toContain("<p>• 대상: 만 19~34세 청년</p>");
    expect(out.bodyHtml).toContain("<p>• 혜택: 월 20만원</p>");
    expect(out.bodyHtml).toContain("<p>• 경로: 자세한 내용은 신청 페이지</p>");
  });

  it("inline style/class/id 모두 제거 (SE3 자체 스타일 덮어쓰기 회피)", () => {
    const out = convertToNaverBlogHtml(post);
    expect(out.bodyHtml).not.toMatch(/\sstyle=/);
    expect(out.bodyHtml).not.toMatch(/\sclass=/);
    expect(out.bodyHtml).not.toMatch(/\sid=/);
  });

  it("h2/h3 는 <p><strong>📌 ...</strong></p> 으로 강제 변환 (SE3 paste 한계 우회)", () => {
    const out = convertToNaverBlogHtml(post);
    expect(out.bodyHtml).toContain("<p><strong>📌 신청 대상</strong></p>");
    expect(out.bodyHtml).not.toContain("<h2>");
    expect(out.bodyHtml).not.toContain("<h3>");
  });

  it("ul/li 는 <p>• 항목</p> 단락으로 변환 (SE3 가 ul 무시)", () => {
    const out = convertToNaverBlogHtml(post);
    expect(out.bodyHtml).toContain("<p>• 월 20만원</p>");
    expect(out.bodyHtml).not.toContain("<ul>");
    expect(out.bodyHtml).not.toContain("<li>");
  });

  it("a 태그 + href 유지 (네이버 자동 링크화)", () => {
    const out = convertToNaverBlogHtml(post);
    expect(out.bodyHtml).toContain('<a href="https://example.go.kr/apply">');
  });

  it("script 태그 완전 제거 (안전)", () => {
    const out = convertToNaverBlogHtml(post);
    expect(out.bodyHtml).not.toMatch(/<script/i);
    expect(out.bodyHtml).not.toContain("alert");
  });

  it("div 같은 비허용 태그는 stripping (내용만 유지)", () => {
    const out = convertToNaverBlogHtml(post);
    expect(out.bodyHtml).not.toMatch(/<div/i);
    expect(out.bodyHtml).toContain("div 는 제거되고 내용만 유지");
  });

  it("백링크 footer 가 <p> + <a> 로 들어간다", () => {
    const out = convertToNaverBlogHtml(post);
    expect(out.bodyHtml).toContain(
      'https://www.keepioo.com/blog/2026-청년-월세-지원',
    );
    expect(out.bodyHtml).toContain('href="https://www.keepioo.com/blog/');
    expect(out.bodyHtml).toContain("자세한 자격·금액·신청 방법 정리");
  });

  it("SE3 HTML 에서도 중복 리드와 웹용 목차는 제거된다", () => {
    const duplicateLead = "신청 첫 화면에서 반복되면 광고처럼 보이는 도입 문장입니다. 대상과 금액을 한 번만 보여줍니다.";
    const out = convertToNaverBlogHtml({
      ...post,
      meta_description: duplicateLead,
      content: `
        <p>${duplicateLead}</p>
        <h2>이 글에서 확인할 수 있는 것</h2>
        <ul><li>신청 전에 먼저 확인해야 할 대상 조건</li></ul>
        ${post.content}
      `,
    });
    expect(out.bodyHtml.match(new RegExp(duplicateLead, "g"))?.length).toBe(1);
    expect(out.bodyHtml).not.toContain("이 글에서 확인할 수 있는 것");
    expect(out.bodyHtml).not.toContain("신청 전에 먼저 확인해야 할 대상 조건");
    expect(out.bodyHtml).toContain("<p><strong>📌 신청 대상</strong></p>");
  });

  it("SE3 HTML 출력에서 제목·도입부의 과한 CTA 문구를 정보형으로 낮춘다", () => {
    const out = convertToNaverBlogHtml({
      ...post,
      title: "2026년 대구 동구 D-LINK 사업화 지원금 500만원 놓치지 마세요!",
      meta_description:
        "대구 동구 청년 창업기업에 사업화 지원금 500만원을 제공합니다. 지금 바로 자격 확인하고 신청하세요! 성장 지원 혜택을 놓치지 마세요.",
      content: `
        <h2>지원 대상</h2>
        <p>대구 동구 거주 및 사업장 소재 청년 창업기업이 대상입니다. 지금 바로 자격을 확인하세요!</p>
        <h2>지원 금액</h2>
        <p>기업별 사업화 지원금 각 500만 원을 지원합니다. 2026년 상반기 마감 전 지금 바로 확인 (정확한 일정은 공식 공고 확인)</p>
      `,
    });

    expect(out.title).toBe("2026년 대구 동구 D-LINK 사업화 지원금 500만원");
    expect(out.bodyHtml).toContain("자격 조건과 신청 경로를 확인하세요");
    expect(out.bodyHtml).not.toContain("지금 바로 자격 확인하고 신청하세요");
    expect(out.bodyHtml).not.toContain("지금 바로 자격을 확인하세요");
    expect(out.bodyHtml).not.toContain("지금 바로 확인");
    expect(out.bodyHtml).not.toContain("성장 지원 혜택을.");
    expect(out.bodyHtml).not.toContain("놓치지 마세요");
  });

  it("meta_description 없으면 도입부 없이 본문부터", () => {
    const out = convertToNaverBlogHtml({ ...post, meta_description: null });
    // body 의 첫 줄이 도입부가 아니라 본문 (h3 또는 다른 태그)
    expect(out.bodyHtml.startsWith("<p>만 19~34세")).toBe(false);
  });
});
