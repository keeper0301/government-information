// jincheon parser 회귀 방어. 진천군청 공식 보도자료의
// board_gallery 목록과 board_view 상세 본문 fallback을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/jincheon";

const MOCK_LIST_HTML = `
<table class="board_gallery">
  <tbody>
    <tr>
      <td class="board_thum">
        <a href="?menukey=247&amp;mode=view&amp;no=1005695295" title="7월 21일 보도자료">이미지</a>
      </td>
      <td class="board_con">
        <div class="board_title">
          <a href="?menukey=247&amp;mode=view&amp;no=1005695295" class="title">7월 21일 보도자료</a>
          <img src="/base/imgs/icon/icon_new.gif" alt="새글" />
        </div>
        <div class="board_content">7월 21일 보도자료</div>
        <div class="clearfix">
          <div class="board_write">홍보미디어실</div>
          <div class="board_date">2026-07-21</div>
          <div class="board_hit">48</div>
        </div>
      </td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<form id="cmsBoardData" name="cmsBoardData">
  <div class="board_view">
    <table class="board_view margin_t_10">
      <tbody>
        <tr>
          <th scope="colgroup" colspan="6" class="view_title last">
            7월 21일 보도자료<img src="/base/imgs/icon/icon_new.gif" alt="새글" />
          </th>
        </tr>
        <tr>
          <th scope="row" class="gray">등록일</th>
          <td>2026-07-21 08:28:18</td>
        </tr>
        <tr>
          <th scope="row" class="gray">첨부파일</th>
          <td colspan="5" class="txt_left">
            <span>진천군 보도자료.hwp</span>
          </td>
        </tr>
        <tr>
          <td colspan="6" class="substance">
            <p>진천군은 지역 주민의 생활 편의를 높이기 위해 우리동네쉼터 조성 사업을 본격적으로 추진한다고 밝혔다.</p>
            <p>이번 사업은 읍면별 수요 조사를 바탕으로 유휴 공간을 주민 휴식 공간으로 정비하고, 폭염과 우천에도 활용할 수 있는 그늘 시설과 의자를 설치하는 것이 핵심이다.</p>
            <p>군은 관계 부서와 협력해 안전 점검을 병행하고, 주민 의견을 반영해 쉼터 운영 시간을 탄력적으로 조정할 계획이다.</p>
            <p>군 관계자는 “주민들이 가까운 생활권에서 편안하게 쉬고 소통할 수 있는 공간을 지속적으로 확충하겠다”고 말했다.</p>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</form>
`;

describe("jincheon parseListPage", () => {
  it("board_gallery 목록에서 no, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "1005695295",
      title: "7월 21일 보도자료",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.jincheon.go.kr/home/sub.do?menukey=247&mode=view&no=1005695295",
    });
  });
});

describe("jincheon parseDetailBody", () => {
  it("첨부 전문이 없을 때 substance 상세 본문을 fallback으로 추출한다", async () => {
    const body = await parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-21");
    expect(body).toContain("우리동네쉼터 조성 사업");
  });
});
