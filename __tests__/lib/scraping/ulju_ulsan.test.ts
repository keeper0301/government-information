// ulju_ulsan parser 회귀 방어. 울산 울주군 보도자료의
// YH bod_list table + bod_view detail 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/ulju_ulsan";

describe("ulju_ulsan local press parser", () => {
  it("parses YH bod_list rows with goTo.view ids", () => {
    const html = `
      <table class="bod_list">
        <tbody>
          <tr>
            <td class="list_num">12422</td>
            <td class="list_tit">
              <a href="#" onclick="goTo.view('list','67723','146','0404020000'); return false;" title="울주군, 모기·해충 방역 비상체계 가동  ">
                울주군, 모기·해충 방역 비상체계 가...
                <span class="ico_new"><span class="blind">새 글</span></span>
              </a>
            </td>
            <td class="list_file"><img src="/common/img/board/jpeg.gif" alt="jpeg"/></td>
            <td class="list_write">성**</td>
            <td class="list_date">2026-07-27</td>
            <td class="list_hit">6</td>
          </tr>
          <tr>
            <td class="list_num">12421</td>
            <td class="list_tit">
              <a href="#" onclick="goTo.view('list','67722','146','0404020000'); return false;" title="울주군, 간부공무원 4대 폭력 예방교육 실시">
                울주군, 간부공무원 4대 폭력 예방교...
              </a>
            </td>
            <td class="list_file"></td>
            <td class="list_write">성**</td>
            <td class="list_date">2026-07-27</td>
            <td class="list_hit">10</td>
          </tr>
        </tbody>
      </table>
    `;

    expect(parseListItems(html)).toEqual([
      {
        seq: "67723",
        title: "울주군, 모기·해충 방역 비상체계 가동",
        publishedDate: "2026-07-27",
        sourceUrl:
          "https://www.ulju.ulsan.kr/ulju/bbs/view.do?ptIdx=146&mId=0404020000&bIdx=67723",
      },
      {
        seq: "67722",
        title: "울주군, 간부공무원 4대 폭력 예방교육 실시",
        publishedDate: "2026-07-27",
        sourceUrl:
          "https://www.ulju.ulsan.kr/ulju/bbs/view.do?ptIdx=146&mId=0404020000&bIdx=67722",
      },
    ]);
  });

  it("parses bod_view visible detail body before attachments", () => {
    const bodyText =
      "울산 울주군이 최근 마른 장마와 고온다습한 날씨로 인해 모기 등 해충이 급증함에 따라 방역 비상체계를 가동한다고 밝혔다. 울주군에 따르면 올해는 장마철 강수량이 적고 고온다습한 환경이 이어지면서 웅덩이와 하천변 등 모기 번식에 최적의 조건이 조성됐다. 이에 따라 군민 불편을 최소화하고 감염병 발생을 예방하기 위해 울주군 전역을 대상으로 유충 구제 사업을 대폭 강화해 추진한다. 방역반은 정화조, 하수구, 연못 등 모기 서식 우려 지역에 대한 예찰과 친환경 약품 투여를 병행한다.";
    const html = `
      <div class="bod_wrap">
        <div class="bod_view">
          <h4>울주군, 모기·해충 방역 비상체계 가동</h4>
          <div class="view_info"><ul><li class="view_date"><span>등록일</span> : 2026-07-27</li></ul></div>
          <div class="view_cont"><div class="mT10">${bodyText}<br /><br />문의처:건강관리과</div></div>
          <dl class="view_file clFix"><dt><span>첨부 파일</span></dt><dd>JPEG files</dd></dl>
        </div>
      </div>
    `;

    const parsed = parseDetailBody(html);
    expect(parsed).toContain("울주군, 모기·해충 방역 비상체계 가동");
    expect(parsed).toContain("2026-07-27");
    expect(parsed).toContain("방역 비상체계를 가동한다고 밝혔다");
    expect(parsed).not.toContain("JPEG files");
    expect(parsed && parsed.length).toBeGreaterThan(250);
  });
});
