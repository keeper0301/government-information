// gokseong parser 회귀 방어. 곡성군청 공식 보도자료의
// board_list 목록과 board_view 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/gokseong";

const MOCK_LIST_HTML = `
<table class="board_list">
  <tbody>
    <tr>
      <td class="num">8338</td>
      <td class="tit">
        <a href="/kr/board/view.do;jsessionid=ABC?bbsId=BBS_000000000000151&amp;pageIndex=1&amp;nttId=111438&amp;menuNo=102001002000&amp;searchCategory1=">
          ‘곡성교육잇다’기자단 간담회 및 보수교육 실시
        </a>
        <span class="icon_new">새 글</span>
      </td>
      <td class="writer"><span class="gokseong_manager">미래교육재단 평생교육팀</span></td>
      <td class="date">2026-07-22</td>
      <td class="file">첨부</td>
      <td class="hits">18</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<div class="boardGroup">
  <div class="board_view">
    <h3>‘곡성교육잇다’기자단 간담회 및 보수교육 실시</h3>
    <ul class="write_info">
      <li><strong>작성자</strong> : 미래교육재단 평생교육팀</li>
      <li><strong>작성일</strong> : 2026-07-22 10:43</li>
      <li><strong>조회수</strong> : 19</li>
    </ul>
    <div class="board_con">
      ‘곡성교육잇다’기자단 간담회 및 보수교육 실시<br/>
      곡성군미래교육재단은 ‘곡성교육잇다’기자단 간담회를 개최하고 지난 6월 발간한 창간호의 운영 성과를 공유하는 자리를 가졌다.<br/>
      이번 간담회는 창간호 발간 이후 기자단의 활동을 되돌아보고 향후 신문 제작의 완성도를 높이기 위해 마련됐다.<br/>
      이날 보수교육은 지역 언론사 대표를 초빙해 진행됐으며 기사 작성 기준과 편집 방향, 사진 규격 및 지면 배치 등 필요한 실무 내용을 전달했다.<br/>
      재단 관계자는 앞으로도 기자단과의 꾸준한 소통을 바탕으로 군민의 시선에서 지역 교육 소식을 생생하게 전달하겠다고 말했다.
    </div>
    <div class="img_box">이미지</div>
  </div>
</div>
`;

describe("gokseong parseListPage", () => {
  it("보도자료 목록에서 nttId, 제목, 작성일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "111438",
      title: "‘곡성교육잇다’기자단 간담회 및 보수교육 실시",
      publishedDate: "2026-07-22",
      sourceUrl:
        "https://www.gokseong.go.kr/kr/board/view.do?bbsId=BBS_000000000000151&pageIndex=1&nttId=111438&menuNo=102001002000&searchCategory1=",
    });
  });
});

describe("gokseong parseDetailBody", () => {
  it("board_con 상세 본문과 작성일을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-22");
    expect(body).toContain("곡성군미래교육재단");
  });
});
