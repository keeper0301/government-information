// junggu_daegu parser 회귀 방어. 대구 중구 보도자료의
// legacy board_8 list + HWP attachment-first detail 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/junggu_daegu";

const MOCK_LIST_HTML = `
<table class="boardList tac">
  <tbody>
    <tr>
      <td class="num">5328</td>
      <td class="tal subject">
        <a href="/new/pages/administration/page.html?mc=161&amp;no=5413&amp;mode=view&amp;bbs_id=board_8&amp;start=0&amp;key=&amp;keyword=">“다함께 놀장(場) 동네한바퀴”</a>
        <img src="/new/board/images/new.gif" alt="새글" />
      </td>
      <td class="writer">혁신사업홍보과</td>
      <td class="datatime">2026-07-24</td>
      <td class="preview"><a href="/new/board/download_utf8.php?file=abc&amp;bbs_id=board_8&amp;no=5413">첨부</a></td>
      <td class="hit">4</td>
    </tr>
    <tr>
      <td class="num">5327</td>
      <td class="tal subject"><a href="/new/pages/administration/page.html?mc=161&amp;no=5412&amp;mode=view&amp;bbs_id=board_8">대구중구도심재생문화재단, 민간 문화공간 연계 생활문화 프로그램 운영</a></td>
      <td class="writer">혁신사업홍보과</td>
      <td class="datatime">2026-07-24</td>
      <td class="preview"></td>
      <td class="hit">6</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<table class="boardView bbsNoticeView">
  <tbody>
    <tr><th scope="row">제목</th><td colspan="3">“다함께 놀장(場) 동네한바퀴”</td></tr>
    <tr><th scope="row">담당부서</th><td>혁신사업홍보과</td><th scope="row">등록일자</th><td>2026-07-24</td></tr>
    <tr><th scope="row">첨부파일</th><td colspan="3"><a href="/new/board/download_utf8.php?file=abc&amp;bbs_id=board_8&amp;no=5413">보도자료.hwp</a></td></tr>
    <tr>
      <td colspan="4" class="boardViewBody" data-brl-flag="7">
        대구광역시 중구 성내1동 지역사회보장협의체는 관내 어르신들을 모시고 성내1동 1마을1특화사업 온기나눔 공방 프로그램 중 하나인 아로마테라피 체험활동을 진행했다. 이번 행사는 주민들이 함께 참여해 소통하고 정서적 안정을 높이는 시간을 마련하기 위해 추진됐다. 중구는 앞으로도 주민 중심의 복지 공동체 조성을 위해 다양한 특화사업을 지속적으로 운영할 계획이라고 밝혔다. 참여자들은 직접 향기 제품을 만들며 이웃과 교류했고, 관계자는 지역 내 취약계층의 생활 활력을 높이는 데 도움이 될 것이라고 설명했다.
      </td>
    </tr>
  </tbody>
</table>
`;

describe("junggu daegu local press parser", () => {
  it("parses legacy board_8 rows", () => {
    const items = parseListItems(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "5413",
      title: "“다함께 놀장(場) 동네한바퀴”",
      department: "혁신사업홍보과",
      publishedDate: "2026-07-24",
    });
    expect(items[0]?.sourceUrl).toContain("no=5413");
    expect(items[0]?.sourceUrl).toContain("bbs_id=board_8");
  });

  it("extracts visible boardViewBody fallback", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).toContain("대구광역시 중구 성내1동 지역사회보장협의체");
    expect(body?.length).toBeGreaterThan(250);
  });
});
