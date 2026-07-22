// jinan parser 회귀 방어. 진안군청 공식 보도자료의
// bbsList 목록과 conText 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/jinan";

const MOCK_LIST_HTML = `
<div class="board"><div class="bbsList"><ul>
  <li><a href="/board/view.jinan?boardId=BBS_0000034&amp;&amp;menuCd=DOM_000000107002002000&amp;orderBy=REGISTER_DATE DESC&amp;paging=ok&amp;startPage=1&amp;dataSid=213122" title="진안역사박물관, 휴게소에서 만나는 진안의 역사문화 전시 개최">
    <strong>진안역사박물관, 휴게소에서 만나는 진안의 역사문화 전시 개최</strong>
    <p>진안역사박물관이 김제휴게소에서 진안의 역사문화를 소개하는 전시를 개최한다.</p>
  </a>
  <em class="info">담당부서 : 행정복지국 문화체육과 국가유산 <span>|</span> 등록일자 : 2026-07-13 <span>|</span> 조회수 : 168</em></li>
</ul></div></div>
`;

const MOCK_DETAIL_HTML = `
<div class="basicView">
  <div class="titleField">
    <h4>진안역사박물관, 휴게소에서 만나는 진안의 역사문화 전시 개최</h4>
    <ul><li>등록일자 : 2026-07-13</li></ul>
  </div>
  <div class="conText">
    <p><strong>진안역사박물관, 휴게소에서 만나는 진안의 역사문화 전시 개최</strong></p>
    <p>진안역사박물관이 7월 10일부터 8월 13일까지 새만금고속도로 김제휴게소 전시공간에서 진안의 역사문화를 소개하는 전시를 개최한다.</p>
    <p>이번 전시는 진안고원과 마이산을 품은 진안의 이야기라는 주제로 지역박물관과 관계기관이 함께 마련한 사업의 일환이며, 휴게소 방문객에게 진안의 자연과 역사문화 콘텐츠를 알리는 데 목적이 있다.</p>
    <p>전시에서는 마이산과 용담댐 관련 사진, 기록물, 역사 자료 등을 통해 진안의 자연과 변천 모습, 지역의 역사성을 함께 소개한다.</p>
    <p>관계자는 이번 전시가 여행길에 잠시 머무는 방문객들에게 진안의 매력을 친근하게 알리고 향후 진안을 직접 찾는 계기가 되기를 기대한다고 밝혔다.</p>
  </div>
</div>
`;

describe("jinan parseListPage", () => {
  it("보도자료 목록에서 dataSid, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "213122",
      title: "진안역사박물관, 휴게소에서 만나는 진안의 역사문화 전시 개최",
      publishedDate: "2026-07-13",
      sourceUrl:
        "https://www.jinan.go.kr/board/view.jinan?boardId=BBS_0000034&menuCd=DOM_000000107002002000&orderBy=REGISTER_DATE%20DESC&paging=ok&startPage=1&dataSid=213122",
    });
  });
});

describe("jinan parseDetailBody", () => {
  it("conText 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-13");
    expect(body).toContain("진안의 역사문화");
  });
});
