// seosan parser 회귀 방어. 공식 SI 보도자료 게시판의
// selectBbsNttView 목록과 bbs_content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/seosan";

const MOCK_LIST_HTML = `
<tbody>
  <tr>
    <td class="first">7803</td>
    <td class="subject">
      <a href="./selectBbsNttView.do?key=1260&amp;bbsNo=101&amp;nttNo=337132&amp;searchCtgry=&amp;searchCnd=all&amp;searchKrwd=&amp;pageIndex=1&amp;integrDeptCode=">서산시, 청렴문화 콘서트 개최</a>
      <span class="bbs_ico new">새글</span>
    </td>
    <td></td>
    <td>홍보담당관</td>
    <td>2026-07-17</td>
  </tr>
</tbody>
`;

const MOCK_DETAIL_HTML = `
<table class="bbs_default view">
  <tbody>
    <tr>
      <th scope="row">내용</th>
      <td title="내용" class="bbs_content">
        서산시,&nbsp;청렴문화&nbsp;콘서트&nbsp;개최<br/>
        충남&nbsp;서산시는&nbsp;지난&nbsp;14일&nbsp;문화회관&nbsp;대공연장에서&nbsp;청렴문화&nbsp;콘서트를&nbsp;개최했다고&nbsp;밝혔다.<br/>
        이날&nbsp;콘서트는&nbsp;청렴의&nbsp;가치를&nbsp;쉽고&nbsp;친근하게&nbsp;전하고,&nbsp;청렴한&nbsp;조직문화&nbsp;확산을&nbsp;위해&nbsp;마련됐다.<br/>
        이완섭&nbsp;서산시장을&nbsp;비롯한&nbsp;시&nbsp;공직자&nbsp;370여&nbsp;명이&nbsp;참석해&nbsp;청렴&nbsp;실천에&nbsp;대한&nbsp;의지를&nbsp;다졌다.<br/>
        시는&nbsp;청렴으로&nbsp;빛나는&nbsp;도시를&nbsp;주제로&nbsp;문화&nbsp;공연과&nbsp;청렴&nbsp;특강,&nbsp;청렴&nbsp;퀴즈&nbsp;등을&nbsp;운영했다고&nbsp;설명했다.<br/>
        앞으로도&nbsp;시민이&nbsp;신뢰하는&nbsp;행정을&nbsp;위해&nbsp;부서별&nbsp;청렴&nbsp;실천&nbsp;과제를&nbsp;점검하고&nbsp;공직자&nbsp;교육과&nbsp;소통&nbsp;프로그램을&nbsp;지속적으로&nbsp;확대할&nbsp;계획이다.
      </td>
    </tr>
  </tbody>
</table>
`;

describe("seosan parseListPage", () => {
  it("SI 목록에서 seq, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "337132",
      title: "서산시, 청렴문화 콘서트 개최",
      publishedDate: "2026-07-17",
      sourceUrl:
        "https://www.seosan.go.kr/www/selectBbsNttView.do?key=1260&bbsNo=101&nttNo=337132",
    });
  });
});

describe("seosan parseDetailBody", () => {
  it("bbs_content 본문에서 한국어 전문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("청렴문화 콘서트");
  });
});
