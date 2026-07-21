// jeungpyeong parser 회귀 방어. 공식 보도자료의
// bodo_list 목록과 bbs-view-content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/jeungpyeong";

const MOCK_LIST_HTML = `
<div class="bodo_list">
  <div class="item">
    <div class="descpt">
      <form name="subForm" method="post" action="/kor/cop/bbs/BBSMSTR_000000000135/selectBoardArticle.do?nttId=B00000059450xa0lS1vt">
        <input type="hidden" name="bbsId" value="BBSMSTR_000000000135" />
        <div class="subject">
          <input type="submit" value="이재영 증평군수, 충청권 광역급행철도(CTX) 증평역연장사업 제5차 국가철도망 구축계획 반영 건의" >
          <img alt="new" src="/images/prog/common/notice_new.gif">
        </div>
        <div class="pt">
          <input type="submit" value="- 국토부 찾아 지역 철도 현안 직접 설명...국가계획 반영 필요성 강조" >
          <span class="opt">
            <span class="name"><strong>작성자 :</strong>이선영</span>
            <span class="date">2026.07.20</span>
          </span>
        </div>
      </form>
    </div>
  </div>
</div>
`;

const MOCK_DETAIL_HTML = `
<div class="prog_content">
  <div class="bbs_detail bbs_detail_basic">
    <div class="bbs_detail_tit">
      <h2>이재영 증평군수, 충청권 광역급행철도(CTX) 증평역연장사업 제5차 국가철도망 구축계획 반영 건의</h2>
      <ul class="info"><li class="date">등록일 : 2026-07-20</li></ul>
    </div>
    <div class="bbs_detail_content">
      <div class="bbs_detail_cont">
        <div class="left bbs-view-content bbs-view-content-skin07">
          - 국토부 찾아 지역 철도 현안 직접 설명...국가계획 반영 필요성 강조<br/>
          - 충청권 광역급행철도(CTX) 연장·동서횡단철도 연계로 교통 경쟁력 강화<br/>
          이재영 충북 증평군수가 20일 국토교통부를 찾아 충청권 광역급행철도(CTX) 증평역 연장사업과 중부권 동서횡단철도 건설사업의 제5차 국가철도망 구축계획 반영을 요청했다.<br/>
          이번 방문은 올 하반기 확정·고시를 앞둔 국가철도망 구축계획에 지역 핵심 철도사업을 반영하기 위한 것으로, 군수는 사업의 필요성과 기대효과를 정부에 직접 설명하며 지원을 적극 건의했다.<br/>
          군은 두 사업이 최종 반영되면 증평역이 충청권 광역철도의 종점역이자 충북선 분기역으로 자리매김해 철도교통의 핵심 거점으로 도약할 것으로 보고 있다.
        </div>
      </div>
    </div>
  </div>
</div>
`;

describe("jeungpyeong parseListPage", () => {
  it("bodo_list 목록에서 nttId, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "B00000059450xa0lS1vt",
      title:
        "이재영 증평군수, 충청권 광역급행철도(CTX) 증평역연장사업 제5차 국가철도망 구축계획 반영 건의",
      publishedDate: "2026-07-20",
      sourceUrl:
        "https://www.jp.go.kr/kor/cop/bbs/BBSMSTR_000000000135/selectBoardArticle.do?nttId=B00000059450xa0lS1vt",
    });
  });
});

describe("jeungpyeong parseDetailBody", () => {
  it("상세 본문을 제목과 함께 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("증평군수");
    expect(body).toContain("국가철도망 구축계획");
  });
});
