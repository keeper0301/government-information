// chuncheon parser 회귀 방어. 공식 시장실 보도자료 게시판의
// BBSMSTR_000000000335 목록과 board-view-con 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/chuncheon";

const MOCK_LIST_HTML = `
<ul class="news-list-box">
  <li class="news-box type2">
    <a href="/mayor/newsroom/press-release/?bbsId=BBSMSTR_000000000335&nttId=524761&flag=view" onclick="fn_view('524761'); return false;">
      <p>태권도 열기 춘천 명동으로… 원도심 상권 활력 더한다</p>
      <ul class="news-box-info">
        <li>경제정책과</li>
        <li>윤희진</li>
        <li>033-250-4435</li>
        <li>2026-07-16</li>
      </ul>
    </a>
  </li>
</ul>
`;

const MOCK_DETAIL_HTML = `
<div class="board-view-wrap">
  <div class="board-view-top">
    <h2>태권도 열기 춘천 명동으로… 원도심 상권 활력 더한다</h2>
  </div>
  <div class="board-view-con">
    <div class="se-contents" role="textbox">
      <p><span>태권도 열기 춘천 명동으로 원도심 상권 활력 더한다</span></p>
      <p><span>18일부터 19일까지 명동상점가 활성화 행사를 열고 선수단과 관광객을 대상으로 다양한 이벤트를 운영한다.</span></p>
      <p><span>춘천시는 국제 스포츠대회의 경제적 효과를 경기장에 머물지 않고 지역 상권으로 확산하기 위해 이번 행사를 마련했다고 설명했다.</span></p>
      <p><span>행사 기간 동안 닭갈비 할인쿠폰, 버스킹 공연, 플리마켓, 룰렛 이벤트가 운영되며 관광순환 셔틀버스로 경기장과 명동을 연결해 지역 소비 확대를 기대하고 있다.</span></p>
      <p><span>시는 대회 성공과 더불어 지역 상권도 함께 활력을 찾을 수 있도록 최선을 다하겠다고 말했다.</span></p>
    </div>
  </div>
</div>
`;

describe("chuncheon parseListPage", () => {
  it("시장실 보도자료 목록에서 seq, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "524761",
      title: "태권도 열기 춘천 명동으로… 원도심 상권 활력 더한다",
      publishedDate: "2026-07-16",
      sourceUrl:
        "https://www.chuncheon.go.kr/mayor/newsroom/press-release/?bbsId=BBSMSTR_000000000335&nttId=524761&flag=view",
    });
  });
});

describe("chuncheon parseDetailBody", () => {
  it("board-view-con 본문에서 한국어 전문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("명동상점가 활성화 행사");
  });
});
