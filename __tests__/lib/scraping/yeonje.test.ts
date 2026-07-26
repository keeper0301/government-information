// yeonje parser 회귀 방어. 부산 연제구 보도자료의
// portal/bbs goTo.view list + HWP attachment-first detail 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/yeonje";

const MOCK_LIST_HTML = `
<table class="bod_list">
  <tbody>
    <tr>
      <td class="list_bnum">13258</td>
      <td>동 행정복지센터</td>
      <td class="list_tit">
        <a href="#" onclick="goTo.view('list','131095','12','0206050000'); return false;" data-action="/portal/bbs/view.do?bIdx=131095&ptIdx=12">
          동 보도자료 모음[2026. 7. 24.(금)]
        </a>
      </td>
      <td class="list_file"><img src="/common/img/board/hwp.gif" alt="한글 파일"/></td>
      <td class="list_write">소통미디어과</td>
      <td class="list_date">2026-07-24</td>
      <td class="list_hit">44</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<div class="bod_wrap">
  <div class="bod_view">
    <h4>동 보도자료 모음[2026. 7. 24.(금)]</h4>
    <div class="view_info"><ul><li class="view_date"><span>등록일</span> : 2026-07-24</li></ul></div>
    <div class="view_file">
      <a href="#">(보도자료) 거제2동.hwp</a>
    </div>
    <div class="view_cont">
      거제2동은 지역사회 복지안전망을 강화하고 복지사각지대에 놓인 위기가구를 적극 발굴하기 위해 민관협력 업무협약을 체결하였다. 이번 협약은 지역 내 취약계층을 조기에 발견하고 필요한 복지서비스를 신속하게 연계하기 위한 것으로, 참여 기관은 정기적인 안부 확인과 자원 연계를 함께 추진한다. 동 행정복지센터는 주민과 가까운 현장에서 생활 불편과 위기 신호를 살피고, 복지 상담과 긴급 지원을 이어갈 계획이다. 관계자는 앞으로도 다양한 지역 기관과 협력해 촘촘한 복지안전망을 만들겠다고 밝혔다.
    </div>
    <div class="btn_wrap"><a>목록</a></div>
  </div>
</div>
`;

describe("yeonje local press parser", () => {
  it("parses portal/bbs goTo.view rows", () => {
    const items = parseListItems(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "131095",
      title: "동 보도자료 모음[2026. 7. 24.(금)]",
      publishedDate: "2026-07-24",
      sourceUrl:
        "https://www.yeonje.go.kr/portal/bbs/view.do?bIdx=131095&ptIdx=12&mId=0206050000",
    });
  });

  it("falls back to visible view_cont when attachment parsing is unavailable", async () => {
    const body = await parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).toContain("지역사회 복지안전망을 강화하고");
    expect(body?.length).toBeGreaterThan(250);
  });
});
