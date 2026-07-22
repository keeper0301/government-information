// gochang parser 회귀 방어. 고창군청 공식 보도자료의
// news_list 목록과 bbs_con 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/gochang";

const MOCK_LIST_HTML = `
<div class="news_list">
  <ul>
    <li class="no1">
      <a href="/board/view.gochang?boardId=BBS_0000179&amp;menuCd=DOM_000000102002001000&amp;paging=ok&amp;startPage=1&amp;dataSid=826914">
        <img class="img" src="/upload_data/board_data/BBS_0000179/178459203144819.jpg" alt="심덕섭 군수, 국가예산 및 현안사업 확보 ‘총력’" />
        <strong>심덕섭 군수, 국가예산 및 현안사업 확보 ‘총력’ <span class="ico_file">첨부파일 있음</span></strong>
        <span class="txt">심덕섭 고창군수가 기획예산처를 방문해 핵심 현안사업 예산 반영을 위한 행보에 나섰다.</span>
        <em class="info">기획예산실 <span></span> 작성일 : 2026.07.21 <span></span> 조회수 : 53</em>
      </a>
    </li>
  </ul>
</div>
`;

const MOCK_DETAIL_HTML = `
<div class="bbs_skin">
  <div class="bbs_view photo_view">
    <div class="bbs_vtop">
      <h4>심덕섭 군수, 국가예산 및 현안사업 확보 ‘총력’</h4>
      <ul class="col">
        <li><strong>담당부서</strong> : <em>기획예산실</em></li>
        <li><strong>작성일</strong> : 2026.07.21</li>
        <li><strong>조회수</strong> : 54</li>
      </ul>
    </div>
    <p class="bbs_filedown">첨부파일</p>
    <div class="bbs_con">
      <p>심덕섭 고창군수가 지난 20일 오후 기획예산처를 방문해 2027년도 국가예산사업과 핵심 현안사업 예산 반영을 위한 행보에 나섰다.</p>
      <p>우선 심 군수는 김태곤 경제예산심의관을 만나 고창읍 우회도로 개설공사의 국도·국지도 건설계획 예타 통과를 건의했다.</p>
      <p>이어 농어촌 생활 인프라 개선, 지역 균형 발전 사업, 주민 안전 확보를 위한 재난 예방 사업 등 군민 생활과 밀접한 사업 지원 필요성을 설명했다.</p>
      <p>고창군은 앞으로도 중앙부처와 국회를 지속적으로 방문해 국가예산 확보와 현안 해결에 총력을 기울일 계획이라고 밝혔다.</p>
    </div>
  </div>
  <p class="bbs_btn">목록</p>
</div>
`;

describe("gochang parseListPage", () => {
  it("보도자료 목록에서 dataSid, 제목, 작성일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "826914",
      title: "심덕섭 군수, 국가예산 및 현안사업 확보 ‘총력’",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.gochang.go.kr/board/view.gochang?boardId=BBS_0000179&menuCd=DOM_000000102002001000&paging=ok&startPage=1&dataSid=826914",
    });
  });
});

describe("gochang parseDetailBody", () => {
  it("bbs_con 상세 본문과 작성일을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-21");
    expect(body).toContain("국가예산사업과 핵심 현안사업");
  });
});
