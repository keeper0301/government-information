// yeoju parser 회귀 방어. 여주시청 공식 보도자료의
// eminwon 목록과 p-table/goDownLoad 상세 구조를 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseListPage,
  parseVisibleDetailBody,
} from "@/lib/scraping/local-press/yeoju";
import { parseEminwonGoDownloadForms } from "@/lib/scraping/local-press/_si_attach_helper";

describe("yeoju local press parser", () => {
  it("eminwon 목록 테이블에서 id/title/date/sourceUrl을 추출한다", () => {
    const html = `
      <table class="p-table">
        <tbody class="text_center">
          <tr>
            <td>900</td>
            <td class="p-subject"><a href="./selectEminwonNewsView.do?pageUnit=10&amp;pageIndex=1&amp;searchCnd=all&amp;key=422&amp;news_epct_no=36575&amp;ofr_pageSize=10">(배포))북내면 금당천의 가을빛 약속</a></td>
            <td>북내면</td>
            <td>2026-07-23</td>
            <td>8</td>
          </tr>
          <tr>
            <td>899</td>
            <td class="p-subject"><a href="./selectEminwonNewsView.do?pageUnit=10&amp;pageIndex=1&amp;searchCnd=all&amp;key=422&amp;news_epct_no=36567&amp;ofr_pageSize=10">(배포))2026년 여주시 전직원 친절교육 실시</a></td>
            <td>민원토지과</td>
            <td>2026-07-21</td>
            <td>5</td>
          </tr>
        </tbody>
      </table>
    `;

    expect(parseListPage(html)).toEqual([
      {
        seq: "36575",
        title: "(배포))북내면 금당천의 가을빛 약속",
        publishedDate: "2026-07-23",
        sourceUrl:
          "https://www.yeoju.go.kr/www/selectEminwonNewsView.do?pageUnit=10&pageIndex=1&searchCnd=all&key=422&news_epct_no=36575&ofr_pageSize=10",
      },
      {
        seq: "36567",
        title: "(배포))2026년 여주시 전직원 친절교육 실시",
        publishedDate: "2026-07-21",
        sourceUrl:
          "https://www.yeoju.go.kr/www/selectEminwonNewsView.do?pageUnit=10&pageIndex=1&searchCnd=all&key=422&news_epct_no=36567&ofr_pageSize=10",
      },
    ]);
  });

  it("상세 p-table 본문이 충분할 때 보이는 본문을 추출한다", () => {
    const paragraphs = [
      "여주시는 시민 편의를 높이기 위해 현장 중심 행정을 강화하고 읍면동과 협업해 지역 현안을 빠르게 확인한다고 밝혔다.",
      "이번 보도자료는 관계 부서가 추진 일정과 주민 안내 사항을 정리해 시민들이 필요한 정보를 쉽게 확인할 수 있도록 마련됐다.",
      "시는 앞으로도 공개 가능한 자료를 신속히 제공하고 주요 사업의 진행 상황을 투명하게 공유해 행정 신뢰를 높일 계획이다.",
      "또한 담당 부서는 주민 의견을 수렴해 후속 조치를 점검하고 불편 사항이 확인되면 개선 방안을 마련하겠다고 설명했다.",
    ].join("<br>");
    const html = `
      <table class="p-table block">
        <tbody class="p-table--th-left">
          <tr><td colspan="2"><span class="p-table__subject_text">여주시 현장 중심 행정 강화</span></td></tr>
          <tr><td colspan="2" title="내용" class="p-table__content">${paragraphs}</td></tr>
        </tbody>
      </table>
    `;

    const body = parseVisibleDetailBody(html);
    expect(body).toContain("여주시 현장 중심 행정 강화");
    expect(body).toContain("행정 신뢰를 높일 계획");
    expect(body?.length).toBeGreaterThan(250);
  });

  it("goDownLoad 첨부 호출 인자를 중복 없이 추출한다", () => {
    const html = `
      <a href="javascript:goDownLoad('userA+','sysA/','/pathA')">전문.hwpx</a>
      <a href="javascript:goDownLoad('userA+','sysA/','/pathA')">전문.hwpx</a>
      <a href="javascript:goDownLoad('image','sysB','/pathB')">사진.png</a>
    `;

    expect(parseEminwonGoDownloadForms(html)).toEqual([
      { userFileName: "userA+", systemFileName: "sysA/", filePath: "/pathA" },
      { userFileName: "image", systemFileName: "sysB", filePath: "/pathB" },
    ]);
  });
});
