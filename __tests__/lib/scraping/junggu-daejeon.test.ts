// daejeon junggu parser 회귀 방어. 공식 보도/보도해명 게시판의
// fn_search_detail('{nttId}') 목록과 bbs--view--cont 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/junggu_daejeon";

const MOCK_LIST_HTML = `
<tbody>
  <tr>
    <td data-cell-header="번호" class="hit">7774</td>
    <td data-cell-header="제목" class="subject">
      <a href="#view" onclick="javascript: fn_search_detail('B000000227428Lg3qI8'); return false;">
        대전고등학교 특수학급 학생들, 직접 만든 작품 판매 수익금 기탁
      </a>
      <span class="ir ir-bbs ir-bbs-new">새글</span>
    </td>
    <td data-cell-header="작성자" class="writer">기획홍보실</td>
    <td data-cell-header="조회수" class="hit">15</td>
    <td data-cell-header="등록일" class="regDate">2026-07-19</td>
  </tr>
</tbody>
`;

const MOCK_DETAIL_HTML = `
<div class="ui bbs--view--cont" data-text-content="true">
  <div class="ui bbs--detail--cont">
    <div class="ui bbs--view--content">
      대전고등학교 특수학급 학생들, 직접 만든 작품 판매 수익금 기탁<br/>
      대전 중구 대흥동은 특수학급 학생들이 진로·직업교육 활동을 통해 직접 만든 작품을 판매하여 마련한 수익금 전액을 지역사회에 기부했다고 밝혔다.<br/>
      이번 수익금은 학생들이 제품 기획부터 제작, 포장, 판매, 고객 응대, 수익금 관리까지 전 과정을 직접 수행하며 마련한 것으로, 학생들의 정성과 나눔의 마음이 담긴 뜻깊은 기부이다.<br/>
      중구는 학생들의 따뜻한 마음이 지역사회 곳곳에 희망으로 전해질 수 있도록 지역 내 어려운 이웃들을 위해 소중하게 사용하겠다고 설명했다.
    </div>
  </div>
</div>
`;

describe("junggu_daejeon parseListPage", () => {
  it("fn_search_detail 목록에서 seq, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "B000000227428Lg3qI8",
      title: "대전고등학교 특수학급 학생들, 직접 만든 작품 판매 수익금 기탁",
      publishedDate: "2026-07-19",
      sourceUrl:
        "https://www.djjunggu.go.kr/prog/bbsArticle/BBSMSTR_000000000137/view.do?nttId=B000000227428Lg3qI8&mno=sub03_07",
    });
  });
});

describe("junggu_daejeon parseDetailBody", () => {
  it("bbs--view--cont 본문에서 한국어 전문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("특수학급 학생들");
  });
});
