// wanju parser 회귀 방어. 완주군청 공식 보도자료의
// thumb_info1 목록과 view-con 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/wanju";

const MOCK_LIST_HTML = `
<div class="thumb_info1">
  <dl>
    <dt><span>보건·복지</span> 완주군 용진읍 부녀연합회, 어르신 삼계탕 나눔</dt>
    <dd class="thumb_con">완주군 용진읍 부녀연합회가 중복을 맞아 어르신을 위해 삼계탕 나눔을 진행했다.</dd>
    <dd class="thumb_date"><span class="hidden">작성일 :</span> <i class="icon-date"></i> 2026-07-21 16:06:43</dd>
    <dd class="thumb_more"><a href="./view.9is?dataUid=4028a6029dcd6861019f837f91364f66&&contentUid=ff808081898ba9ba0189f1e5b91101a9&tmpField14=&boardUid=ff8080818b024d8e018b1c99655f1226&page=1">MORE VIEW</a></dd>
  </dl>
</div>
<div class="pagination"></div>
`;

const MOCK_DETAIL_HTML = `
<div class="view-group">
  <div class="view-table">
    <ul>
      <li class="lineBreak col_w100"><strong>제목</strong><span>완주군 용진읍 부녀연합회, 어르신 삼계탕 나눔</span></li>
      <li><strong>작성자</strong><span>기획예산실</span></li>
      <li><strong>등록일</strong><span>2026-07-21</span></li>
    </ul>
  </div>
  <div class="view-list">
    <div class="view-con">
      <p>완주군 용진읍 부녀연합회가 21일 정기회의를 마친 후 중복을 맞아 폭염 속 취약계층 보호와 건강한 여름나기를 위해 삼계탕 나눔 행사를 개최했다.</p>
      <p>이날 부녀회원들은 여름철 식중독 예방 등 위생과 안전을 위해 삼계탕과 물김치를 당일 조리하고 포장했다. 이어 관내 어르신 세대를 직접 방문해 음식을 전달하며 안부를 살폈다.</p>
      <p>완주군은 지역사회 단체와 함께 취약계층을 위한 나눔 활동을 지속적으로 확대하고, 주민들이 체감할 수 있는 복지 행정을 세심하게 추진하겠다고 밝혔다.</p>
      <p>담당부서는 무더운 날씨에도 봉사에 참여한 회원들에게 감사의 뜻을 전하며 앞으로도 건강하고 행복한 지역사회를 만드는 데 지원을 아끼지 않겠다고 설명했다.</p>
    </div>
  </div>
  <div class="btnArea"><a>목록</a></div>
</div>
`;

describe("wanju parseListPage", () => {
  it("보도자료 카드에서 dataUid, 제목, 작성일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "4028a6029dcd6861019f837f91364f66",
      title: "완주군 용진읍 부녀연합회, 어르신 삼계탕 나눔",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.wanju.go.kr/news/planweb/board/view.9is?dataUid=4028a6029dcd6861019f837f91364f66&contentUid=ff808081898ba9ba0189f1e5b91101a9&tmpField14=&boardUid=ff8080818b024d8e018b1c99655f1226&page=1",
    });
  });
});

describe("wanju parseDetailBody", () => {
  it("view-con 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-21");
    expect(body).toContain("삼계탕 나눔 행사");
  });
});
