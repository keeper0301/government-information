// gurye parser 회귀 방어. 구례군청 공식 보도자료의
// board/list 목록과 board_view 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/gurye";

const MOCK_LIST_HTML = `
<ul class="list">
  <li>
    <a href="/board/view.do?bbsId=BBS_0000000000000300&amp;pageIndex=1&amp;nttId=80508&amp;menuNo=115004006000">
      <span class="tag">보도자료</span>
      <em>한국농어촌공사 구례지사 2년 연속 고향사랑기부금 구례군 기탁</em>
      <span class="txt">지난 15일 한국농어촌공사 구례지사 임직원들이 고향사랑기부금 200만 원을 구례군에 기탁했다.</span>
    </a><span>2026.07.21</span>
  </li>
</ul>
`;

const MOCK_DETAIL_HTML = `
<div class="board_view">
  <h3>한국농어촌공사 구례지사 2년 연속 고향사랑기부금 구례군 기탁</h3>
  <ul class="write_info">
    <li><strong>작성자</strong> : 총무과</li>
    <li><strong>작성일</strong> : 2026-07-21</li>
    <li><strong>조회수</strong> : 66</li>
  </ul>
  <div class="board_con">
    지난 15일 한국농어촌공사 구례지사 임직원들이 고향사랑기부금 200만 원을 구례군에 기탁했다.<br>
    한국농어촌공사 구례지사는 지난해에 이어 2년 연속으로 임직원들이 고향사랑실천에 참여하여 지자체와 유관기관의 상생발전의 수범사례로 손꼽히고 있다.<br>
    이날 구례군청에서 열린 기탁식에는 구례군수와 관계자 등이 참석했으며 고향사랑기부금이 전달됐다.<br>
    구례군은 기부자의 뜻이 지역발전을 위한 소중한 밑거름이 되도록 하겠다고 밝혔다.
  </div>
  <script type="text/javascript">function fn_egov_downFile(){}</script>
</div>
`;

describe("gurye parseListPage", () => {
  it("보도자료 목록에서 nttId, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "80508",
      title: "한국농어촌공사 구례지사 2년 연속 고향사랑기부금 구례군 기탁",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.gurye.go.kr/board/view.do?bbsId=BBS_0000000000000300&pageIndex=1&nttId=80508&menuNo=115004006000",
    });
  });
});

describe("gurye parseDetailBody", () => {
  it("board_con 상세 본문과 작성일을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-21");
    expect(body).toContain("고향사랑기부금 200만 원");
  });
});
