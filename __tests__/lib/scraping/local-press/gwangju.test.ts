// ============================================================
// 광주광역시청 보도자료 parser 단위 테스트
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/gwangju";

// 실제 광주광역시청 HTML 의 부분 — div.subject + div.date 패턴
const SAMPLE_LIST_HTML = `
<ul class="list_news">
  <li>
    <div class="subject">
      <a href="/boardView.do?pageId=www789&amp;boardId=BD_0000000027&amp;seq=22050&amp;movePage=1&amp;recordCnt=15" data-view="L" data-seq="22050" title="[5·18 46주년] 광주시민·공직자 등 1만여명 연대·협력의 민주평화대행진" class="new">[5·18 46주년] 광주시민·공직자 등 1만여명 연대·협력의 민주평화대...</a>
    </div>
    <div class="date">
      <span class="blind">작성일</span>
      2026-05-16
    </div>
  </li>
  <li>
    <div class="subject">
      <a href="/boardView.do?pageId=www789&amp;boardId=BD_0000000027&amp;seq=22049" data-seq="22049" title="광주시, 청년 창업 지원 확대">광주시, 청년 창업 지원 확대</a>
    </div>
    <div class="date">
      <span class="blind">작성일</span>
      2026-05-15
    </div>
  </li>
</ul>
`;

describe("parseListPage", () => {
  it("정상 HTML 2건 모두 parse", () => {
    const items = parseListPage(SAMPLE_LIST_HTML);
    expect(items).toHaveLength(2);
  });

  it("seq·title·sourceUrl·publishedDate 정확", () => {
    const items = parseListPage(SAMPLE_LIST_HTML);
    expect(items[0]).toEqual({
      seq: 22050,
      title: "[5·18 46주년] 광주시민·공직자 등 1만여명 연대·협력의 민주평화대행진",
      publishedDate: "2026-05-16",
      sourceUrl:
        "https://www.gwangju.go.kr/boardView.do?pageId=www789&boardId=BD_0000000027&seq=22050",
      body: null,
    });
  });

  it("두 번째 item 도 정확 매핑", () => {
    const items = parseListPage(SAMPLE_LIST_HTML);
    expect(items[1].title).toBe("광주시, 청년 창업 지원 확대");
    expect(items[1].publishedDate).toBe("2026-05-15");
  });

  it("빈 HTML → 빈 배열", () => {
    expect(parseListPage("")).toEqual([]);
  });
});

describe("parseDetailBody", () => {
  it("board_view_content 본문 추출", () => {
    const html = `
      <div class="board_view">
        <div class="board_view_content">
          광주시는 5·18 46주년을 맞아 시민·공직자 등 1만여 명이 참여한 연대·협력의 민주평화대행진을 진행했다.
        </div>
      </div>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("광주시는 5·18 46주년");
  });

  it("HTML entity 변환 + br 줄바꿈", () => {
    const html = `<div class="board_view_content">A&nbsp;B<br>C&amp;D</div>`;
    expect(parseDetailBody(html)).toBe("A B C&D");
  });

  it("본문 없음 → null", () => {
    expect(parseDetailBody("<html></html>")).toBeNull();
  });
});
