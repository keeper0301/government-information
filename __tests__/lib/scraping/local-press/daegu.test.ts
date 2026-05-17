// ============================================================
// 대구광역시 parseListPage + parseDetailBody 단위 테스트 (G4)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/daegu";

describe("daegu parseListPage", () => {
  it("aid + title attribute 매핑 (entity 디코딩)", () => {
    const html = `
      <a href="./mtnmain.php?mtnkey=articleview&mkey=scatelist&mkey2=1&aid=277035" title="&lsquo;가정의 달엔 대빵!&rsquo; 대구시, &lsquo;천하대빵데이&rsquo; 이벤트 운영">
        <span class="num">2</span>
        <p class="title">가정의 달엔 대빵! 대구시</p>
      </a>
      <a href="./mtnmain.php?mtnkey=articleview&amp;mkey=scatelist&amp;mkey2=1&amp;aid=277039" title="2026 판타지아대구페스타 봄축제 5월 개막">
        <p class="title">판타지아대구페스타</p>
      </a>
    `;
    const items = parseListPage(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("277035");
    expect(items[0].title).toContain("'가정의 달엔 대빵!'");
    expect(items[0].publishedDate).toBeNull();
    expect(items[0].sourceUrl).toContain("info.daegu.go.kr");
    expect(items[0].sourceUrl).toContain("aid=277035");
    // &amp; → & 디코딩
    expect(items[1].sourceUrl).not.toContain("&amp;");
    expect(items[1].sourceUrl).toContain("&mkey=scatelist");
  });

  it("같은 aid 중복 — 단일화", () => {
    const html = `
      <a href="./mtnmain.php?mtnkey=articleview&aid=100" title="첫 번째 제목"></a>
      <a href="./mtnmain.php?mtnkey=articleview&aid=100" title="중복 제목"></a>
    `;
    expect(parseListPage(html).length).toBe(1);
  });

  it("articleview 아닌 anchor — 무시", () => {
    const html = `
      <a href="./mtnmain.php?mtnkey=scatelist&mkey=26" title="목록 페이지">목록</a>
      <a href="./mtnmain.php?mtnkey=articleview&aid=200" title="실제 article"></a>
    `;
    const items = parseListPage(html);
    expect(items.length).toBe(1);
    expect(items[0].seq).toBe("200");
  });
});

describe("daegu parseDetailBody", () => {
  it("article_view_content 본문 추출 + 이미지 제거 + entity 디코딩", () => {
    const html = `
      <div class="article_view_content">
        &nbsp; 대구광역시는 5월 가정의 달을 맞아 시민과 관광객이 함께 즐길 수 있는 &lsquo;천하대빵데이&rsquo; 이벤트를 실시한다고 밝혔다.<br /><br />
        <p><img src="https://info.daegu.go.kr/img.jpg" alt="포스터" /></p>
        <br />&lsquo;대빵&rsquo;은 대구 명품빵 활성화 사업의 일환이다.
      </div>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("대구광역시");
    expect(body).toContain("'천하대빵데이'");
    expect(body).toContain("'대빵'");
    expect(body).not.toContain("img.jpg"); // 이미지 제거
    expect(body).not.toContain("&lsquo;"); // entity 디코딩
  });

  it("HTML entity 디코딩 (&middot;)", () => {
    const html = `
      <div class="article_view_content">
        대구광역시는 환경&middot;경제 발전을 위한 다양한 사업을 추진합니다. 시민의 삶의 질 향상을 위해 노력하고 있습니다.
      </div>
    `;
    expect(parseDetailBody(html)).toContain("환경·경제");
  });

  it("container 없음 — null", () => {
    expect(parseDetailBody(`<p>일반 본문</p>`)).toBeNull();
  });

  it("한국어 없음 — null", () => {
    expect(
      parseDetailBody(
        `<div class="article_view_content">12345 abcdef 6789012345 67890</div>`,
      ),
    ).toBeNull();
  });
});
