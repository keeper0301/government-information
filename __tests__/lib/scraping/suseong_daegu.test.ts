// suseong_daegu parser 회귀 방어. 대구 수성구 보도자료의
// iCMS BBS list + #bbsView pre detail 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/suseong_daegu";

const MOCK_LIST_HTML = `
<table id="bbsList">
  <tbody>
    <tr>
      <td data-table-type="number">9209</td>
      <td class="tal" data-table-type="subject">
        <a href="javascript:;" onclick="fn_icms_navi_common('view', '138660');return false;">고산2동 새마을부녀회·협의회, ‘복맞이 사랑의 무료급식’ 행사 및 곰국 후원</a>
      </td>
      <td data-table-type="dpt">고산2동</td>
      <td>2026-07-24</td>
      <td data-table-type="file"></td>
      <td data-table-type="count">55</td>
    </tr>
    <tr>
      <td data-table-type="number">9208</td>
      <td class="tal" data-table-type="subject"><a href="javascript:;" onclick="fn_icms_navi_common('view', '138659');return false;">지산2동 새마을부녀회·협의회, ‘사랑의 삼계탕’ 나눔 행사 실시</a></td>
      <td data-table-type="dpt">지산2동</td>
      <td>2026-07-24</td>
      <td data-table-type="file"></td>
      <td data-table-type="count">59</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<div id="bbsView">
  <div class="form_group">
    <dl class="title"><dt>제목</dt><dd>고산2동 새마을부녀회·협의회, ‘복맞이 사랑의 무료급식’ 행사 및 곰국 후원</dd></dl>
  </div>
  <div class="form_group col02">
    <dl><dt>담당부서</dt><dd>고산2동</dd></dl>
    <dl class="date"><dt>등록일</dt><dd>2026-07-24</dd></dl>
  </div>
  <div class="form_group">
    <dl class="content">
      <dt>글내용</dt>
      <dd>
        <pre>제공일자 : 2026. 07. 23. (목)
담당부서 : 고산2동 행정복지센터
담 당 자 : 찾아가는복지전담팀장 조하련
전 화 : 053-666-3955

대구 수성구 고산2동 새마을부녀회와 새마을협의회는 지난 22일, 무더운 여름철을 맞아 지역 어르신들의 건강한 여름나기를 응원하기 위해 복맞이 사랑의 무료급식 행사를 개최했다.

이날 행사는 청곡종합사회복지관에서 진행됐으며, 회원들이 정성껏 준비한 곰국과 다양한 밑반찬을 어르신들에게 제공하며 건강한 여름나기를 기원하고 안부를 나누는 뜻깊은 자리가 됐다.

또한 행사에 참석하지 못한 분들에게도 따뜻한 마음이 전달될 수 있도록 고산2동 행복나눔곳간에 곰국을 후원했다. 앞으로도 지역사회와 함께하는 나눔 활동을 꾸준히 이어가겠다고 전했다.</pre>
      </dd>
    </dl>
  </div>
</div>
`;

describe("suseong daegu local press parser", () => {
  it("parses iCMS list rows", () => {
    const items = parseListItems(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "138660",
      title: "고산2동 새마을부녀회·협의회, ‘복맞이 사랑의 무료급식’ 행사 및 곰국 후원",
      publishedDate: "2026-07-24",
    });
    expect(items[0]?.sourceUrl).toContain("menu_link=%2Ficms%2Fbbs%2FselectBoardArticle.do");
    expect(items[0]?.sourceUrl).toContain("bbsId=BBSMSTR_000000000019");
    expect(items[0]?.sourceUrl).toContain("nttId=138660");
  });

  it("extracts visible pre body", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).toContain("대구 수성구 고산2동 새마을부녀회와 새마을협의회");
    expect(body?.length).toBeGreaterThan(250);
  });
});
