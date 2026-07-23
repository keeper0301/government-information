// haenam parser 회귀 방어. 해남군청 공식 보도자료의
// press_list 목록과 view_box/data_cont 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/haenam";

const MOCK_LIST_HTML = `
<div class="press_list">
  <div class="item">
    <div class="thumb">
      <img src="https://portal.haenam.go.kr/jfile/thumbnailPreview.do?fileId=19f8d882ebd56&fileSeq=1" alt="해남군, 국토부 스마트 재활 거점 공모 선정, 국비 30억원 확보">
    </div>
    <div class="right">
      <h4>
        <a href="./view.9is?dataUid=18e3368f5d542987015d63ee65c202ff&amp;pBoardId=BBSMSTR_000000000131&amp;nttId=122839&amp;contentUid=&amp;boardUid=18e3368f5fb80fdc015fdc4c2ac203e7&amp;layoutUid=&amp;nowPageNum=1&recordCountPerPage=10">해남군, 국토부 스마트 재활 거점 공모 선정, 국비 30억원 확보<span class="new2">NEW</span></a>
      </h4>
      <p class="text">해남군, 국토부 스마트 재활 거점 공모 선정, 국비 30억원 확보</p>
      <ul class="info">
        <li><strong>담당부서</strong> <span class="user">복지정책과</span></li>
        <li><strong>작성일</strong> <span class="date">2026-07-23</span></li>
      </ul>
    </div>
  </div><!--//item -->
  <div class="item">
    <div class="right">
      <h4>
        <a href="./view.9is?dataUid=18e3368f5d542987015d63ee65c202ff&amp;pBoardId=BBSMSTR_000000000131&amp;nttId=122838&amp;contentUid=&amp;boardUid=18e3368f5fb80fdc015fdc4c2ac203e7&amp;layoutUid=&amp;nowPageNum=1&recordCountPerPage=10">해남군 벼 병해충 예찰 활동 강화, 적기 방제 당부<span class="new2">NEW</span></a>
      </h4>
      <ul class="info">
        <li><strong>작성일</strong> <span class="date">2026-07-23</span></li>
      </ul>
    </div>
  </div><!--//item -->
</div>
`;

const MOCK_DETAIL_HTML = `
<div class="view_box">
  <h4>해남군, 국토부 스마트 재활 거점 공모 선정, 국비 30억원 확보</h4>
  <ul class="view_info">
    <li><strong>담당부서</strong> <span class="user">복지정책과</span></li>
    <li><strong>작성일</strong> <span class="date">2026-07-23</span></li>
  </ul>
  <div class="data_cont">
    <p>해남군, 국토부 스마트 재활 거점 공모 선정, 국비 30억원 확보</p>
    <p>완도·진도·강진군 아우르는 ‘1535 복지 라인’ 가동, 권역 거점 재활 인프라 구축</p>
    <p>&nbsp;</p>
    <p>해남이 전남광주 남서권의 열악한 의료·복지 격차를 해소하기 위한 스마트 재활 거점 공모에 최종 선정됐다.</p>
    <p>군은 이번 사업을 통해 장애인과 어르신, 만성질환자를 대상으로 지역 내 재활 접근성을 높이고, 인근 지자체와 연계한 통합 돌봄 서비스를 확대할 계획이다.</p>
    <p>또한 보건소와 복지기관, 의료기관이 함께 참여하는 협력 체계를 구축해 이동이 어려운 주민도 가까운 곳에서 맞춤형 재활 서비스를 받을 수 있도록 지원한다.</p>
    <p>해남군 관계자는 지역 특성에 맞는 권역형 재활 기반을 안정적으로 조성해 군민 체감도를 높이겠다고 밝혔다.</p>
  </div><!--//data_cont -->
  <div class="filelist">
    <dl><dt>첨부파일</dt><dd><a href="download.9is">sample.hwp</a></dd></dl>
  </div>
</div>
<div class="btnarea"></div>
`;

describe("haenam parseListPage", () => {
  it("press_list 항목에서 nttId, 제목, 작성일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "122839",
      title: "해남군, 국토부 스마트 재활 거점 공모 선정, 국비 30억원 확보",
      publishedDate: "2026-07-23",
      sourceUrl:
        "https://www.haenam.go.kr/planweb/board/view.9is?dataUid=18e3368f5d542987015d63ee65c202ff&pBoardId=BBSMSTR_000000000131&nttId=122839&contentUid=&boardUid=18e3368f5fb80fdc015fdc4c2ac203e7&layoutUid=&nowPageNum=1&recordCountPerPage=10",
    });
    expect(items[1]).toMatchObject({
      seq: "122838",
      title: "해남군 벼 병해충 예찰 활동 강화, 적기 방제 당부",
      publishedDate: "2026-07-23",
    });
  });
});

describe("haenam parseDetailBody", () => {
  it("view_box 상세 제목과 data_cont 본문을 추출하고 첨부 노이즈를 제외한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("전남광주 남서권");
    expect(body).toContain("권역형 재활 기반");
    expect(body).not.toContain("sample.hwp");
    expect(body).not.toContain("첨부파일");
  });
});
