// naju parser 회귀 방어. 나주시청 공식 보도자료의
// table_list 목록과 board_basic_view 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/naju";

const MOCK_LIST_HTML = `
<table class="table_list">
  <tbody>
    <tr>
      <td>10,349</td>
      <td class="align_left">
        <a href="/www/administration/reporting/coverage?idx=608835&amp;mode=view" title="전남광주통합시대, 중심도시로 대도약하는 나주의 비전 에 대한 글내용 보기.">
          <span>전남광주통합시대, 중심도시로 대도약하는 나주의 비전</span><i class="ico_new itid"></i>
        </a>
      </td>
      <td class="mob_dp_inflex">시민공감홍보실</td>
      <td class="mob_dp_inflex">2026-07-21</td>
      <td class="web_only">92</td>
    </tr>
    <tr>
      <td>10,352</td>
      <td class="align_left">
        <a href="/www/administration/reporting/coverage?idx=608868&amp;mode=view" title="나주시, 토지거래허가구역 시행…허가 대상·신청 절차 한눈에 에 대한 글내용 보기.">
          <span>나주시, 토지거래허가구역 시행…허가 대상·신청 절차 한눈에</span>
        </a>
      </td>
      <td class="mob_dp_inflex">시민봉사과</td>
      <td class="mob_dp_inflex">11:11:09</td>
      <td class="web_only">7</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<div id="board_basic_view">
  <div class="view_title">
    <p class="title" id="tit_ko">나주시, 토지거래허가구역 시행…허가 대상·신청 절차 한눈에</p>
    <ul class="info">
      <li><span class="tit">등록일</span><span class="sub">2026.07.22 11:11</span></li>
    </ul>
  </div>
  <div class="view_box"><img src="./image.jpeg" alt="나주시 보도자료 사진" /></div>
  <div class="view_box" id="con_ko">
    <p>허가신청 후 15일 이내 결정, 실수요자 중심 거래 질서 확립</p>
    <p>국토교통부의 토지거래허가구역 지정이 시행됨에 따라 나주시가 시민들의 혼선을 줄이고 원활한 부동산 거래를 지원하기 위해 허가 대상과 신청 절차, 구비서류 등 주요 사항을 안내하고 나섰다.</p>
    <p>전남광주통합특별시 나주시는 사업 예정지와 인근 지역의 부동산 투기 우려를 낮추고 실수요자 중심의 거래 질서를 확립하기 위해 주민 안내와 행정 지원을 병행할 계획이다.</p>
    <p>나주시 관계자는 시민들이 불편을 겪지 않도록 허가 기준과 처리 절차를 지속적으로 안내하겠다고 밝혔다.</p>
  </div>
  <div class="view_box" style="display:none;" id="con_en"><p></p></div>
</div>
`;

describe("naju parseListPage", () => {
  it("보도자료 목록에서 idx, 제목, 등록일을 추출하고 시간-only 날짜는 null로 둔다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "608835",
      title: "전남광주통합시대, 중심도시로 대도약하는 나주의 비전",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.naju.go.kr/www/administration/reporting/coverage?idx=608835&mode=view",
    });
    expect(items[1]).toMatchObject({
      seq: "608868",
      publishedDate: null,
    });
  });
});

describe("naju parseDetailBody", () => {
  it("con_ko 상세 본문과 등록일을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-22");
    expect(body).toContain("허가신청 후 15일 이내 결정");
  });
});
