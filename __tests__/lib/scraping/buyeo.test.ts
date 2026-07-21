// buyeo parser 회귀 방어. 부여군청 공식 보도자료의
// news_07 목록과 board_viewDetail 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/buyeo";

const MOCK_LIST_HTML = `
<div class="bodo_listThum first in_photo">
  <div class="view">
    <h4><a href='./?mode=V&amp;no=O7FKm9BhUDbuLOQWfz7eIA&amp;code=news_07&amp;site_dvs_cd=kr&amp;menu_dvs_cd=0408&amp;GotoPage=0' title='부여군보건소, 부여군 공공건축물 최초 ‘녹색건축물 전환 인증’ 획득'>부여군보건소, 부여군 공공건축물 최초 ‘녹색건축물 전환 인증’ 획득</a></h4>
    <p>공공건축물 그린리모델링 사업으로 에너지소요량을 개선했다.</p>
    <ul class="infomation">
      <li><span>작성자 : </span>홍보교류과</li>
      <li><span>작성일 : </span>2026-07-21</li>
    </ul>
  </div>
</div>
`;

const MOCK_DETAIL_HTML = `
<div class="board_viewTit"><h4>부여군보건소, 부여군 공공건축물 최초 ‘녹색건축물 전환 인증’ 획득</h4></div>
<ul class="board_viewInfo">
  <li class="date"><span>작성일</span>2026-07-21 16:01:40</li>
</ul>
<div class="board_viewDetail">
  <p>공공건축물 그린리모델링 사업으로 연간 단위 면적당 1차 에너지소요량 45.2% 개선</p>
  <p>부여군보건소가 공공건축물 그린리모델링 사업을 통해 연간 단위 면적당 1차 에너지소요량을 기존 대비 45.2% 개선한 것으로 인정받아 국토교통부로부터 부여군 공공건축물 최초 녹색건축물 전환 인증을 획득했다고 21일 밝혔다.</p>
  <p>부여군은 이번 인증이 단순한 에너지 효율 개선을 넘어 그린리모델링 사업의 성과가 심의 기준과 절차에 따라 객관적으로 확인되었다는 점에서 의미가 크다고 설명했다.</p>
  <p>또한 이번 성과는 공공부문 탄소중립 이행과 에너지 절감 정책을 조기에 이행한 사례로, 노후 설비 문제를 해소하고 고효율 설비 도입을 통해 유지관리비 절감 효과를 거두는 데 기여할 것으로 기대된다.</p>
</div>
`;

describe("buyeo parseListPage", () => {
  it("news_07 보도자료 카드에서 제목과 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "O7FKm9BhUDbuLOQWfz7eIA",
      title: "부여군보건소, 부여군 공공건축물 최초 ‘녹색건축물 전환 인증’ 획득",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.buyeo.go.kr/_prog/_board/?mode=V&no=O7FKm9BhUDbuLOQWfz7eIA&code=news_07&site_dvs_cd=kr&menu_dvs_cd=0408",
    });
  });
});

describe("buyeo parseDetailBody", () => {
  it("board_viewDetail 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("녹색건축물 전환 인증");
    expect(body).toContain("2026-07-21");
  });
});
