// haeundae-eminwon parser 회귀 방어. 부산 해운대구 보도/해명의
// legacy eminwon iframe + news_epct_yn=1,2 구조를 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListItems,
} from "@/lib/scraping/local-press/haeundae-eminwon";

const MOCK_LIST_HTML = `
<table>
  <tbody>
    <tr>
      <td>8484</td>
      <td class="td_left"><a href="#" onclick="javaScript:searchDetail('8484');">해운대청소년문화의집-동의대, 청소년 성장 지원 업무협약 체결</a></td>
      <td>홍보협력과</td>
      <td>2026-07-24</td>
      <td>0</td>
    </tr>
    <tr>
      <td>8442</td>
      <td class="td_left"><a href="#" onclick="javaScript:searchDetail('8442');">해운대구, 펫티켓 홍보 민·관·경 합동캠페인</a></td>
      <td>홍보협력과</td>
      <td>2026-07-18</td>
      <td>5</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<article class="news_view">
  <h2 class="newsTitle">해운대구, 펫티켓 홍보 민·관·경 합동캠페인<p class="small">등록일 ㅣ 2026-07-18 &nbsp;&nbsp;담당부서 ㅣ 홍보협력과</p></h2>
  <table class="tstyle_view">
    <tbody>
      <tr>
        <td colspan="4" class="cont">해운대구는 올바른 반려동물 문화 확산과 관광지 안전을 위해 민·관·경 합동 캠페인을 진행했다고 밝혔다. 이번 캠페인은 해수욕장과 산책로를 찾은 주민과 관광객을 대상으로 목줄 착용, 배설물 수거, 동물등록 등 기본 펫티켓을 알리고 안전사고를 예방하기 위해 마련됐다. 구는 관련 기관과 함께 현장 홍보물을 배부하고 반려인과 비반려인이 함께 이용할 수 있는 쾌적한 공공장소 환경을 조성하는 데 힘쓸 계획이다. 관계자는 성숙한 반려문화 정착을 위해 지속적으로 홍보와 점검을 이어가겠다고 말했다.</td>
      </tr>
    </tbody>
  </table>
</article>
`;

describe("haeundae-eminwon local press parser", () => {
  it("parses searchDetail rows with title, department, and date", () => {
    const items = parseListItems(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      newsEpctNo: "8484",
      title: "해운대청소년문화의집-동의대, 청소년 성장 지원 업무협약 체결",
      department: "홍보협력과",
      publishedDate: "2026-07-24",
    });
  });

  it("extracts a meaningful Korean body from news_view detail cells", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).toContain("해운대구는 올바른 반려동물 문화");
    expect(body?.length).toBeGreaterThan(250);
  });
});
