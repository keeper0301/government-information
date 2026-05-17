// ============================================================
// 청주시 parseListPage + parseDetailBody 단위 테스트 (G4)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/cheongju";

describe("cheongju parseListPage", () => {
  it("nttNo + title + 날짜 매핑", () => {
    const html = `
      <td><a href="./selectBbsNttView.do?key=23485&amp;bbsNo=40&amp;nttNo=259501&amp;pageIndex=1">청주시, 충북 최초 빈집 정비 경로당 신축 도시재생 성과</a></td>
      <td>2026.05.17</td>
      <td><a href="./selectBbsNttView.do?key=23485&amp;bbsNo=40&amp;nttNo=259500">청주시, 여름철 자연재난 종합대책 본격 추진</a></td>
      <td>2026.05.14</td>
    `;
    const items = parseListPage(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("259501");
    expect(items[0].title).toContain("빈집");
    expect(items[0].publishedDate).toBe("2026-05-17");
    expect(items[0].sourceUrl).toContain("nttNo=259501");
  });

  it("같은 nttNo 중복 link 단일화", () => {
    const html = `
      <a href="./selectBbsNttView.do?nttNo=259501">청주 첫 link 제목</a>
      <a href="./selectBbsNttView.do?nttNo=259501">청주 두번째 link</a>
    `;
    expect(parseListPage(html).length).toBe(1);
  });

  it("title 5자 미만 skip", () => {
    const html = `<a href="./selectBbsNttView.do?nttNo=1">짧음</a>`;
    expect(parseListPage(html)).toEqual([]);
  });
});

describe("cheongju parseDetailBody", () => {
  it("board_text_td 안 <br /> 분리 본문 추출", () => {
    const html = `
      <td class="board_text_td">
        - 방치된 유휴공간 정비해 주민 복지공간으로 탈바꿈 -<br/><br/>청주시는 도심에 방치된 빈집 부지를 활용해 &lsquo;충북 도내 제1호 빈집 정비 신축 경로당&rsquo;인 봉명골 경로당을 준공했다고 16일 밝혔다.<br/><br/>이번 사업은 흥덕구 봉명1동에 있던 빈집을 청주시가 직접 매입해 정비한 뒤, 지역 어르신들을 위한 경로당으로 조성한 사례다.
      </td>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("청주시");
    expect(body).toContain("'충북 도내 제1호 빈집 정비 신축 경로당'");
  });

  it("container 없음 — null", () => {
    expect(parseDetailBody(`<div class="other">한국어 충분한 본문</div>`))
      .toBeNull();
  });

  it("50자 미만 — null", () => {
    expect(parseDetailBody(`<td class="board_text_td">짧음</td>`))
      .toBeNull();
  });
});
