// ============================================================
// 익산시 parseListPage + parseDetailBody 단위 테스트 (G4)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/iksan";

describe("iksan parseListPage", () => {
  it("postUid + title + 작성일 매핑", () => {
    const html = `
      <td data-cell-header="제목" class="title">
        <a href="/board/post/view.do?boardUid=AAAA&menuUid=BBBB&postUid=4028a6109d298170019e2a10ffe86b4d" title="정헌율 익산시장, 공공기관 이전 전면전">
          <span class="tit_txt">정헌율 익산시장, 공공기관 이전 전면전</span>
        </a>
      </td>
      <td data-cell-header="작성일" class="date">
        <strong class="mtitle">작성일</strong>
        2026-05-15</td>
      <td data-cell-header="제목" class="title">
        <a href="/board/post/view.do?boardUid=AAAA&amp;menuUid=BBBB&amp;postUid=4028a6109d298170019e2a0982d76a0e" title="익산시, 청년 정착 지원금 신청">
          <span class="tit_txt">익산시, 청년 정착 지원금 신청</span>
        </a>
      </td>
      <td data-cell-header="작성일" class="date">
        <strong class="mtitle">작성일</strong>
        2026-05-14</td>
    `;
    const items = parseListPage(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("4028a6109d298170019e2a10ffe86b4d");
    expect(items[0].title).toContain("공공기관");
    expect(items[0].publishedDate).toBe("2026-05-15");
    expect(items[0].sourceUrl).toContain("postUid=4028a6109d298170019e2a10ffe86b4d");
    expect(items[0].sourceUrl).toContain("iksan.go.kr");
    // &amp; → & 디코딩
    expect(items[1].sourceUrl).not.toContain("&amp;");
    expect(items[1].sourceUrl).toContain("&menuUid=");
  });

  it("같은 postUid 중복 — 단일화", () => {
    const html = `
      <a href="/board/post/view.do?postUid=abc123" title="첫 번째 제목"></a>
      <a href="/board/post/view.do?postUid=abc123" title="중복 제목"></a>
    `;
    expect(parseListPage(html).length).toBe(1);
  });

  it("title 의 entity 디코딩 (전각 따옴표)", () => {
    const html = `
      <a href="/board/post/view.do?postUid=xyz" title="익산시 &lsquo;공공기관 이전&rsquo; 전면전"></a>
    `;
    const items = parseListPage(html);
    expect(items[0].title).toContain("'공공기관 이전'");
  });
});

describe("iksan parseDetailBody", () => {
  // 2026-06-02 — 본문이 view_con div 에 정적 존재(hwp_editor 는 빈 미끼). div 깊이 추적 복구.
  it("view_con 본문 추출 + 중첩 div(이미지 등) 안 잘림", () => {
    const html = `
      <div class="view_con">
        <p>익산시는 2026년 5월 15일 시민의 정착을 위한 다양한 정책을 추진한다고 밝혔다.</p>
        <div class="img"><img src="/a.jpg"/></div>
        <p>정책은 청년과 고령자 모두를 대상으로 하며 자세한 사항은 시청에 문의하면 된다.</p>
      </div>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("시민의 정착"); // 이미지 div 앞
    expect(body).toContain("시청에 문의"); // 뒤 (조기 잘림 X)
  });

  it("HTML entity 디코딩 (&middot;)", () => {
    const html = `
      <div class="view_con">
        익산시는 환경&middot;경제 발전을 위한 다양한 사업을 추진합니다. 또한 시민의 삶을 위해 청년·고령자 모두를 대상으로 지원합니다. 자세한 내용은 시청에 문의 바랍니다.
      </div>
    `;
    expect(parseDetailBody(html)).toContain("환경·경제");
  });

  it("container 없음 — null", () => {
    expect(parseDetailBody(`<p>일반 본문</p>`)).toBeNull();
  });

  it("view_content 유사 class 는 오매칭 안 함(\\b 단어경계)", () => {
    const html = `<div class="view_content"><p>${"한글 본문 ".repeat(40)}</p></div>`;
    expect(parseDetailBody(html)).toBeNull();
  });

  it("닫는 div 없으면 null(junk 방지)", () => {
    const html = `<div class="view_con"><p>${"한글 본문 ".repeat(40)}</p>`;
    expect(parseDetailBody(html)).toBeNull();
  });
});
