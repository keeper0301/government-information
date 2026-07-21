// jeongeup parser 회귀 방어. 정읍시청 공식 보도자료방의
// board/list.jeongeup 목록과 bbs_content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/jeongeup";

const MOCK_LIST_HTML = `
<table>
  <tbody>
    <tr>
      <td>25830</td>
      <td class="txt_left">
        <a href="/board/view.jeongeup?boardId=BBS_0000019&amp;menuCd=DOM_000000101002001000&amp;paging=ok&amp;startPage=1&amp;dataSid=1416121" title="낮엔 물놀이·밤엔 음악분수…정읍 여름 명소 25일 문 연다">
          낮엔 물놀이·밤엔 음악분수…정읍 여름 명소 25일 문 연다
        </a>
      </td>
      <td>시민소통실</td>
      <td>2026-07-21</td>
      <td>20</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<table id="bbs_table" class="bbs_write">
  <tbody>
    <tr>
      <th scope="row">제목</th>
      <td>낮엔 물놀이·밤엔 음악분수…정읍 여름 명소 25일 문 연다</td>
    </tr>
    <tr>
      <th scope="row">작성자</th>
      <td>시민소통실</td>
    </tr>
    <tr>
      <th scope="row">작성일</th>
      <td>2026-07-21</td>
    </tr>
    <tr>
      <td class="bbs_content" colspan="2">
        <p>□ 낮엔 물놀이&middot;밤엔 음악분수&hellip;정읍 여름 명소 25일 문 연다</p>
        <p>정읍시는 여름 휴가철과 방학을 맞아 오는 25일부터 정읍천 미로분수 물놀이장과 내장산 워터파크 음악분수를 운영한다. 시민과 관광객들은 낮에는 물놀이를, 밤에는 음악분수 공연을 즐길 수 있다.</p>
        <p>내장산 워터파크 음악분수는 시설 정비를 마치고 오는 25일부터 10월 말까지 공연을 선보인다. 공연은 평일 오후 8시와 9시 등 하루 2차례 열리며, 주말과 공휴일에는 오후 3시와 5시, 8시, 9시 등 하루 4차례 운영한다.</p>
        <p>시는 노후한 분사구와 배관 등을 정비하고 새로운 공연 곡도 추가했다. 음악에 맞춘 화려한 조명과 다양한 분수 연출을 통해 관람객들에게 풍성한 볼거리를 선보일 예정이다.</p>
      </td>
    </tr>
  </tbody>
</table>
`;

describe("jeongeup parseListPage", () => {
  it("정읍시 보도자료방 목록에서 dataSid, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "1416121",
      title: "낮엔 물놀이·밤엔 음악분수…정읍 여름 명소 25일 문 연다",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.jeongeup.go.kr/board/view.jeongeup?boardId=BBS_0000019&menuCd=DOM_000000101002001000&paging=ok&startPage=1&dataSid=1416121",
    });
  });
});

describe("jeongeup parseDetailBody", () => {
  it("bbs_content 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-21");
    expect(body).toContain("정읍천 미로분수");
  });
});
