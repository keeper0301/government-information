// daejeon donggu parser 회귀 방어. 공식 뉴스동서남북 게시판의
// article.view('{seq}') 목록과 <li class="content no_title"> 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/donggu_daejeon";

const MOCK_LIST_HTML = `
<div class="notice_list div_newsNSEW">
  <ul>
    <li>
      <p class="no">3250</p>
      <p class="subject align_left">
        <a href="#" onclick="article.view('142842');" class="">
          <strong> 대전 동구, 도심 속 피서지 &#039;어린이 물놀이장&#039; 23일 개장 </strong>
        </a>
      </p>
      <p class="date">2026-07-16</p>
      <p class="writer">기획홍보실</p>
      <p class="counter">78</p>
    </li>
  </ul>
</div>
`;

const MOCK_DETAIL_HTML = `
<div class="board_view div_newsNSEW">
  <strong class="subject">대전 동구, 공약사업 점검</strong>
  <ul class="detail">
    <li class="regDate"><div class="txts">2024-07-09 00:00:00</div></li>
    <li class="content no_title">
      <div class="contents">
        <p>대전 동구는 구청 대회의실에서 민선 8기 공약사업 및 핵심과제 추진 상황 보고회를 개최한다고 밝혔다.</p>
        <p>이번 보고회는 민선 8기 전반기를 마무리하고 후반기가 시작됨에 따라 공약사업과 핵심과제의 속도감 있는 추진을 위해 그간의 추진상황을 점검하고 향후 개선 방안을 논의하기 위해 마련됐다.</p>
        <p>동구는 주민이 체감할 수 있는 생활밀착형 정책을 우선 추진하고, 부서 간 협업을 통해 지연 과제를 관리하며, 사업별 추진 일정과 문제점을 정기적으로 점검해 구정 성과를 높일 계획이다.</p>
      </div>
    </li>
  </ul>
</div>
`;

describe("donggu_daejeon parseListPage", () => {
  it("article.view 목록에서 seq, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "142842",
      title: "대전 동구, 도심 속 피서지 '어린이 물놀이장' 23일 개장",
      publishedDate: "2026-07-16",
      sourceUrl: "https://donggu.go.kr/dg/kor/article/newsNSEW/142842",
    });
  });
});

describe("donggu_daejeon parseDetailBody", () => {
  it("상세 contents 본문에서 한국어 전문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("민선 8기 공약사업");
  });
});
