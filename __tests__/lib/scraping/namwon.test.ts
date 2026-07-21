// namwon parser 회귀 방어. 남원시청 공식 보도자료의
// board/post/list.do 목록과 view_table 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/namwon";

const MOCK_LIST_HTML = `
<table>
  <tbody>
    <tr>
      <td data-cell-header="번호" class="num">29,019</td>
      <td data-cell-header="제목" class="title">
        <a href="/board/post/view.do?boardUid=ff8080818ea1fec5018ea24651660037&amp;menuUid=ff8080818e3beff0018e407936b40088&amp;postUid=9be51b0f9f7cf24d019f83d42a721da2" title="남원시 작물 병해충 선제 대응 나선다">
          남원시 작물 병해충 선제 대응 나선다
        </a>
      </td>
      <td data-cell-header="제공부서" class="name">현장지원과</td>
      <td data-cell-header="첨부파일" class="file"></td>
      <td data-cell-header="작성일" class="date">2026-07-21</td>
      <td data-cell-header="조회수" class="views">14</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<table class="view_table">
  <thead>
    <tr>
      <td colspan="4" class="title">
        <strong>남원시 작물 병해충 선제 대응 나선다</strong>
      </td>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td colspan="4" class="info">
        <ul class="info_list">
          <li><strong>담당부서 :</strong><span>현장지원과</span></li>
          <li><strong>등록일 :</strong><span>2026-07-21</span></li>
        </ul>
      </td>
    </tr>
    <tr>
      <td colspan="4" class="view_con">
        <p><img src="/example.jpg" alt="0721 02" /></p>
        <p>남원시농업기술센터는 최근 고온다습한 날씨와 이상기후로 작물에 병해충이 늘고 있어 농촌진흥청, 전북특별자치도농업기술원과 함께 벼에 발생하는 병해충과 과수에 발생하는 탄저병을 현장에서 살피고 방제하는 기술을 지원한다.</p>
        <p>작물에 발생하는 병해충은 초기에 발견해 신속하게 방제할수록 확산을 막고 피해를 줄일 수 있다. 병해충이 이미 넓게 퍼진 뒤에는 방제 효과가 크게 떨어지고, 농가가 부담해야 하는 약제비와 노동력도 늘어난다.</p>
        <p>남원시농업기술센터는 7월부터 9월까지 모두 네 차례에 걸쳐 벼에 발생하는 병해충을 예찰한다. 벼멸구와 흰등멸구, 혹명나방 등 외부에서 들어오는 해충과 도열병, 깨씨무늬병 등을 중점적으로 살핀다.</p>
      </td>
    </tr>
  </tbody>
</table>
`;

describe("namwon parseListPage", () => {
  it("남원시 보도자료 목록에서 postUid, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "9be51b0f9f7cf24d019f83d42a721da2",
      title: "남원시 작물 병해충 선제 대응 나선다",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.namwon.go.kr/board/post/view.do?boardUid=ff8080818ea1fec5018ea24651660037&menuUid=ff8080818e3beff0018e407936b40088&postUid=9be51b0f9f7cf24d019f83d42a721da2",
    });
  });
});

describe("namwon parseDetailBody", () => {
  it("view_table 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-21");
    expect(body).toContain("남원시농업기술센터");
  });
});
