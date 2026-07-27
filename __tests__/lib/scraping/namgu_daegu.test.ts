// namgu_daegu parser 회귀 방어. 대구 남구 언론브리핑의
// iCMS BBS list + #bbsView pre detail 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/namgu_daegu";

const MOCK_LIST_HTML = `
<table class="bbsList">
  <tbody>
    <tr>
      <td>5523</td>
      <td class="tal">
        <a href="javascript:;" onclick="fn_icms_navi_common('view', '192057');return false;">
          대구 남구 봉덕3동 주민자치위원회 초복 맞이 복달임 음식 나눔 행사 개최
        </a>
      </td>
      <td>봉덕3동행정복지센터</td>
      <td>2026-07-22</td>
      <td><a href="javascript:fn_egov_downFile('abc','def')">첨부</a></td>
      <td>218</td>
    </tr>
    <tr>
      <td>5522</td>
      <td class="tal">
        <a href="javascript:;" onclick="fn_icms_navi_common('view', '192030');return false;">대구 남구, 야외 자동심장충격기 설치</a>
      </td>
      <td>보건행정과</td>
      <td>2026-07-21</td>
      <td></td>
      <td>300</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<div id="bbsView">
  <div class="form_group title">
    <dl class="title"><dt><span>Notice Subject</span></dt><dd>대구 남구 봉덕3동 주민자치위원회 초복 맞이 복달임 음식 나눔 행사 개최</dd></dl>
  </div>
  <div class="form_group col02"><dl><dt>Date Created</dt><dd>2026-07-22</dd></dl></div>
  <div class="form_group content">
    <dl class="content">
      <dt class="hidden"><span>글내용</span></dt>
      <dd>
        <pre>
대구 남구 봉덕3동 주민자치위원회는 초복을 맞아 지역 어르신들의 건강한 여름나기를 응원하기 위해 초복맞이 복달임 음식 나눔 행사를 개최했다.
봉사에 참여한 주민자치위원들은 이른 아침부터 식당에 모여 삼계탕과 깍두기 재료를 손질하고 직접 포장을 진행했으며, 정성을 담아 준비한 삼계탕과 깍두기 200인분은 노인일자리 참여 어르신과 지역 경로당 어르신에게 전달됐다.
이날 행사는 어르신들의 안부를 살피고 건강한 여름나기를 기원하는 자리로 진행됐으며, 앞으로도 주민들과 함께하는 다양한 나눔 활동을 통해 따뜻한 지역사회를 만드는 데 앞장서겠다고 밝혔다.
        </pre>
      </dd>
    </dl>
  </div>
</div>
`;

describe("namgu daegu local press parser", () => {
  it("parses iCMS list rows", () => {
    const items = parseListItems(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "192057",
      title: "대구 남구 봉덕3동 주민자치위원회 초복 맞이 복달임 음식 나눔 행사 개최",
      publishedDate: "2026-07-22",
    });
    expect(items[0]?.sourceUrl).toContain("menu_link=%2Ficms%2Fbbs%2FselectBoardArticle.do");
    expect(items[0]?.sourceUrl).toContain("bbsId=BBSMSTR_000000000216");
    expect(items[0]?.sourceUrl).toContain("nttId=192057");
  });

  it("extracts visible pre body", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).toContain("대구 남구 봉덕3동 주민자치위원회는 초복을 맞아");
    expect(body?.length).toBeGreaterThan(250);
  });
});
