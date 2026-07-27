// dalseo_daegu parser 회귀 방어. 대구 달서구 보도·해명 자료의
// iCMS BBS list + #bbsView pre detail 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/dalseo_daegu";

const MOCK_LIST_HTML = `
<table id="bbsList">
  <tbody>
    <tr>
      <td data-table-type="number">9238</td>
      <td class="tal" data-table-type="subject">
        <a href="javascript:;" onclick="fn_icms_navi_common('view', '104909');return false;">아이코리아 달서구지회, 이웃사랑 후원금 100만 원 기탁</a>
      </td>
      <td data-table-type="dpt">가족정책과</td>
      <td data-table-type="date">2026-07-27</td>
      <td data-table-type="file"></td>
      <td data-table-type="count">29</td>
    </tr>
    <tr>
      <td data-table-type="number">9237</td>
      <td class="tal" data-table-type="subject"><a href="javascript:;" onclick="fn_icms_navi_common('view', '104908');return false;">달서구, 생활밀착형 복지 지원 사업 추진</a></td>
      <td data-table-type="dpt">복지정책과</td>
      <td data-table-type="date">2026-07-26</td>
      <td data-table-type="file"></td>
      <td data-table-type="count">31</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<div id="bbsView">
  <div class="form_group title">
    <dl class="title"><dt><span>제목</span></dt><dd>아이코리아 달서구지회, 이웃사랑 후원금 100만 원 기탁</dd></dl>
  </div>
  <div class="form_group col02">
    <dl><dt><span>담당부서</span></dt><dd>가족정책과</dd></dl>
    <dl class="date"><dt><span>등록일</span></dt><dd>2026-07-27</dd></dl>
  </div>
  <div class="form_group content">
    <dl class="content">
      <dt class="hidden"><span>글내용</span></dt>
      <dd>
        <pre>대구 달서구는 아이코리아 달서구지회가 지역의 어려운 이웃을 위해 후원금 100만 원을 기탁했다고 밝혔다.

이날 달서구청에서 열린 전달식에는 달서구청장과 아이코리아 달서구지회 관계자들이 참석해 나눔의 뜻을 함께했다.

이번 후원금은 회원들이 지역 취약계층에게 힘을 보태기 위해 마련한 것으로, 도움이 필요한 이웃을 위해 사용될 예정이다.

아이코리아 달서구지회장은 어려운 이웃들에게 조금이나마 힘이 되길 바라는 마음으로 회원들과 뜻을 모았다며 앞으로도 지역사회와 함께하는 나눔을 꾸준히 실천하겠다고 말했다. 달서구는 후원금이 필요한 이웃에게 소중히 전달되도록 하겠다고 밝혔다.</pre>
      </dd>
    </dl>
  </div>
</div>
`;

describe("dalseo daegu local press parser", () => {
  it("parses iCMS list rows", () => {
    const items = parseListItems(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "104909",
      title: "아이코리아 달서구지회, 이웃사랑 후원금 100만 원 기탁",
      publishedDate: "2026-07-27",
    });
    expect(items[0]?.sourceUrl).toContain("menu_link=%2Ficms%2Fbbs%2FselectBoardArticle.do");
    expect(items[0]?.sourceUrl).toContain("bbsId=BBS_00038");
    expect(items[0]?.sourceUrl).toContain("nttId=104909");
  });

  it("extracts visible pre body", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).toContain("대구 달서구는 아이코리아 달서구지회가");
    expect(body?.length).toBeGreaterThan(250);
  });
});
