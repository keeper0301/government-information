// hongcheon parser 회귀 방어. 공식 selectEminwonNews 보도자료 목록과
// p-table 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/hongcheon";

const MOCK_LIST_HTML = `
<tbody class="text_center">
  <tr>
    <td>20773</td>
    <td class="p-subject"><a href="./selectEminwonNewsView.do?pageUnit=10&amp;pageIndex=1&amp;searchCnd=all&amp;key=283&amp;news_epct_no=20960&amp;ofr_pageSize=10">홍천군, 주거 인프라 연계 돌봄서비스 ‘홍천형 돌봄모델’로 자리매김</a></td>
    <td>행복나눔과</td>
    <td>2026-07-15</td>
    <td>91</td>
  </tr>
</tbody>
`;

const MOCK_DETAIL_HTML = `
<table class="p-table block" data-table="rwd">
  <tbody class="p-table--th-left">
    <tr>
      <th scope="row">작성부서</th><td>행복나눔과</td>
      <th scope="row">등록일자</th><td>2026-07-15</td>
    </tr>
    <tr class="p-table__subject">
      <th scope="row">제목</th>
      <td colspan="3"><span class="p-table__subject_text">홍천군, 주거 인프라 연계 돌봄서비스</span></td>
    </tr>
    <tr>
      <td colspan="4">
        홍천군이&nbsp;고령자&nbsp;복지주택&nbsp;등&nbsp;주거&nbsp;공간을&nbsp;기반으로&nbsp;추진&nbsp;중인&nbsp;주거&nbsp;인프라&nbsp;연계&nbsp;돌봄서비스&nbsp;시범&nbsp;사업이&nbsp;어르신들의&nbsp;생활&nbsp;안정과&nbsp;돌봄&nbsp;공백&nbsp;해소에&nbsp;성과를&nbsp;내고&nbsp;있다.<br />
        이&nbsp;사업은&nbsp;어르신들이&nbsp;현재&nbsp;살고&nbsp;있는&nbsp;지역사회&nbsp;안에서&nbsp;최대한&nbsp;오래&nbsp;안전하게&nbsp;생활할&nbsp;수&nbsp;있도록&nbsp;돕는&nbsp;예방적&nbsp;돌봄서비스라는&nbsp;점에서&nbsp;의미가&nbsp;크다.<br />
        홍천군은&nbsp;노인복지관과&nbsp;업무협약을&nbsp;체결하고&nbsp;AI&nbsp;케어콜&nbsp;안부&nbsp;확인,&nbsp;방문&nbsp;말벗&nbsp;지원,&nbsp;건강관리,&nbsp;여가교육&nbsp;프로그램&nbsp;등을&nbsp;통합&nbsp;제공했다.<br />
        군은&nbsp;참여자&nbsp;모집률,&nbsp;서비스&nbsp;제공&nbsp;건수,&nbsp;사업&nbsp;만족도,&nbsp;프로그램&nbsp;참석률&nbsp;등&nbsp;성과지표가&nbsp;목표를&nbsp;달성했다며&nbsp;앞으로도&nbsp;지역&nbsp;특성에&nbsp;맞는&nbsp;통합돌봄&nbsp;체계를&nbsp;확대하겠다고&nbsp;밝혔다.
      </td>
    </tr>
  </tbody>
</table>
`;

describe("hongcheon parseListPage", () => {
  it("selectEminwonNews 목록에서 seq, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "20960",
      title: "홍천군, 주거 인프라 연계 돌봄서비스 ‘홍천형 돌봄모델’로 자리매김",
      publishedDate: "2026-07-15",
      sourceUrl:
        "https://www.hongcheon.go.kr/www/selectEminwonNewsView.do?key=283&ofr_pageSize=10&news_epct_no=20960",
    });
  });
});

describe("hongcheon parseDetailBody", () => {
  it("p-table 본문에서 한국어 전문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("돌봄서비스 시범 사업");
  });
});
