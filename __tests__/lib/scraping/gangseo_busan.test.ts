// gangseo_busan parser 회귀 방어. 부산 강서구 보도자료의
// y-CMSGovPortal 4.0 board/post list + visible detail body 구조를 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListItems,
} from "@/lib/scraping/local-press/gangseo_busan";

const MOCK_LIST_HTML = `
<table class="bod_list">
  <tbody>
    <tr>
      <td class="list_num">805</td>
      <td class="list_tit">
        <a href="#" title="게시글 상세 열람" onclick="yhLib.inline.post(this); return false;"
          data-req-form-id="viewForm" data-req-merge-form-id="listForm" data-req-get-p-idx="409111">
          부산 강서구, 부산항만공사와 손잡고 1인 가구 돌봄 강화
        </a>
      </td>
      <td class="list_file"><img src="/common/img/board/hwp.gif" alt="한글 파일"/></td>
      <td class="list_write">총무과</td>
      <td class="list_date">2026-07-21</td>
      <td class="list_hit">121</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<div class="bod_wrap">
  <div class="bod_view">
    <div class="subject">부산 강서구, 부산항만공사와 손잡고 1인 가구 돌봄 강화</div>
    <div class="view_info"><ul><li class="view_date"><span>등록일</span> 2026-07-21</li></ul></div>
    <div class="view_cont">
      <div class="mT10 ">
        ◇ 10월부터 『온(溫)스테이, 이웃돌봄방』 운영… 청년•중장년 1인 가구 맞춤 지원<br><br>
        부산 강서구는 부산항만공사와 함께 항만 인근 찾아가는 사회공헌사업 업무협약을 체결하고 지역사회 복지안전망 강화를 위한 민관 협력체계 구축에 나섰다.<br><br>
        이번 협약을 통해 복지 거점 공간을 조성해 주민 주도형 이웃돌봄방 운영, 일상생활 및 식생활 자립 역량 강화 지원, 1인 세대 프로그램 운영 등 다양한 사업을 추진한다. 이를 통해 위기가구를 선제적으로 발굴하고 대상자별 맞춤형 복지서비스를 연계하는 등 촘촘한 지역사회 돌봄체계를 구축할 계획이다.<br><br>
        부산항만공사는 찾아가는 사회공헌사업의 일환으로 매년 지원할 예정이며, 강서구는 증가하는 청년·중장년 1인 세대 등 지역 주민을 위한 사업을 중점적으로 추진할 계획이다. 구청장은 기관·단체와 협력체계를 더욱 확대해 주민 모두가 안심하며 생활할 수 있는 복지안전망을 구축하겠다고 밝혔다.
      </div>
    </div>
    <dl class="view_file clFix"><dt><span>첨부 파일</span></dt></dl>
  </div>
</div>
`;

describe("gangseo_busan local press parser", () => {
  it("parses y-CMSGovPortal board/post rows", () => {
    const items = parseListItems(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "409111",
      title: "부산 강서구, 부산항만공사와 손잡고 1인 가구 돌봄 강화",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.bsgangseo.go.kr/portal/board/post/view.do?bcIdx=526&mid=0501050000&idx=409111",
    });
  });

  it("parses visible view_cont body", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).toContain("부산 강서구는 부산항만공사와 함께");
    expect(body?.length).toBeGreaterThan(250);
    expect(body).not.toContain("첨부 파일");
  });
});
