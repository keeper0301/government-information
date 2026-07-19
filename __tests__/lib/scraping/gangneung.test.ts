// gangneung parser 회귀 방어. 공식 SI 시정보도자료 게시판의
// selectBbsNttView 목록과 bbs_content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/gangneung";

const MOCK_LIST_HTML = `
<tbody>
  <tr>
    <td class="first">5196</td>
    <td class="subject">
      <a href="./selectBbsNttView.do?key=277&amp;bbsNo=23&amp;nttNo=212393&amp;searchCtgry=&amp;searchCnd=all&amp;searchKrwd=&amp;pageIndex=1&amp;integrDeptCode=">7. 16.(목) 보도자료</a>
    </td>
    <td>공보관</td>
    <td><img src="/common/images/board/file/ico_hwp.gif" alt="hwp 첨부파일 있음" /></td>
    <td>2026.07.16</td>
    <td class="last">157</td>
  </tr>
</tbody>
`;

const MOCK_DETAIL_HTML = `
<table class="bbs_default view">
  <tbody>
    <tr>
      <th scope="row">내용</th>
      <td title="내용" class="bbs_content">
        [내용]<br/>
        □ 달빛 아래 물드는 고택, 오죽헌 무더위 날릴 한여름 밤의 초대<br/>
        □ 강릉시립미술관 솔올, 뮤지엄 아카데미 3회차 운영<br/>
        □ 동해안군수지원단, 구정면 경로당에 생수 지원<br/>
        □ 김중남 강릉시장, 지역 현안사업 건의를 위해 국회 방문<br/>
        □ 강릉시역세권번영회, 초복 맞아 포남1동 홀몸어르신 삼계탕 나눔 실시<br/>
        □ 내곡동지역사회보장협의체, 초복 맞이 삼계탕 지원<br/>
        □ 성덕동지역사회보장협의체, 우리동네 1촌 지정 현판식 개최<br/>
        □ 홍제동 지역사회보장협의체, 초복 맞이 4랑의 3계탕 나눔 펼쳐
      </td>
    </tr>
  </tbody>
</table>
`;

describe("gangneung parseListPage", () => {
  it("SI 목록에서 seq, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "212393",
      title: "7. 16.(목) 보도자료",
      publishedDate: "2026-07-16",
      sourceUrl:
        "https://www.gn.go.kr/www/selectBbsNttView.do?key=277&bbsNo=23&nttNo=212393",
    });
  });
});

describe("gangneung parseDetailBody", () => {
  it("bbs_content 본문에서 한국어 전문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("오죽헌");
  });
});
