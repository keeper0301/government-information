// namgu_ulsan parser 회귀 방어. 울산 남구 보도자료의
// eGov basic_table list + bbs_detail_basic detail 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/namgu_ulsan";

const LIST_HTML = `
<table class="basic_table">
  <tbody>
    <tr>
      <td class="problem_number">9584</td>
      <td class="left txt_ovf">
        <a href="/cop/bbs/selectBoardArticle.do?bbsId=press&amp;nttId=528525" onclick="goBoardArticle('528525'); return false;">
          ‘24시간 편의점이 무더위 쉼터로’.. 남구, 폭염 대비 CU 편의점 27곳을 무더위 쉼터로 신규 지정
        </a>
      </td>
      <td class="problem_name">재난대응과</td>
      <td class="date">2026-07-27</td>
      <td class="problem_file"></td>
      <td class="problem_count">6</td>
    </tr>
  </tbody>
</table>
`;

const DETAIL_HTML = `
<div class="bbs_detail bbs_detail_basic">
  <div class="bbs_detail_tit">
    <h2>
      <strong>‘24시간 편의점이 무더위 쉼터로’.. 남구, 폭염 대비 CU 편의점 27곳을 무더위 쉼터로 신규 지정</strong>
    </h2>
    <ul class="info">
      <li class="part">담당부서 : 재난대응과</li>
      <li class="date">연락처 : 052-226-5573</li>
    </ul>
    <ul class="info">
      <li class="inq_cnt">조회수 : 7</li>
      <li class="date">작성시간 : 2026-07-27</li>
    </ul>
  </div>
  <div class="bbs_detail_content">
    <div class="bbs_detail_cont">
      <div class="bbs-view-content bbs-view-content-skin05">
        <br> 울산 남구는 여름철 폭염과 열대야로부터 구민들의 건강을 지키기 위해 비지에프 리테일과 협력해 씨유 편의점 27곳을 무더위 쉼터로 지정해 운영한다고 밝혔다.<br><br>
        올해 기상청에서 야간 고온 현상에 따른 피해를 막기 위해 열대야 주의보를 신설함에 따라, 남구는 맞춤형 폭염 대책의 하나로 씨유 편의점을 무더위 쉼터로 지정하는 계획을 실행했다.<br><br>
        기존 관공서, 은행, 경로당 중심으로 지정된 무더위 쉼터는 저녁과 야간, 주말과 공휴일에는 이용이 어려워 열대야와 폭염에 대응하기에는 한계가 있었다.<br><br>
        남구 관계자는 구민들이 밤낮없이 안전하고 시원한 여름을 보낼 수 있도록 폭염 안전망 관리를 빈틈없이 하겠다고 말했다.
      </div>
    </div>
  </div>
</div>
`;

describe("namgu_ulsan parsers", () => {
  it("parses eGov basic_table rows", () => {
    const items = parseListItems(LIST_HTML);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "528525",
      title: "‘24시간 편의점이 무더위 쉼터로’.. 남구, 폭염 대비 CU 편의점 27곳을 무더위 쉼터로 신규 지정",
      publishedDate: "2026-07-27",
      sourceUrl: "https://www.ulsannamgu.go.kr/cop/bbs/selectBoardArticle.do?bbsId=press&nttId=528525",
    });
  });

  it("parses bbs_detail_basic visible body", () => {
    const body = parseDetailBody(DETAIL_HTML);
    expect(body).toContain("무더위 쉼터");
    expect(body).toContain("폭염 안전망");
    expect(body?.length).toBeGreaterThan(250);
  });
});
