// donggu_ulsan parser 회귀 방어. 울산 동구 보도자료의
// eGov bbs_list table + bbs_detail_basic detail 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/donggu_ulsan";

const LIST_HTML = `
<table class="bbs_list table table-default">
  <tbody>
    <tr class="noticeList">
      <td data-cell-header="번호" class="atchFileId">
        <a href="/cop/bbs/selectBoardArticle.do?bbsId=BBSMSTR_000000000322&amp;nttId=211598" onclick="goBoardArticle('211598'); return false;">16808</a>
      </td>
      <td data-cell-header="제목" class="subject">
        <a href="/cop/bbs/selectBoardArticle.do?bbsId=BBSMSTR_000000000322&amp;nttId=211598" onclick="goBoardArticle('211598'); return false;">
          울산 동구, 2026 동구청장배 생활체육 대회 성료
        </a>
      </td>
      <td data-cell-header="작성자" class="writer txtEl">문화체육과</td>
      <td data-cell-header="작성일" class="regDate">2026-07-26</td>
      <td data-cell-header="첨부파일" class="atchFileI"></td>
      <td data-cell-header="조회수" class="hit">11</td>
    </tr>
  </tbody>
</table>
`;

const DETAIL_HTML = `
<div class="bbs_detail bbs_detail_basic">
  <div class="bbs_detail_tit">
    <h2>울산 동구, 2026 동구청장배 생활체육 대회 성료</h2>
    <ul class="info">
      <li><strong>작성자</strong> 문화체육과</li>
      <li><strong>조회수</strong> 12</li>
      <li><strong>작성일</strong> 2026-07-26</li>
    </ul>
  </div>
  <div class="bbs_detail_content">
    <p>울산 동구는 지난 7월 26일 전하체육센터에서 열린 댄스스포츠대회와 화정체육관에서 개최된 농구대회를 끝으로, 약 두 달간 이어진 2026 동구청장배 생활체육 대회가 성황리에 마무리됐다고 밝혔다.</p>
    <p>이번 대회는 동구 체육회가 주최하고 종목별 단체가 주관하여 6월 6일부터 7월 26일까지 전하체육센터, 화정체육관, 파크골프장, 동구청 대강당 등 관내 공공 체육시설에서 개최됐으며, 총 26개 종목에 6,200여 명의 생활체육 동호인이 참가해 열띤 경쟁을 펼치며 건강한 스포츠 문화와 화합의 장을 만들었다.</p>
    <p>대회는 태권도를 시작으로 탁구, 테니스, 축구, 배드민턴, 볼링, 골프, 파크골프, 요트, 댄스스포츠 등 다양한 생활체육 종목이 순차적으로 진행됐다. 생활체육 저변 확대와 지역 체육 활성화에 크게 기여했다.</p>
    <!--[data-hwpjson]{"documentPr":{"dp":{"dn":"test.hwp"}}}-->
  </div>
</div>
`;

describe("donggu_ulsan parsers", () => {
  it("parses eGov bbs_list notice rows", () => {
    const items = parseListItems(LIST_HTML);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "211598",
      title: "울산 동구, 2026 동구청장배 생활체육 대회 성료",
      publishedDate: "2026-07-26",
      sourceUrl: "https://www.donggu.ulsan.kr/cop/bbs/selectBoardArticle.do?bbsId=BBSMSTR_000000000322&nttId=211598",
    });
  });

  it("parses bbs_detail_basic body and removes HWP JSON noise", () => {
    const body = parseDetailBody(DETAIL_HTML);
    expect(body).toContain("생활체육 대회");
    expect(body).toContain("지역 체육 활성화");
    expect(body).not.toContain("data-hwpjson");
    expect(body?.length).toBeGreaterThan(250);
  });
});
