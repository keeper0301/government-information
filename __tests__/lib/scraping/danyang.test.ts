// danyang parser 회귀 방어. 공식 단양군핫이슈의
// action-value 목록과 read_content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/danyang";

const MOCK_LIST_HTML = `
<div class="modules_board">
  <a href="?action=read&amp;action-value=860391acffa3edf81eecba0ba8ad3a43">
    <em>시원한 여름축제의 시작… ‘2026 매화골 Hot Summer Festival’ 25일 개막</em><br/>
    <span class="txt">단양군 매포읍의 대표 여름축제인 ‘2026 매화골 Hot Summer Festival’이 오는 25일부터 26일까지 이틀간 열린다.</span><br/>
    <span class="date">2026-07-21</span>
  </a>
</div>
`;

const MOCK_DETAIL_HTML = `
<div class="modules_board">
  <div class="proc_read">
    <div class="read_header">
      <h3><span>시원한 여름축제의 시작… ‘2026 매화골 Hot Summer Festival’ 25일 개막</span></h3>
      <div class="etc_info"><dl class="fr"><dt>등록일자</dt><dd>2026-07-21</dd><dt>조회</dt><dd>49</dd></dl></div>
    </div>
    <h4 class="hide">내용</h4>
    <div class="read_content">
      <div>
        <p><span>단양군 매포읍의 대표 여름축제인 ‘2026 매화골 Hot Summer Festival’이 오는 25일부터 26일까지 이틀간 열려 주민과 관광객들에게 시원하고 특별한 여름 추억을 선사한다.</span></p>
        <p><span>이번 축제는 음악공연과 체험행사, 먹거리, 물놀이 프로그램 등 남녀노소 누구나 함께 즐길 수 있는 다채로운 콘텐츠로 꾸며진다.</span></p>
        <p><span>축제 첫날에는 음악회가 열려 인기 가수들이 무대에 오르고, 다양한 세대가 함께 즐길 수 있는 공연과 경품 추첨 행사도 마련된다.</span></p>
        <p><span>둘째 날에는 온 가족이 함께 참여할 수 있는 맨손 물고기 잡기 체험이 진행되고, 현장 참여 이벤트와 먹거리 장터도 운영된다.</span></p>
        <p><span>한편 이번 축제는 지역 주민과 관광객이 함께 어우러지는 참여형 축제로, 여름철 관광객 유치와 지역 상권 활성화에 활력을 불어넣을 것으로 기대된다.</span></p>
      </div>
    </div>
    <div class="read_file"><h4>첨부파일</h4></div>
  </div>
</div>
`;

describe("danyang parseListPage", () => {
  it("action-value 목록에서 해시 id, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "860391acffa3edf81eecba0ba8ad3a43",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.danyang.go.kr/dy21/984?action=read&action-value=860391acffa3edf81eecba0ba8ad3a43",
    });
    expect(items[0].title).toContain("매화골 Hot Summer Festival");
  });
});

describe("danyang parseDetailBody", () => {
  it("read_content 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("단양군 매포읍");
    expect(body).toContain("지역 상권 활성화");
  });
});
