// cheorwon parser 회귀 방어. 공식 SI 언론보도 게시판의
// selectBbsNttView 목록과 p-table__content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/cheorwon";

const MOCK_LIST_HTML = `
<td class="p-subject">
  <a href="./selectBbsNttView.do;CWG_JSESSIONID=ABC?key=218&amp;bbsNo=32&amp;nttNo=285001&amp;searchCtgry=&amp;pageIndex=1" target="_top">
    철원군보건소, 집중호우로 인한 감염병 발생 주의 당부
  </a>
</td>
<td><span class="p-icon p-icon__hwpx">hwpx 파일 첨부</span></td>
<td>39</td>
<td>2026-07-16</td>
`;

const MOCK_DETAIL_HTML = `
<table class="p-table block" data-table="rwd">
  <tbody class="p-table--th-left">
    <tr>
      <td colspan="2"><span class="p-table__subject_text">꽃잎 가득한 와수마을, 봄꽃 마실 축제 개최</span></td>
    </tr>
    <tr>
      <td colspan="2" title="내용" class="p-table__content">
        서면사무소 마을공동체에서 추진하는 봄꽃 마실 축제가 와수시가지 회전교차로 일원에서 진행된다.<br />
        이번 축제는 개막식을 시작으로 봄의 정취를 담은 다양한 볼거리와 체험프로그램을 통해 주민과 방문객들에게 특별한 하루를 선사할 예정이다.<br />
        마을 주민들은 지역 상권 활성화와 공동체 회복을 위해 행사를 준비했으며, 안전 관리와 교통 안내를 병행해 방문객 불편을 최소화할 계획이다.<br />
        철원군은 앞으로도 지역 특색을 살린 축제와 문화 행사를 지속적으로 지원하겠다고 밝혔다.
      </td>
    </tr>
  </tbody>
</table>
`;

describe("cheorwon parseListPage", () => {
  it("selectBbsNttView 목록에서 seq, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "285001",
      title: "철원군보건소, 집중호우로 인한 감염병 발생 주의 당부",
      publishedDate: "2026-07-16",
      sourceUrl:
        "https://www.cwg.go.kr/www/selectBbsNttView.do?key=218&bbsNo=32&nttNo=285001",
    });
  });
});

describe("cheorwon parseDetailBody", () => {
  it("p-table__content 본문에서 한국어 전문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("봄꽃 마실 축제");
  });
});
