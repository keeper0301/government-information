// eumseong parser 회귀 방어. 공식 보도자료 게시판의
// p-subject 목록과 p-table__content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/eumseong";

const MOCK_LIST_HTML = `
<tr>
  <td>4,796</td>
  <td class="p-subject">
    <a href="./selectBbsNttView.do?key=353&amp;bbsNo=27&amp;nttNo=188730&amp;searchCtgry=&amp;pageIndex=1" target="_self">
      안예순 신임 맹동면장, 맹동장학회추진위원회에 장학금 기탁
      <span class="p-icon p-icon__new">새글</span>
    </a>
  </td>
  <td>홍보실</td>
  <td></td>
  <td>2026-07-20</td>
</tr>
`;

const MOCK_DETAIL_HTML = `
<table class="p-table block">
  <tbody class="p-table--th-left">
    <tr>
      <td colspan="2">
        <span class="p-table__subject_text">안예순 신임 맹동면장, 맹동장학회추진위원회에 장학금 기탁</span>
      </td>
    </tr>
    <tr>
      <td colspan="2" title="내용" class="p-table__content">
        안예순 맹동면장이 지역 우수 인재 양성을 위해 사용해 달라며 맹동장학회 추진위원회에 장학금 100만 원을 기탁했다.<br />
        이번 기탁은 지역 청소년들의 성장과 지역 인재 육성에 보탬이 되기 위해 마련됐으며, 지역사회 발전과 이웃 나눔에 대한 평소 관심이 부임 초기 실천으로 이어진 것이다.<br />
        안예순 맹동면장은 면에서 새롭게 업무를 시작하며 부임을 따뜻하게 맞아준 분들의 고마운 마음을 지역사회와 나누는 것으로 첫인사를 전하고 싶었다고 밝혔다.<br />
        추진위원회는 기탁금이 지역 학생들을 위한 장학사업에 소중히 쓰일 예정이라고 설명했다.
      </td>
    </tr>
  </tbody>
</table>
`;

describe("eumseong parseListPage", () => {
  it("p-subject 목록에서 seq, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "188730",
      title: "안예순 신임 맹동면장, 맹동장학회추진위원회에 장학금 기탁",
      publishedDate: "2026-07-20",
      sourceUrl:
        "https://www.eumseong.go.kr/www/selectBbsNttView.do?key=353&bbsNo=27&nttNo=188730",
    });
  });
});

describe("eumseong parseDetailBody", () => {
  it("p-table__content 본문에서 한국어 전문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("맹동장학회");
  });
});
