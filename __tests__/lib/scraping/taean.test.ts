// taean parser 회귀 방어. 태안군청 공식 보도자료의
// fn_egov_inqire_notice 목록과 bbs-view-content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/taean";

const MOCK_LIST_HTML = `
<table class="basic_table center">
  <tbody>
    <tr>
      <td class="problem_number">1517</td>
      <td class="left">
        <a href="#" onclick="fn_egov_inqire_notice('1', '1514303400', 'BBSMSTR_000000000040'); return false;">
          주민의 손으로 직접 그리는 우리 마을의 내일
        </a>
      </td>
      <td>공보팀</td>
      <td>2026-07-21</td>
      <td>9</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<div class="bbs_detail bbs_detail_basic">
  <div class="bbs_detail_tit">
    <h2>주민의 손으로 직접 그리는 우리 마을의 내일</h2>
    <ul class="info">
      <li class="inq_cnt">조회 : 9</li>
      <li class="date">등록일 : 2026-07-21</li>
    </ul>
  </div>
  <div class="bbs_detail_content">
    <div class="board_images"><img src="/cmm/fms/getImage.do" alt="사진" /></div>
    <div class="bbs_detail_cont">
      <div class="left bbs-view-content bbs-view-content-skin07">
        태안군이 주민 스스로 살기 좋은 마을을 만들고, 지역 공동체에 활력을 불어넣기 위해 본격적인 배움의 장을 열었다.<br/>
        군에 따르면, 지난 16일 원북면 갈두천커뮤니티센터에서 13개 마을 마을리더 및 주민 42명이 참석한 가운데 ‘2026년 태안군 마을대학 개강식’을 개최했다고 밝혔다.<br/>
        태안군 마을대학은 주민들이 마을 공동체의 중요성을 이해하고, 고령화 등 지역 사회의 문제를 스스로 진단해 해결 방안을 찾아내는 주민 주도형 역량 강화가 목적이다.<br/>
        올해 교육은 7월 16일부터 8월 13일까지 주 1회씩 총 5회에 걸쳐 진행된다. 이번 마을대학 프로그램은 마을 공동체의 이해, 갈등관리와 소통법, 마을사업 추진 동기와 향후계획 등 이론과 실습을 접목한 커리큘럼으로 구성되었다.<br/>
        군 관계자는 “이번 마을대학을 통해 싹튼 주민들의 아이디어가 태안군 전역 마을을 활성화하는 소중한 밑거름이 되도록 힘쓰겠다”고 말했다.
        <div class='codeView00'><span>공보팀</span>이(가) 창작한 안내문은 공공누리 조건에 따라 이용할 수 있습니다.</div>
      </div>
    </div>
  </div>
</div>
`;

describe("taean parseListPage", () => {
  it("목록 행에서 nttId, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "1514303400",
      title: "주민의 손으로 직접 그리는 우리 마을의 내일",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.taean.go.kr/cop/bbs/BBSMSTR_000000000040/selectBoardArticle.do?nttId=1514303400",
    });
  });
});

describe("taean parseDetailBody", () => {
  it("bbs-view-content 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-21");
    expect(body).toContain("태안군 마을대학");
  });
});
