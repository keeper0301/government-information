// muju parser 회귀 방어. 무주군청 공식 보도자료의
// news_list 목록과 bd_detail_content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/muju";

const MOCK_LIST_HTML = `
<div class="news_list"><ul>
  <li>
    <a href="./view.9is?dataUid=4028a6d2928a60a5019f6e97c34b5279&amp;page=1&amp;boardUid=ff8080816d3d662f016d4218d1360434&amp;contentUid=ff8080816c5f9d47016cbd3baf240074">
      <span class="title">‘이웃이 들려주는 보통의 이야기’</span>
    </a>
    <span class="date">2026-07-17</span>
  </li>
</ul></div>
`;

const MOCK_DETAIL_HTML = `
<div id="contents">
  <div class="bbsView">
    <div class="bd_detail_tit">
      <h4>‘이웃이 들려주는 보통의 이야기’</h4>
      <ul class="info"><li class="date">작성일 : 2026-07-17</li></ul>
    </div>
    <div class="bd_detail_content">
      <p><strong>무주군민 인문학 강연 호응</strong></p>
      <p>무주군민이 직접 강연자로 나서는 이웃의 목소리, 무주에서 통하다 무주군민 인문학 강연이 큰 호응을 얻고 있다.</p>
      <p>지난 16일에는 무주상상반디숲 채움실에서 결혼이주여성이 강연자로 나서 지역사회 정착과 삶의 이야기를 주민들과 나누며 공감의 시간을 만들었다.</p>
      <p>참석자들은 평범한 이웃의 경험을 통해 지역 공동체의 다양성과 상호 이해의 중요성을 느꼈으며, 군은 앞으로도 주민이 주체가 되는 문화 프로그램을 확대하겠다고 밝혔다.</p>
      <p>무주군은 군민들이 서로의 삶을 이해하고 지역 공동체 안에서 소통할 수 있는 자리를 지속적으로 마련해 생활문화와 인문학 기반을 넓혀갈 계획이다.</p>
    </div>
    <div class="btnArea"><a>목록</a></div>
  </div>
</div>
`;

describe("muju parseListPage", () => {
  it("보도자료 목록에서 dataUid, 제목, 작성일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "4028a6d2928a60a5019f6e97c34b5279",
      title: "‘이웃이 들려주는 보통의 이야기’",
      publishedDate: "2026-07-17",
      sourceUrl:
        "https://www.muju.go.kr/planweb/board/view.9is?dataUid=4028a6d2928a60a5019f6e97c34b5279&page=1&boardUid=ff8080816d3d662f016d4218d1360434&contentUid=ff8080816c5f9d47016cbd3baf240074",
    });
  });
});

describe("muju parseDetailBody", () => {
  it("bd_detail_content 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-17");
    expect(body).toContain("무주군민 인문학 강연");
  });
});
