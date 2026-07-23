// hampyeong parser 회귀 방어. 함평군청 공식 보도/해명의
// board_list body_row 목록과 boardContents 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/hampyeong";

const MOCK_LIST_HTML = `
<div class="board_list">
  <div class="board_list_body">
    <div class="body_row">
      <div class="num"><div class="blind">번호</div>7543</div>
      <div class="subject">
        <div class="blind">제목</div>
        <a href="/boardView.do?pageId=www275&amp;boardId=NEWS&amp;seq=2569654&amp;movePage=1&amp;recordCnt=10" data-view="L" data-seq="2569654" class="new">
          함평군 신광면, 노인일자리 참여자 직무·소양교육 성료
        </a>
      </div>
      <div class="writer"><div class="blind">작성자</div>기획예산실</div>
      <div class="date"><div class="blind">작성일</div>2026-07-23</div>
      <div class="file"><div class="blind">파일</div><a href="/fileDownload.do?fileSe=BB&amp;fileKey=NEWS%7C13758&amp;fileSn=1&amp;boardId=NEWS&amp;seq=2569654">file</a></div>
      <div class="hit"><div class="blind">조회</div>20</div>
    </div>
    <div class="body_row">
      <div class="num"><div class="blind">번호</div>7542</div>
      <div class="subject">
        <div class="blind">제목</div>
        <a href="/boardView.do?pageId=www275&amp;boardId=NEWS&amp;seq=5518740&amp;movePage=1&amp;recordCnt=10" data-view="L" data-seq="5518740" class="new">
          함평군, ‘2026년 노인 일자리 및 사회활동 지원사업 안전교육’ 성료
        </a>
      </div>
      <div class="date"><div class="blind">작성일</div>2026-07-23</div>
    </div>
  </div>
</div>
<div id="boardPage"></div>
`;

const MOCK_DETAIL_HTML = `
<meta property="og:title" content="“주민 손으로 만드는 미래”…함평군 대동면, 제2회 주민총회 성료">
<div class="siiruBoardFile">
  <a href="/fileDownload.do?fileSe=BB&amp;boardId=NEWS&amp;seq=2635163">사진자료.jpg</a>
</div>
<div class="siiruBoardBody" id="[]">
  <div class="imageView">
    <img src="/imageView/example" alt="“주민 손으로 만드는 미래”…함평군 대동면, 제2회 주민총회 성료">
    <small>사진 캡션</small>
  </div>
  <div class="boardContents siiru-clr">
    전남광주통합특별시 함평군 대동면이 주민총회를 열고 투표를 통해 자치 사업 우선순위를 결정하며 주민자치 실현에 나섰다.<br><br>
    함평군은 23일 “‘제2회 대동면 주민총회’가 이날 오전 함평문화체육센터에서 성공적으로 개최됐다”고 밝혔다.<br><br>
    대동면 주민자치회가 주최한 이날 총회에는 지역 주민과 군 관계자, 사회단체 관계자 등 250여 명이 참석했다.<br><br>
    총회는 주민자치 프로그램의 식전 공연으로 시작해 활동 보고와 사업 설명, 주민자치 교육, 투표 및 개표 순서로 진행됐다.<br><br>
    주민들은 사업의 필요성과 기대효과를 듣고 투표를 통해 사업 간 우선순위를 결정하며 주민자치 실현에 대한 큰 만족감을 표했다.<br><br>
    군 관계자는 다양한 의견이 군정에 반영될 수 있도록 주민자치를 적극 지원하겠다고 밝혔다.
  </div>
  <div class="koglSeView siiru-clr"><img src="/home/siiru/images/img_opentypeN.png" alt="적용안함"></div>
</div>
`;

describe("hampyeong parseListPage", () => {
  it("body_row 항목에서 seq, 제목, 작성일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "2569654",
      title: "함평군 신광면, 노인일자리 참여자 직무·소양교육 성료",
      publishedDate: "2026-07-23",
      sourceUrl:
        "https://www.hampyeong.go.kr/boardView.do?pageId=www275&boardId=NEWS&seq=2569654&movePage=1&recordCnt=10",
    });
    expect(items[1]).toMatchObject({
      seq: "5518740",
      title: "함평군, ‘2026년 노인 일자리 및 사회활동 지원사업 안전교육’ 성료",
      publishedDate: "2026-07-23",
    });
  });
});

describe("hampyeong parseDetailBody", () => {
  it("og:title과 boardContents 본문을 추출하고 첨부/이미지 노이즈를 제외한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("전남광주통합특별시 함평군 대동면");
    expect(body).toContain("주민자치를 적극 지원");
    expect(body).not.toContain("사진자료.jpg");
    expect(body).not.toContain("사진 캡션");
  });
});
