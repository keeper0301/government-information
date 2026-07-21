// dangjin parser 회귀 방어. 당진시청 공식 보도자료의
// BBSMSTR_000000000014 카드 목록과 bbs-view-content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/dangjin";

const MOCK_LIST_HTML = `
<div class="bodo_list">
  <div class="item">
    <div class="descpt">
      <div class="subject">
        <a href="/cop/bbs/BBSMSTR_000000000014/selectBoardArticle.do?nttId=1133411">당진시, 가을 재배용 건전 씨감자 공급 및 재배 기술 교육 실시</a>
      </div>
      <div class="pt">
        <a href="/cop/bbs/BBSMSTR_000000000014/selectBoardArticle.do?nttId=1133411">당진시는 가을 재배용 건전 씨감자 안정 생산을 위한 재배기술 교육을 진행한다고 밝혔다.</a>
        <span class="opt"><span class="date"><strong>등록일자</strong> 2026.07.21</span></span>
      </div>
    </div>
  </div>
</div>
`;

const MOCK_DETAIL_HTML = `
<div class="bbs_detail_tit">
  <h2>당진시, 가을 재배용 건전 씨감자 공급 및 재배 기술 교육 실시</h2>
  <ul class="info"><li class="date">등록일 : 2026-07-21</li></ul>
</div>
<div class="left bbs-view-content bbs-view-content-skin07">
  당진시, 가을 재배용 건전 씨감자 공급 및 재배 기술 교육 실시<br/>
  -21일 농업기술센터서 진행…무병 씨감자 자급 체계 구축 및 농가 경영비 절감 기대-<br/>
  당진시는 7월 21일 오전 당진시농업기술센터 중강의실에서 가을재배용 건전 씨감자 안정 생산을 위한 재배기술 교육을 진행한다고 밝혔다.<br/>
  이번 교육은 씨감자 재배 농가 및 희망자를 대상으로 무병 씨감자 생산을 위한 재배 환경 관리와 병해충·바이러스 방제 기술, 생산 단계별 표준 재배 관리 요령 등을 중점 안내한다.<br/>
  특히 실제 현장에서 겪는 문제를 중심으로 맞춤형 질의응답도 함께 이뤄져 실질적인 애로사항 해소에 도움을 줄 전망이다.<br/>
  당진시는 바이러스 무병 씨감자 생산 및 공급 체계 강화를 통해 지역 감자 산업의 경쟁력을 높이고 있다.<br/>
  농업기술센터 관계자는 앞으로도 품질 좋은 씨감자 안정 공급을 통한 농가 소득 증대에 최선을 다하겠다고 말했다.
</div>
`;

describe("dangjin parseListPage", () => {
  it("보도자료 카드에서 nttId, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "1133411",
      title: "당진시, 가을 재배용 건전 씨감자 공급 및 재배 기술 교육 실시",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.dangjin.go.kr/cop/bbs/BBSMSTR_000000000014/selectBoardArticle.do?nttId=1133411",
    });
  });
});

describe("dangjin parseDetailBody", () => {
  it("bbs-view-content 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("씨감자");
    expect(body).toContain("2026-07-21");
  });
});
