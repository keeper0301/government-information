// yeonggwang parser 회귀 방어. 영광군청 공식 보도자료의
// table 목록과 board_view 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/yeonggwang";

const MOCK_LIST_HTML = `
<table>
  <tbody>
    <tr>
      <td class="t_num">11750</td>
      <td class="txt_l t_title">
        <div class="title ">
          <a href="?b_id=news_data&amp;site=headquarter_new&amp;mn=9056&amp;type=view&amp;bs_idx=1169852">
            영광군,‘2026년 주민등록 사실조사’실시
          </a>
        </div>
      </td>
      <td class="t_user">기획예산실</td>
      <td class="t_date">2026-07-20</td>
      <td class="t_file"></td>
      <td class="t_hit">270</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<div id="board_view">
  <table>
    <tbody>
      <tr>
        <th scope="row">제목</th>
        <td colspan="3">영광군,‘2026년 주민등록 사실조사’실시</td>
      </tr>
      <tr>
        <td colspan="4" class="leftcell rightcell">
          <div class="board_view_contents">
            <p style="line-height:170%;text-align:center;"><span>영광군,‘2026년 주민등록 사실조사’실시</span></p>
            <p style="line-height:170%;text-align:center;"><span>- 스마트폰으로 집에서 참여하는 주민등록 사실조사 -</span></p>
            <p><span>영광군은 주민등록지와 실제 거주지의 일치 여부를 확인하기 위해 전 군민을 대상으로 7월 20일부터 12월 14일까지 주민등록 사실조사를 실시한다.</span></p>
            <p><span>이번 조사는 군민의 참여 부담을 줄이기 위해 비대면 조사와 방문조사로 나누어 진행하며, 비대면 조사는 정부24 앱을 통해 참여할 수 있다.</span></p>
            <p><span>방문조사는 비대면 조사에 참여하지 않은 세대와 중점 조사 대상 세대를 중심으로 이장과 담당 공무원이 거주 사실을 확인하는 방식으로 추진된다.</span></p>
            <p><span>군 관계자는 정확한 주민등록 관리가 복지, 재난, 선거 등 행정서비스의 기본 자료인 만큼 군민의 적극적인 협조를 당부했다.</span></p>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</div>
`;

describe("yeonggwang parseListPage", () => {
  it("보도자료 목록에서 bs_idx, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "1169852",
      title: "영광군,‘2026년 주민등록 사실조사’실시",
      publishedDate: "2026-07-20",
      sourceUrl:
        "https://www.yeonggwang.go.kr/bbs/?b_id=news_data&site=headquarter_new&mn=9056&type=view&bs_idx=1169852",
    });
  });
});

describe("yeonggwang parseDetailBody", () => {
  it("board_view_contents 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("주민등록 사실조사");
    expect(body).toContain("정부24 앱");
  });
});
