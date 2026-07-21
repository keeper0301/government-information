// hongseong parser 회귀 방어. 홍성군청 공식 보도자료의
// board--card--list 카드와 bbs--view--cont 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/hongseong";

const MOCK_LIST_HTML = `
<div class="ui board--card--list">
  <div class="obj col1">
    <div class="col">
      <a href="#link" onclick="javascript: fn_search_detail('B000000281941Re8kY3'); return false;" class="link">
        <div class="item">
          <div class="card--body">
            <strong class="tit">홍성 한우와 마늘을 한입에 담다!! ‘홍성마늘 한우 스테이크’ 출격... 전국 입맛 잡는다</strong>
            <ul class="list_ul">
              <li class="writer"><b>작성자</b>홍보전산담당관 홍보미디어팀</li>
              <li class="regDate"><b>등록일</b>2026-07-21 18:07:27</li>
              <li class="cont"><b>내용</b>박정주 군수, 생산에서 상품·판로·소득으로 잇는 실용 농정 가속</li>
            </ul>
          </div>
        </div>
      </a>
    </div>
  </div>
</div>
`;

const MOCK_DETAIL_HTML = `
<meta property="og:title" content="홍성 한우와 마늘을 한입에 담다!! ‘홍성마늘 한우 스테이크’ 출격... 전국 입맛 잡는다" />
<div class="program--contents">
  <div class="ui bbs--view--head">
    <span class="date"><i>등록일</i>2026-07-21</span>
  </div>
  <div class="ui bbs--view--file">첨부파일 영역</div>
  <div class="ui bbs--view--images"><img alt="사진" /></div>
  <div class="ui bbs--view--cont" data-text-content="true">
    <div class="ui bbs--detail--cont">
      <div class="ui bbs--view--content">
        - 박정주 군수, 생산에서 ‘상품·판로·소득’으로 잇는 실용 농정 가속-<br/>
        - 홍성군·청운대·LG헬로비전 ‘원팀’…제품화부터 방송·온라인 판매까지 -<br/><br/>
        박정주 홍성군수가 실용농정 프로젝트 일환으로 홍성 농축산물의 판로확대와 농가소득이라는 두 마리 토끼를 잡기 위해 청운대학교와 함께 LG와 손잡고 홈쇼핑 상품에 대한 개발을 진행해 이목이 집중되고 있다.<br/><br/>
        홍성군에 따르면 21일 청운대학교 대학본부 회의실에서 대통령상을 수상한 국산 신품종 홍성마늘과 대한민국 명품 홍성한우를 결합한 홍성마늘 한우 스테이크로 전국 소비시장 공략하고자 청운대학교, LG헬로비전과 업무협약을 체결했다.<br/><br/>
        이번 협약은 홍성군의 우수한 농축산물에 청운대학교의 지역연계·제품화 역량과 LG헬로비전의 방송·온라인 판매망을 결합해 제품 개발부터 홍보와 판매까지 하나의 체계로 연결하기 위해 마련됐다.
      </div>
    </div>
  </div>
</div>
`;

describe("hongseong parseListPage", () => {
  it("카드 목록에서 nttId, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "B000000281941Re8kY3",
      title:
        "홍성 한우와 마늘을 한입에 담다!! ‘홍성마늘 한우 스테이크’ 출격... 전국 입맛 잡는다",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.hongseong.go.kr/bbs/BBSMSTR_000000000842/view.do?nttId=B000000281941Re8kY3",
    });
  });
});

describe("hongseong parseDetailBody", () => {
  it("bbs--view--cont 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-21");
    expect(body).toContain("홍성 농축산물의 판로확대");
  });
});
