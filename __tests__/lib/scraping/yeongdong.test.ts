// yeongdong parser 회귀 방어. 공식 헤드라인뉴스 카드 목록과
// ui bbs--view--content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/yeongdong";

const MOCK_LIST_HTML = `
<div class='bd_boxtype bd_item bd_shadow bd_curved'>
  <div class='bd_item_box'>
    <a href='?mode=V&amp;no=08659cec1fd5c6c071a569b3fcaaea15&amp;GotoPage=1'>
      <div class='bd_entry'>
        <div class='inner'>
          <h2><span> 영동군장애인복지관 제1회 충청북도협회장배 전국장애인탁구대회 참가 </span></h2>
          <p>- 장애인 평생교육 및 여가, 문화, 건강지원의 통합 거점-</p>
          <em class='bd_info'>
            <span>영동군 장애인복지관</span>
            <span class='date'>2026-07-20</span>
            <em class='view_cnt'>61</em>
          </em>
          <div class='description'>자세히보기</div>
        </div>
      </div>
    </a>
  </div>
</div>
`;

const MOCK_DETAIL_HTML = `
<div class="ui bbs--view--header">
  <h2 class="ui bbs--view--tit">영동군장애인복지관 제1회 충청북도협회장배 전국장애인탁구대회 참가</h2>
</div>
<div class="ui bbs--view--cont" data-text-content="true">
  <div class="ui bbs--detail--cont">
    <div class="ui bbs--view--content" style="text-align:center;">
      <img src="?mode=IMG&amp;no=08659cec1fd5c6c071a569b3fcaaea15&amp;file_id=178478" alt="">
    </div>
  </div>
</div>
<div class="ui bbs--view--cont" data-text-content="true">
  <div class="ui bbs--detail--cont">
    <div class="ui bbs--view--content">
      <p>■ 영동군장애인복지관은 지난 7월 16일 옥천체육센터에서 열린 제1회 충청북도협회장배 전국장애인탁구대회에 복지관 탁구 프로그램 회원 5명이 출전하여 우수한 성과를 거두었다.</p>
      <p>■ 이번 대회는 전국의 장애인 탁구 선수들이 참가해 기량을 겨루는 자리로, 영동군장애인복지관 선수들은 그동안 꾸준한 훈련을 통해 갈고닦은 실력을 마음껏 발휘하며 좋은 경기를 펼쳤다.</p>
      <p>■ 특히 여자 개인전에 출전한 회원이 뛰어난 경기를 선보이며 1위를 차지하는 쾌거를 이루어 복지관과 지역사회의 자긍심을 높였다. 복지관은 앞으로도 장애인이 다양한 생활체육 활동을 통해 건강한 삶을 누리고 자신의 역량을 펼칠 수 있도록 지원하겠다고 밝혔다.</p>
    </div>
  </div>
</div>
`;

describe("yeongdong parseListPage", () => {
  it("카드형 헤드라인뉴스 목록에서 hash id, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "08659cec1fd5c6c071a569b3fcaaea15",
      title: "영동군장애인복지관 제1회 충청북도협회장배 전국장애인탁구대회 참가",
      publishedDate: "2026-07-20",
      sourceUrl:
        "https://www.yd21.go.kr/kr/html/sub02/02010601.html?mode=V&no=08659cec1fd5c6c071a569b3fcaaea15&GotoPage=1",
    });
  });
});

describe("yeongdong parseDetailBody", () => {
  it("이미지 블록을 건너뛰고 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("영동군장애인복지관");
    expect(body).toContain("전국장애인탁구대회");
  });
});
