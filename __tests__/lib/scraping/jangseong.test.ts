// jangseong parser 회귀 방어. 장성군청 공식 보도자료의
// table 목록과 show_info 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/jangseong";

const MOCK_LIST_HTML = `
<table class="list_table" id="board_list_table">
  <tbody>
    <tr>
      <td class="list_idx">7,208</td>
      <td class="list_title" style="padding-left:0px;">
        <img src="/images/board/icon_image.gif" alt="사진파일" />
        <a href="/home/www/news/jangseong/bodo/show/84404?page=1&amp;search=&amp;keyword=" class="">장성군 “장성호 조정경기장서 국대 후보선수단 전지훈...</a>
        <img src="/images/board/new.gif" alt="새로운글" />
      </td>
      <td class="list_department">기획실</td>
      <td class="list_reg_date">2026-07-23</td>
      <td class="list_visit">47</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<div class="show_info">
  <h3 class="title_en">장성군 “장성호 조정경기장서 국대 후보선수단 전지훈련”</h3>
  <h4 class="title_en2">선수단, 코치진 등 36명 규모… 31일까지 합숙훈련</h4>
  <div class="reg_info">2026-07-23 &nbsp; | &nbsp; 기획실<span style="float:right">조회수 : 48</span></div>
  <div class="con_detail">
    <div id="img_control" class="img_control">
      <img src="/module/wsboard/data/www_bodo/sample.jpg" alt="장성호 조정경기장 이미지" />
    </div>
    <p>장성군은 장성호 조정경기장에서 국가대표 후보선수단 전지훈련을 유치했다고 밝혔다.</p>
    <p>이번 훈련에는 선수단과 코치진 등 36명이 참여해 31일까지 합숙훈련을 진행한다.</p>
    <p>군은 장성호의 수상 환경과 체육 기반시설을 활용해 전문 선수단 훈련 지원과 지역경제 활성화를 함께 도모할 계획이다.</p>
    <p>군 관계자는 안전한 훈련 환경 조성과 시설 관리에 최선을 다하고, 앞으로도 스포츠 전지훈련 유치를 확대하겠다고 말했다.</p>
  </div>
  <div class="board_button"></div>
</div>
`;

describe("jangseong parseListPage", () => {
  it("보도자료 목록에서 show id, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "84404",
      title: "장성군 “장성호 조정경기장서 국대 후보선수단 전지훈...",
      publishedDate: "2026-07-23",
      sourceUrl:
        "https://www.jangseong.go.kr/home/www/news/jangseong/bodo/show/84404?page=1&search=&keyword=",
    });
  });
});

describe("jangseong parseDetailBody", () => {
  it("show_info 상세 제목과 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("국가대표 후보선수단 전지훈련");
    expect(body).toContain("지역경제 활성화");
  });
});
