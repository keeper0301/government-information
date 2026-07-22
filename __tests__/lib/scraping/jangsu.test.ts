// jangsu parser 회귀 방어. 장수군청 공식 언론보도의
// list01 목록과 bdvCntWrap 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/jangsu";

const MOCK_LIST_HTML = `
<table class="list01"><tbody>
  <tr>
    <td class="bbs_hide">9046</td>
    <td class="title"><a href="/board/view.jangsu?boardId=BBS_0000041&amp;menuCd=DOM_000000102001012000&amp;orderBy=REGISTER_DATE DESC&amp;paging=ok&amp;startPage=1&amp;dataSid=578037" title="장수군, 하오마을(유) ‘김부각’ 미국 시장 첫 진출">장수군, 하오마을(유) ‘김부각’ 미국 시장 첫 진출</a><img alt="새글" /></td>
    <td class="bbs_hide">2026.07.22</td>
    <td>기획조정실</td>
    <td class="bbs_hide">6</td>
  </tr>
</tbody></table>
`;

const MOCK_DETAIL_HTML = `
<div class="boardViewWrap">
  <div class="bdvTitWrap">
    <p class="bdvTit">장수군, 하오마을(유) ‘김부각’ 미국 시장 첫 진출</p>
  </div>
  <div class="bdvInfo">
    <dl><dt>등록일</dt><dd>2026.07.22</dd></dl>
  </div>
  <div class="bdvCntWrap">
    <div class="se-contents">
      <p>장수군은 전통식품 농업회사법인 하오마을이 우리나라 대표 전통 K-푸드인 김부각으로 미국 시장 진출에 첫걸음을 내디뎠다고 밝혔다.</p>
      <p>하오마을은 250년 역사를 이어온 종갓집의 전통 제조방식과 국내산 김, 장수에서 직접 생산한 찹쌀을 재료로 김부각과 식혜를 생산하는 산서면 소재 전통식품 농업회사법인이다.</p>
      <p>이번 수출은 지역 농산물의 해외 판로를 넓히고 장수군 전통식품의 우수성을 세계에 알리는 계기가 될 것으로 기대된다.</p>
      <p>군은 농가와 기업이 함께 성장할 수 있도록 가공식품 개발, 수출 상담, 판로 확대를 지속적으로 지원하겠다고 밝혔다.</p>
    </div>
  </div>
</div>
`;

describe("jangsu parseListPage", () => {
  it("언론보도 목록에서 dataSid, 제목, 작성일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "578037",
      title: "장수군, 하오마을(유) ‘김부각’ 미국 시장 첫 진출",
      publishedDate: "2026-07-22",
      sourceUrl:
        "https://www.jangsu.go.kr/board/view.jangsu?boardId=BBS_0000041&menuCd=DOM_000000102001012000&orderBy=REGISTER_DATE%20DESC&paging=ok&startPage=1&dataSid=578037",
    });
  });
});

describe("jangsu parseDetailBody", () => {
  it("bdvCntWrap 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-22");
    expect(body).toContain("김부각으로 미국 시장 진출");
  });
});
