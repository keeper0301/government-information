// yangpyeong parser 회귀 방어. 양평군청 공식 보도자료의
// SI p-table 목록/상세 구조와 공용 SI 본문 파서를 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/yangpyeong";

describe("yangpyeong local press parser", () => {
  it("p-table 목록에서 id/title/date/sourceUrl을 추출한다", () => {
    const html = `
      <table class="p-table simple">
        <tbody class="text_center">
          <tr>
            <td>15,496</td>
            <td class="p-subject">
              <a href="./selectBbsNttView.do?key=1112&amp;bbsNo=2&amp;nttNo=310355&amp;searchCtgry=&amp;searchCnd=all&amp;searchKrwd=&amp;pageIndex=1&amp;integrDeptCode=" >
                단월면&nbsp;부안2리,‘달리는&nbsp;행복&nbsp;나눔&nbsp;이웃들’로&nbsp;행복&nbsp;충전!
                <span class="p-icon p-icon__new">새글</span>
              </a>
            </td>
            <td>단월면</td>
            <td><time datetime="2026-07-24">2026-07-24</time></td>
            <td>17</td>
          </tr>
        </tbody>
      </table>
    `;

    expect(parseListPage(html)).toEqual([
      {
        seq: "310355",
        title: "단월면 부안2리,‘달리는 행복 나눔 이웃들’로 행복 충전!",
        publishedDate: "2026-07-24",
        sourceUrl:
          "https://www.yp21.go.kr/www/selectBbsNttView.do?key=1112&bbsNo=2&nttNo=310355&searchCtgry=&searchCnd=all&searchKrwd=&pageIndex=1&integrDeptCode=",
      },
    ]);
  });

  it("상세 p-table__content에서 사진 영역 없이 의미 있는 본문을 추출한다", () => {
    const bodyHtml = [
      "단월면 부안2리,‘달리는 행복 나눔 이웃들’로 행복 충전!",
      "양평군 단월면과 양평군 무한돌봄센터는 지난 22일 부안2리 마을회관에 주민들을 위한 찾아가는 보건복지 서비스인 달리는 행복 나눔 이웃들 행사가 성공적으로 개최했다고 밝혔다.",
      "이날 행사에는 비가 오는 궂은 날씨에도 불구하고 마을주민과 어르신 40여명이 방문하여 높은 관심과 참여를 보였다.",
      "현장에서는 어르신들의 건강과 일상생활에 도움을 줄 수 있는 다채로운 프로그램이 제공되어 큰 호응을 얻었다.",
      "앞으로도 주민들의 일상에 실질적인 힘이 되는 복지서비스를 지속적으로 발굴하여 추진하겠다고 밝혔다.",
    ].join("<br/>");
    const html = `
      <table class="p-table block">
        <tbody class="p-table--th-left">
          <tr><td colspan="2"><span class="p-table__subject_text">단월면 부안2리,‘달리는 행복 나눔 이웃들’로 행복 충전!</span></td></tr>
          <tr>
            <th scope="row">내용</th>
            <td class="p-table__content">
              <div class="p-photo"><div class="p-photo__wrap"><img src="/DATA/bbs/2/photo.jpg" alt="사진"></div></div>
              ${bodyHtml}
            </td>
          </tr>
          <tr><th scope="row">파일</th><td><ul class="p-attach"><li>첨부파일</li></ul></td></tr>
        </tbody>
      </table>
    `;

    const body = parseDetailBody(html);
    expect(body).toContain("찾아가는 보건복지 서비스");
    expect(body).toContain("복지서비스를 지속적으로 발굴");
    expect(body?.length).toBeGreaterThan(250);
  });
});
