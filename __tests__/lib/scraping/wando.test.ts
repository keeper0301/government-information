// wando parser 회귀 방어. 완도군청 공식 보도자료의
// photonews/tbl_type 목록과 board_basic_view 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/wando";

const MOCK_LIST_HTML = `
<ul class="photonews_top group">
  <li>
    <div class="photonews_oppacity"></div>
    <a href="/wando/sub.cs?m=1023&amp;nttId=10013611&amp;pBoardId=BBSMSTR_000000000036" title="완도군, 폭염 대응 ‘인명·재산 피해 최소화’ 총력">
      <img src="/sample.jpg" alt="완도군, 폭염 대응 ‘인명·재산 피해 최소화’ 총력" />
      <div class="title">
        <span>2026-07-22</span>
        <p>완도군, 폭염 대응 ‘인명·재산 피해 최소화’ 총력</p>
      </div>
    </a>
  </li>
</ul>
<div class="tbl_type">
  <p class="img">
    <a href="/wando/sub.cs?m=1023&amp;nttId=10013547&amp;pBoardId=BBSMSTR_000000000036">
      <img src="/thumb.jpg" alt="완도군, 청해진 크로스핏 전국 대회 성료" />
    </a>
  </p>
  <dl>
    <dt class="title">
      <span class="span_tit">
        <a href="/wando/sub.cs?m=1023&amp;nttId=10013547&amp;pBoardId=BBSMSTR_000000000036" title="완도군, 청해진 크로스핏 전국 대회 성료 에 대한 글보기">
          완도군, 청해진 크로스핏 전국 대회 성료
        </a>
      </span>
      <span class="span_date">2026-07-16</span>
    </dt>
    <dd class="con">완도군, 청해진 크로스핏 전국 대회 성료...</dd>
  </dl>
</div>
`;

const MOCK_DETAIL_HTML = `
<div id="board_basic_view">
  <div class="news_tit">
    <h3>완도군, 폭염 대응 ‘인명·재산 피해 최소화’ 총력</h3>
    <dl>
      <dt>작성일</dt><dd>2026-07-22</dd>
      <dt>등록자</dt><dd>박여진</dd>
    </dl>
  </div>
  <div class="file_attach"><h5>첨부파일</h5></div>
  <div class="board_cont inner">
    <p>
      <p style="text-align:center">완도군, 폭염 대응 ‘인명·재산 피해 최소화’ 총력</p>
      <p>완도군은 계속되는 폭염에 대응해 군민의 인명과 재산 피해를 최소화하기 위한 종합 대책을 추진하고 있다.</p>
      <p>군은 취약계층을 대상으로 안부 확인을 강화하고 무더위쉼터 운영 상황을 점검하는 한편, 야외 근로자와 농어업인을 대상으로 폭염 행동 요령을 안내하고 있다.</p>
      <p>또한 도로 살수, 그늘막 점검, 재난 문자 발송 등 현장 중심 대응을 이어가며 관계 부서와 읍면이 협력해 피해 예방 활동을 확대할 계획이다.</p>
      <p>완도군 관계자는 군민 안전을 최우선으로 두고 폭염 취약 시간대 야외 활동 자제를 당부했다.</p>
    </p>
  </div><!--//data_cont -->
</div><!--//view_box -->
<div class="board_button_list"><ul><li>목록</li></ul></div>
`;

describe("wando parseListPage", () => {
  it("photonews와 카드 목록에서 nttId, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "10013611",
      title: "완도군, 폭염 대응 ‘인명·재산 피해 최소화’ 총력",
      publishedDate: "2026-07-22",
      sourceUrl:
        "https://www.wando.go.kr/wando/sub.cs?m=1023&nttId=10013611&pBoardId=BBSMSTR_000000000036",
    });
    expect(items[1]).toMatchObject({
      seq: "10013547",
      title: "완도군, 청해진 크로스핏 전국 대회 성료",
      publishedDate: "2026-07-16",
    });
  });
});

describe("wando parseDetailBody", () => {
  it("board_basic_view 상세 제목과 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("폭염 대응");
    expect(body).toContain("무더위쉼터 운영 상황");
    expect(body).not.toContain("첨부파일");
    expect(body).not.toContain("목록");
  });
});
