// dalseong_daegu parser 회귀 방어. 대구 달성군 보도/해명의
// iCMS BBS list + #bbsView pre detail 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/dalseong_daegu";

const MOCK_LIST_HTML = `
<table id="bbsList">
  <tbody>
    <tr>
      <td data-table-type="number">8575</td>
      <td class="tal" data-table-type="subject">
        <a href="javascript:;" onclick="fn_icms_navi_common('view', '53326');return false;">2026년 7월 27일_달성군 청소년들, 여름방학 ‘빛·나·봉’ 체험학교로 뭉친다!</a>
      </td>
      <td data-table-type="dpt">달성군자원봉사센터</td>
      <td data-table-type="date">2026-07-27</td>
      <td data-table-type="file"></td>
      <td data-table-type="count">15</td>
    </tr>
    <tr>
      <td data-table-type="number">8574</td>
      <td class="tal" data-table-type="subject"><a href="javascript:;" onclick="fn_icms_navi_common('view', '53325');return false;">2026년 7월 27일_논공 새마을부녀회, 복지관서 정성 담은 배식 봉사</a></td>
      <td data-table-type="dpt">논공읍</td>
      <td data-table-type="date">2026-07-27</td>
      <td data-table-type="file"></td>
      <td data-table-type="count">13</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<div id="bbsView">
  <div class="form_group title">
    <dl class="title"><dt><span>제목</span></dt><dd>2026년 7월 27일_달성군 청소년들, 여름방학 ‘빛·나·봉’ 체험학교로 뭉친다!</dd></dl>
  </div>
  <div class="form_group col02">
    <dl><dt><span>부서명</span></dt><dd>달성군자원봉사센터</dd></dl>
    <dl class="date"><dt><span>등록일</span></dt><dd>2026-07-27</dd></dl>
  </div>
  <div class="form_group content">
    <dl class="content">
      <dt class="hidden"><span>글내용</span></dt>
      <dd>
        <pre>달성군자원봉사센터가 방학을 맞은 관내 청소년들을 위해 체험형 봉사 프로그램을 마련했다.

센터는 달성군 북부노인복지관에서 청소년 자원봉사 체험학교인 달성 빛나는 나의 자원봉사 체험학교를 개최했다고 밝혔다.

이번 행사에는 달성군청소년봉사단 소속 청소년 50여 명이 참가했다. 프로그램은 청소년들의 인성 함양과 자원봉사 문화 확산을 위해 안전, 문화, 환경 분야를 결합한 맞춤형 융합 과정으로 구성됐다.

주요 교육 내용으로는 심폐소생술 및 재난 대응 교육, 청소년을 위한 작은 음악회, 탄소중립 실천 프로그램 등이 다채롭게 펼쳐졌다. 달성군은 앞으로도 청소년들이 자발적으로 사회에 참여해 건강한 시민으로 성장할 수 있도록 지원하겠다고 밝혔다.</pre>
      </dd>
    </dl>
  </div>
</div>
`;

describe("dalseong daegu local press parser", () => {
  it("parses iCMS list rows", () => {
    const items = parseListItems(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "53326",
      title: "2026년 7월 27일_달성군 청소년들, 여름방학 ‘빛·나·봉’ 체험학교로 뭉친다!",
      publishedDate: "2026-07-27",
    });
    expect(items[0]?.sourceUrl).toContain("menu_link=%2Ficms%2Fbbs%2FselectBoardArticle.do");
    expect(items[0]?.sourceUrl).toContain("bbsId=BBS_00071");
    expect(items[0]?.sourceUrl).toContain("nttId=53326");
  });

  it("extracts visible pre body", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).toContain("달성군자원봉사센터가 방학을 맞은 관내 청소년들을 위해");
    expect(body?.length).toBeGreaterThan(250);
  });
});
