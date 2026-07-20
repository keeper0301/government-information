// donghae parser 회귀 방어. 공식 SI 보도/해명자료 게시판의
// selectBbsNttView 목록과 p-table__content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/donghae";

const MOCK_LIST_HTML = `
<tr>
  <td>13,307</td>
  <td class="p-subject">
    <a href="./selectBbsNttView.do;JSESSIONID=ABC?key=489&amp;bbsNo=95&amp;nttNo=203377&amp;searchCtgry=&amp;pageIndex=1" target="_top">
      동해시, 시민 제안 34건 시정에 담는다
    </a>
  </td>
  <td>홍보감사담당관</td>
  <td></td>
  <td>2026-07-16</td>
  <td>87</td>
</tr>
`;

const MOCK_DETAIL_HTML = `
<table class="p-table block" data-table="rwd">
  <tbody class="p-table--th-left">
    <tr class="p-table__subject">
      <td colspan="2"><span class="p-table__subject_text">동해시, 시민 제안 34건 시정에 담는다</span></td>
    </tr>
    <tr>
      <td colspan="2" class="p-table__content">
        동해시가 민선9기 출범을 앞두고 운영한 당선인에게 바란다를 통해 접수된 시민 제안을 시정 운영에 적극 반영한다.<br />
        시는 지난 6월 12일부터 19일까지 시청 홈페이지를 통해 시민 제안을 접수했으며 관련 부서 검토를 거쳐 결과를 공개했다.<br />
        접수된 제안은 관광과 미래산업, 도시개발, 청년정책, 복지, 교통안전 등 시정 전반에 걸친 정책 아이디어를 담고 있었다.<br />
        동해시는 이번 시민 제안을 주요 정책 수립 과정에 반영해 시민이 체감하는 참여행정을 실현해 나갈 계획이라고 밝혔다.
      </td>
    </tr>
  </tbody>
</table>
`;

describe("donghae parseListPage", () => {
  it("selectBbsNttView 목록에서 seq, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "203377",
      title: "동해시, 시민 제안 34건 시정에 담는다",
      publishedDate: "2026-07-16",
      sourceUrl:
        "https://www.dh.go.kr/www/selectBbsNttView.do?key=489&bbsNo=95&nttNo=203377",
    });
  });
});

describe("donghae parseDetailBody", () => {
  it("p-table__content 본문에서 한국어 전문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("시민 제안");
  });
});
