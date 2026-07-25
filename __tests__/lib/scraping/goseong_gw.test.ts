// goseong_gw parser 회귀 방어. 강원 고성군청 보도자료의
// PCMS board_list 목록과 visible detail body 구조를 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/goseong_gw";

const longBody = `평화경제 거점도시 고성군은 본격적인 벼 생육기를 맞아 벼 병해충 피해 예방을 위해 벼 병해충 공동 방제 지원 사업을 추진한다. 이번 공동 방제 살포는 두 차례로 나누어 진행되며 고성군 전역을 대상으로 추진될 예정이다. 드론과 광역 방제기를 활용해 짧은 기간에 넓은 면적을 동시에 방제하고 농촌 고령화에 따른 일손 부족 해소와 농가 경영비 절감에도 도움을 줄 것으로 기대된다. 고성군은 병해충 확산을 사전에 차단하고 고품질 쌀 생산과 농가 소득 증대에 최선을 다하겠다고 밝혔다.`;

describe("goseong_gw local press parser", () => {
  it("parses board_list rows", () => {
    const html = `
      <table class="board_list table table-default">
        <tbody>
          <tr>
            <td data-cell-header="번호">5255</td>
            <td data-cell-header="제목" class="subject">
              <a href="#view" onclick="javascript: fn_search_detail('B000000079235Ug7yY2t'); return false;">(2026.7.27.일자 보도자료) 고성군, 벼 병해충 공동방제 본격 추진</a>
              <span class="ir ir-bbs ir-bbs-new">새글</span>
            </td>
            <td data-cell-header="작성자">기획조정실</td>
            <td data-cell-header="조회수">23</td>
            <td data-cell-header="등록일">2026-07-24</td>
          </tr>
        </tbody>
      </table>
    `;

    const [item] = parseListPage(html);

    expect(item).toMatchObject({
      seq: "B000000079235Ug7yY2t",
      title: "(2026.7.27.일자 보도자료) 고성군, 벼 병해충 공동방제 본격 추진",
      publishedDate: "2026-07-24",
      sourceUrl:
        "https://www.gwgs.go.kr/prog/bbsArticle/BBSMSTR_000000003771/view.do?nttId=B000000079235Ug7yY2t",
    });
  });

  it("parses visible detail body", () => {
    const html = `
      <div class="ui bbs--view">
        <div class="ui bbs--view--header">
          <h2 class="ui bbs--view--tit">(2026.7.27.일자 보도자료) 고성군, 벼 병해충 공동방제 본격 추진<span class="ir ir-bbs ir-bbs-new">새글</span></h2>
          <span class="date"><i>등록일</i>2026-07-24</span>
        </div>
        <div class="ui bbs--view--cont" data-text-content="true">
          <div class="ui bbs--detail--cont">
            <div class="ui bbs--view--content">
              <p>${longBody}</p>
              <div class="hwp_editor_board_content" id="hwpEditorBoardContent">&nbsp;</div>
            </div>
          </div>
        </div>
        <div class="kogl--mask">공공저작물 자유이용 허락 표시</div>
      </div>
    `;

    const body = parseDetailBody(html);

    expect(body).toContain("고성군, 벼 병해충 공동방제 본격 추진");
    expect(body).toContain("등록일 2026-07-24");
    expect(body).toContain("평화경제 거점도시 고성군");
    expect(body?.length).toBeGreaterThan(250);
  });
});
