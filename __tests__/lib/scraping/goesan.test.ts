// goesan parser 회귀 방어. 공식 오늘의 괴산 게시판의
// web_zine 목록과 table_view td.con 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/goesan";

const MOCK_LIST_HTML = `
<ul class="web_zine_w">
  <li>
    <div class="wz_w">
      <p class="wz_img">
        <a href="./selectBbsNttView.do?key=136&amp;bbsNo=213&amp;nttNo=133244&amp;pageIndex=1">
          <img src="/DATA/bbs/213/thumb/t_sample.jpg" alt="괴산군, 2026년도 하계 학생 아르바이트 실시 이미지">
        </a>
      </p>
    </div>
    <dl>
      <dt>
        <a href="./selectBbsNttView.do?key=136&amp;bbsNo=213&amp;nttNo=133244&amp;pageIndex=1">
          괴산군, 2026년도 하계 학생 아르바이트 실시
        </a>
      </dt>
      <dd class="con"><a href="./selectBbsNttView.do?key=136&amp;bbsNo=213&amp;nttNo=133244&amp;pageIndex=1">충북 괴산군은 하계 학생 아르바이트 프로그램을 운영한다고 밝혔다.</a></dd>
      <dd class="date"><a href="./selectBbsNttView.do?key=136&amp;bbsNo=213&amp;nttNo=133244&amp;pageIndex=1">기획홍보과&nbsp;&nbsp;|&nbsp;&nbsp;2026-07-05&nbsp;&nbsp;|&nbsp;&nbsp;hit 172</a></dd>
    </dl>
  </li>
</ul>
`;

const MOCK_DETAIL_HTML = `
<div class="board_view">
  <table class="table_view">
    <tbody>
      <tr><th scope="row" colspan="2">괴산군, 2026년도 하계 학생 아르바이트 실시</th></tr>
      <tr><th scope="row" class="w20">작성일</th><td class="w80">2026-07-05</td></tr>
      <tr>
        <td colspan="2" class="con">
          괴산군, 2026년도 하계 학생 아르바이트 실시<br/>
          충북 괴산군은 2026년 하계 학생 아르바이트 프로그램을 운영한다고 밝혔다.<br/>
          관내 대학생을 대상으로 추첨을 통해 30명을 선발했으며 참여 학생들을 대상으로 근로활동 사전교육을 진행했다.<br/>
          특히 기초생활수급자, 차상위계층, 국가유공자 자녀 등 생활 여건이 어려운 대학생들과 중원대학교 학생들을 우선 선발해 학생들의 학비 마련과 사회경험 기회를 확대했다.<br/>
          참여 학생들은 군청과 읍·면사무소, 사업소 등 근무지에 배치돼 사무업무와 현장업무 보조 등 다양한 실무를 경험한다.<br/>
          군은 학생들이 공공기관 현장에서 사회생활을 간접 체험하며 직무 이해도를 높이고 근로의식도 키울 것으로 기대하고 있다.
          <div class="photo_area clearfix"></div>
        </td>
      </tr>
    </tbody>
  </table>
</div>
`;

describe("goesan parseListPage", () => {
  it("web_zine 목록에서 nttNo, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "133244",
      title: "괴산군, 2026년도 하계 학생 아르바이트 실시",
      publishedDate: "2026-07-05",
      sourceUrl:
        "https://www.goesan.go.kr/www/selectBbsNttView.do?key=136&bbsNo=213&nttNo=133244",
    });
  });
});

describe("goesan parseDetailBody", () => {
  it("table_view td.con 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("충북 괴산군");
    expect(body).toContain("하계 학생 아르바이트");
  });
});
