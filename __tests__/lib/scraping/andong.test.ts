// andong parser 회귀 방어. 안동시 보도 자료의
// YH bod_list table + bod_view detail 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/andong";

describe("andong local press parser", () => {
  it("parses bod_list rows with req.post data-action ids", () => {
    const html = `
      <table class="bod_list">
        <tbody>
          <tr>
            <td class="list_num">2381</td>
            <td class="list_tit">
              <a href="#" onclick="req.post(this); return false;" data-action="/portal/bbs/view.do?bIdx=779629&amp;ptIdx=104">
                7월 27일 보도자료 <img src="/common/img/board/ico_new.gif" alt="새글" class="ico_new">
              </a>
            </td>
            <td class="list_writer">공보실</td>
            <td class="list_date">2026-07-27</td>
          </tr>
          <tr>
            <td class="list_num">2380</td>
            <td class="list_tit">
              <a href="#" onclick="req.post(this); return false;" data-action="/portal/bbs/view.do?bIdx=779628&amp;ptIdx=104">7월 26일 보도자료</a>
            </td>
            <td class="list_writer">공보실</td>
            <td class="list_date">2026-07-26</td>
          </tr>
        </tbody>
      </table>
    `;

    expect(parseListItems(html)).toEqual([
      {
        seq: "779629",
        title: "7월 27일 보도자료",
        publishedDate: "2026-07-27",
        sourceUrl:
          "https://www.andong.go.kr/portal/bbs/view.do?bIdx=779629&ptIdx=104&mId=0403010000",
      },
      {
        seq: "779628",
        title: "7월 26일 보도자료",
        publishedDate: "2026-07-26",
        sourceUrl:
          "https://www.andong.go.kr/portal/bbs/view.do?bIdx=779628&ptIdx=104&mId=0403010000",
      },
    ]);
  });

  it("parses bod_view visible detail and excludes attachments", () => {
    const article =
      "□ 7월 27일 월요일 보도자료입니다. 1. 안동시, 2026 농촌지도자 생활개선회 한마음대회 개최 2. 안동시, 일본 마쓰모토시와 청소년 문화교류 캠프 개최 3. 안동시, 제6기 지역사회보장계획 수립 연구용역 중간보고회 개최 4. 안기동 지역사회보장협의체, 3분기 정기회의 및 복달임 행사 개최 5. 평화동지역사회보장협의체, 정성 가득 삼계탕으로 무더위 이겨내요 6. 폭염도 잊게 한 안동 수페스타 첫 주말 성황 7. 안동시, 도쿄 오사카서 일본 관광시장 공략";
    const html = `
      <div class="bod_wrap">
        <div class="bod_view">
          <h4>7월 27일 보도자료</h4>
          <div class="view_info"><ul><li class="view_write"><span>작성자</span> : 공보실</li><li class="view_date"><span>작성일</span> : 2026-07-27</li></ul></div>
          <div class="view_cont"><div class="mT10">${article}</div></div>
          <dl class="view_file"><dt><span>첨부파일</span></dt><dd>7월 27일(월) 안동시 보도자료.hwp</dd></dl>
        </div>
      </div>
    `;

    const parsed = parseDetailBody(html);
    expect(parsed).toContain("7월 27일 보도자료");
    expect(parsed).toContain("작성일 : 2026-07-27");
    expect(parsed).toContain("안동시, 일본 마쓰모토시와 청소년 문화교류 캠프 개최");
    expect(parsed).not.toContain("안동시 보도자료.hwp");
    expect(parsed && parsed.length).toBeGreaterThan(250);
  });
});
