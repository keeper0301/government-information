// yesan parser 회귀 방어. 예산군청 공식 보도/해명자료의
// item--bodo 카드와 bbs--view--cont 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/yesan";

const MOCK_LIST_HTML = `
<div class="bbs bbs__list bbs__list-card bbs-cell1">
  <div class="bbs-list">
    <div class="bbs-list__block">
      <div class="item item--bodo">
        <button onclick="fn_search_detail('B000000177245Sn2wS1'); return false;" class="bbs__list__link">
          <div class="bbs__inner">
            <div class="bbs__head">
              <strong class="bbs__title">예산군, 덕산온천관광지 새 단장 시동… 불법광고물·무단점유 시설물 정비</strong>
            </div>
            <ul class="bbs__txt-list">
              <li class="writer"><b>담당부서</b>문화관광과 관광개발팀</li>
              <li class="regDate"><b>등록일</b>2026-07-21 14:11:35</li>
            </ul>
          </div>
        </button>
      </div>
    </div>
  </div>
</div>
`;

const MOCK_DETAIL_HTML = `
<meta property="og:title" content="예산군, 덕산온천관광지 새 단장 시동… 불법광고물·무단점유 시설물 정비" />
<div class="program--contents">
  <div class="ui bbs--view--head">
    <span class="date"><i class="ir bbs-icon bbs-icon-regDate">등록일</i>2026-07-21</span>
  </div>
  <div class="ui bbs--view--cont" data-text-content="true">
    <div class="ui bbs--detail--cont">
      <div class="bbs-thumb-photo">
        <button type="button">포토갤러리 정지</button>
        <button type="button">포토갤러리 재생</button>
      </div>
      <div class="ui bbs--view--content">
        올해 말까지 전수조사 추진 … ‘머무는 덕산’ 사업과 연계<br/><br/>
        예산군은 올해 12월 31일까지 덕산온천관광지 전역의 주요 도로변과 군유지를 중심으로 미관을 저해하는 불법광고물과 무단점유 시설물에 대한 일제 정비를 추진한다고 밝혔다.<br/><br/>
        이번 정비는 단순 단속이나 강제 철거를 지양하고 주민과의 상생 협의와 자진 정비 유도를 최우선 추진한다. 특히 관광지 방문객이 많이 찾는 주요 진입로와 상업지역을 중심으로 현장 조사를 실시하고, 시설물 소유자와 점유자에게 정비 필요성을 안내할 계획이다.<br/><br/>
        군은 덕산온천관광지의 쾌적한 환경 조성과 관광 경쟁력 강화를 위해 관련 부서 간 협업체계를 구축하고, 지속적인 사후관리와 주민 의견 수렴을 병행할 방침이다.
      </div>
    </div>
  </div>
</div>
`;

describe("yesan parseListPage", () => {
  it("item--bodo 카드에서 nttId, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "B000000177245Sn2wS1",
      title: "예산군, 덕산온천관광지 새 단장 시동… 불법광고물·무단점유 시설물 정비",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.yesan.go.kr/bbs/BBSMSTR_000000000047/view.do?nttId=B000000177245Sn2wS1",
    });
  });
});

describe("yesan parseDetailBody", () => {
  it("bbs--view--cont 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-21");
    expect(body).toContain("덕산온천관광지 전역");
  });
});
