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
  it("hwp_editor_board_content 우선 추출", () => {
    const html = `
      <div class="hwp_editor_board_content" style="font-family:'한컴돋움';">
        <p>익산시는 2026년 5월 15일 시민의 정착을 위한 다양한 정책을 추진한다고 밝혔다.</p>
        <p>정책은 청년·고령자 모두 대상으로 한다.</p>
      </div>
      </td>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("익산시");
    expect(body).toContain("정착");
  });

  it("view_con fallback — hwp 없을 때", () => {
    const html = `
      <div class="view_con">
        <p>익산시는 2026년 5월 15일 청년 정착 지원 사업을 시작했다고 발표했다. 신청은 시청 홈페이지에서 접수받으며 자세한 사항은 시청 청년정책과로 문의하면 된다.</p>
      </div>
      </td>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("청년 정착");
  });

  it("HTML entity 디코딩 (&middot;)", () => {
    const html = `
      <div class="hwp_editor_board_content">
        익산시는 환경&middot;경제 발전을 위한 다양한 사업을 추진합니다. 또한 시민의 삶을 위해 청년·고령자 모두를 대상으로 지원합니다. 자세한 내용은 시청에 문의 바랍니다.
      </div>
      </td>
    `;
    expect(parseDetailBody(html)).toContain("환경·경제");
  });

  it("container 없음 — null", () => {
    expect(parseDetailBody(`<p>일반 본문</p>`)).toBeNull();
  });
});
