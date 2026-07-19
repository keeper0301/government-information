// taebaek parser 회귀 방어. 공식 SI 시정보도자료 게시판의
// selectBbsNttView 목록과 bbs_content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/taebaek";

const MOCK_LIST_HTML = `
<tbody>
  <tr>
    <td>23185</td>
    <td class="subject ">
      <a href="./selectBbsNttView.do?key=359&amp;bbsNo=31&amp;nttNo=182581&amp;searchCtgry=&amp;searchCnd=all&amp;searchKrwd=&amp;pageIndex=1&amp;integrDeptCode=">
        태백시, 필리핀 마발라캇시 대표단 방문 …외국인 계절근로자 격려 및 협력 강화
      </a>
    </td>
    <td>기획감사과</td>
    <td>2026.07.16</td>
    <td class="last">57</td>
  </tr>
</tbody>
`;

const MOCK_DETAIL_HTML = `
<table class="bbs_default view">
  <tbody>
    <tr>
      <th scope="row">내용</th>
      <td title="내용" class="bbs_content">
        태백시(시장 이상호)는 외국인 계절근로자 협력도시인 필리핀 마발라캇시 대표단이 양 도시 간 우호협력 강화와 외국인 계절근로자 운영체계 발전 방안을 논의하기 위해 태백시를 방문한다고 밝혔다.<br/>
        이번 방문은 해외 파견 계절근로자 근무 점검 및 이탈 방지, 근로자 격려 정책에 따라 추진되는 것으로, 대표단은 농가와 숙소를 방문해 근무환경을 점검하고 근로자들을 격려할 예정이다.<br/>
        대표단은 태백시와 외국인 계절근로자 운영 현황을 공유하고, 양 도시 실무진 간 의견을 교환하며 보다 안정적이고 발전적인 운영체계 구축 방안을 논의할 계획이다.<br/>
        태백시는 앞으로도 협력도시와 긴밀한 협력을 이어가며 근로자들이 안심하고 근무할 수 있는 환경 조성과 안정적인 인력 수급체계 구축에 최선을 다하겠다고 설명했다.
      </td>
    </tr>
  </tbody>
</table>
`;

describe("taebaek parseListPage", () => {
  it("SI 목록에서 seq, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "182581",
      title: "태백시, 필리핀 마발라캇시 대표단 방문 …외국인 계절근로자 격려 및 협력 강화",
      publishedDate: "2026-07-16",
      sourceUrl:
        "https://www.taebaek.go.kr/www/selectBbsNttView.do?key=359&bbsNo=31&nttNo=182581",
    });
  });
});

describe("taebaek parseDetailBody", () => {
  it("bbs_content 본문에서 한국어 전문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("외국인 계절근로자");
  });
});
