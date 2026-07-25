// yanggu parser 회귀 방어. 양구군청 보도자료의
// FNC user_board_list 목록과 visible detail body 구조를 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/yanggu";

describe("yanggu local press parser", () => {
  it("parses FNC board list rows", () => {
    const html = `
      <div id="user_board_list">
        <table class="tc">
          <tr><th>번호</th><th>제목</th><th>날짜</th></tr>
          <tr>
            <td class="number">3891</td>
            <td class="tl title">
              <a href="user_sub?gfnc=www&amp;pg=1&amp;bk=TJAUN260724114135000&amp;mu_idx=232&amp;bt=rd&amp;pgsize=10&amp;bcd=press">
                양구군, 귀어 창업&middot;주택구입 지원사업 대상자 2차 모집
              </a>
            </td>
            <td class="file"></td>
            <td class="date">2026-07-24</td>
          </tr>
          <tr>
            <td class="number">3890</td>
            <td class="tl title">
              <a href="user_sub?gfnc=www&amp;pg=1&amp;bk=UPRBS260724114101091&amp;mu_idx=232&amp;bt=rd&amp;pgsize=10&amp;bcd=press">
                양구군 보건소, 학생 대상「알레르기비염 바로알기 교육」실시
              </a>
            </td>
            <td class="file"></td>
            <td class="date">2026-07-24</td>
          </tr>
        </table>
      </div>
    `;

    const items = parseListPage(html);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "TJAUN260724114135000",
      title: "양구군, 귀어 창업·주택구입 지원사업 대상자 2차 모집",
      publishedDate: "2026-07-24",
      sourceUrl:
        "https://www.yanggu.go.kr/user_sub?gfnc=www&pg=1&bk=TJAUN260724114135000&mu_idx=232&bt=rd&pgsize=10&bcd=press",
    });
  });

  it("parses visible detail body", () => {
    const bodyHtml = [
      "7월 30일까지 방문 접수…창업자금 최대 3억 원 지원",
      "연 1.5% 저금리 융자로 귀어인의 안정적인 지역 정착 지원",
      "양구군은 귀어를 희망하는 도시민의 안정적인 지역 정착과 어촌사회 활성화를 위해 오는 7월 30일까지 2026년 귀어 창업 및 주택구입 지원사업 대상자를 추가 모집한다.",
      "지원 대상은 사업 신청 연도 기준 만 65세 이하인 귀어업인 또는 재촌 비어업인이며, 창업자금과 주택 구입 자금을 장기 저리로 융자 지원한다.",
      "군은 신청자를 대상으로 사업계획과 자격 요건을 확인하고 대상자를 선정해 어촌 정착 기반 마련을 도울 계획이다.",
    ].join(" ");
    const html = `
      <div id="user_board_read_title">양구군, 귀어 창업&middot;주택구입 지원사업 대상자 2차 모집</div>
      <div class="read_information"><ul><li>작성일 : 2026-07-24 11:41:35</li></ul></div>
      <div id="user_board_read_view">
        <div class="user_board_read_view_pre"><p>${bodyHtml}</p></div>
      </div>
      </fieldset>
    `;

    const body = parseDetailBody(html);

    expect(body).toContain("양구군, 귀어 창업·주택구입 지원사업 대상자 2차 모집");
    expect(body).toContain("작성일 2026-07-24");
    expect(body).toContain("귀어인의 안정적인 지역 정착 지원");
    expect(body?.length).toBeGreaterThan(250);
  });
});
