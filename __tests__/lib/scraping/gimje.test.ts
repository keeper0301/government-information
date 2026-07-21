// gimje parser 회귀 방어. 김제시청 공식 뉴스룸의
// news_list 목록과 bbs_con 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/gimje";

const MOCK_LIST_HTML = `
<ul class="news_list">
  <li>
    <a href="/board/view.gimje?boardId=BBS_0000046&amp;menuCd=DOM_000000104005000000&amp;paging=ok&amp;startPage=1&amp;dataSid=358139">
      <span class="img"><img src="/images/bbs/no_img.gif" alt="no image" /></span>
      <strong>김제시, 2026년도 제1회 추경예산 1조 2,402억원 편성</strong>
      <span class="txt">김제시는 시민 삶에 실질적인 힘을 보태고 지역 경쟁력을 높일 핵심 현안 사업들을 차질 없이 뒷받침하기 위해 추가경정예산안을 제출했다고 밝혔다.</span>
      <em class="info"><span>홍보축제실</span><span>작성일 : 2026.07.20</span><span>조회수 : 33</span></em>
    </a>
  </li>
</ul>
`;

const MOCK_DETAIL_HTML = `
<div class="bbs_skin">
  <div class="bbs_view">
    <div class="bbs_vtop">
      <h4>김제시, 2026년도 제1회 추경예산 1조 2,402억원 편성</h4>
      <ul class="col">
        <li>홍보축제실</li>
        <li>2026.07.20</li>
        <li>34</li>
      </ul>
    </div>
    <div class="bbs_con">
      <p>김제시는 시민 삶에 실질적인 힘을 보태고 지역 경쟁력을 높일 핵심 현안 사업들을 차질 없이 뒷받침하기 위해 2026년도 제1회 추가경정예산안을 시의회에 제출했다고 밝혔다.</p>
      <p>이번 추경 예산안은 본예산 대비 증가한 규모로 편성됐으며 일반회계와 특별회계 주요 사업을 반영해 민생 안정과 지역 경제 활성화에 중점을 두었다.</p>
      <p>주요 사업으로는 피해지원금, 상품권 발행 지원, 출산장려금 지원, 인구정책 지원금 등 시민 체감도가 높은 사업과 미래 성장 동력 확보 사업이 포함됐다.</p>
      <p>김제시는 시의회 심의를 거쳐 예산이 확정되면 주요 현안 사업을 신속히 추진해 시민 생활 안정과 지역 경쟁력 강화를 이어갈 계획이라고 설명했다.</p>
    </div>
    <p class="bbs_btn">목록</p>
  </div>
</div>
`;

describe("gimje parseListPage", () => {
  it("뉴스룸 목록에서 dataSid, 제목, 작성일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "358139",
      title: "김제시, 2026년도 제1회 추경예산 1조 2,402억원 편성",
      publishedDate: "2026-07-20",
      sourceUrl:
        "https://www.gimje.go.kr/board/view.gimje?boardId=BBS_0000046&menuCd=DOM_000000104005000000&paging=ok&startPage=1&dataSid=358139",
    });
  });
});

describe("gimje parseDetailBody", () => {
  it("bbs_con 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-20");
    expect(body).toContain("제1회 추가경정예산안");
  });
});
