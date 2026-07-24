// gapyeong parser 회귀 방어. 가평군청 공식 보도자료의
// legacy bbs_default_list 목록과 board_text_td 본문/첨부 fallback 구조를 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/gapyeong";
import { parseSiNttBody } from "@/lib/scraping/local-press/_si_ntt_helper";

describe("gapyeong local press parser", () => {
  it("bbs_default_list 목록에서 id/title/date/sourceUrl을 추출한다", () => {
    const html = `
      <table class="bbs_default_list">
        <tbody class="tb">
          <tr>
            <td class="subject ">
              <a href="./selectBbsNttView.do?key=787&amp;bbsNo=127&amp;nttNo=286762&amp;searchCtgry=&amp;searchCnd=all&amp;searchKrwd=&amp;pageIndex=1&amp;integrDeptCode=" >
                가평군 보도자료(7월 23일자)
                <img src="/common/images/board/board_new_icon.gif" width="30" height="14" alt="새글" class="new" />
              </a>
            </td>
            <td><img src="/common/images/board/file/ico_folder.gif" alt="다수 파일 첨부" /></td>
            <td>2026-07-23</td>
          </tr>
        </tbody>
      </table>
    `;

    expect(parseListPage(html)).toEqual([
      {
        seq: "286762",
        title: "가평군 보도자료(7월 23일자)",
        publishedDate: "2026-07-23",
        sourceUrl:
          "https://gp.go.kr/portal/selectBbsNttView.do?key=787&bbsNo=127&nttNo=286762&searchCtgry=&searchCnd=all&searchKrwd=&pageIndex=1&integrDeptCode=",
      },
    ]);
  });

  it("공용 SI 본문 파서가 legacy board_text_td 스킨도 처리한다", () => {
    const text = [
      "가평군은 주민 생활과 밀접한 지역 현안을 해결하기 위해 관계 기관과 협력 체계를 강화하고 있다고 밝혔다.",
      "이번 보도자료에는 주민 편의 증진, 지역경제 활성화, 복지 서비스 확대 등 군정 주요 추진 상황이 포함되어 있다.",
      "군은 현장에서 나온 의견을 정책에 반영하고 부서 간 협업을 통해 행정 서비스의 품질을 높여 나갈 계획이다.",
      "또한 군민이 체감할 수 있는 성과를 만들기 위해 지속적인 점검과 개선을 이어가겠다고 설명했다.",
      "세부 계획에는 접근성 높은 정보 제공과 민원 응답 체계 보완, 현장 중심 안내 강화가 포함되어 있어 주민 만족도 향상에 도움이 될 것으로 기대된다.",
    ].join("<br/>");
    const html = `
      <table class="bbs_basic">
        <tbody class="tb">
          <tr><th scope="row">제목</th><td>가평군 보도자료(7월 23일자)</td></tr>
          <tr><th scope="row">내용</th><td class="board_text_td" id="cnText">${text}</td></tr>
          <tr><th scope="row">파일</th><td>첨부파일</td></tr>
        </tbody>
      </table>
    `;

    const body = parseSiNttBody(html);
    expect(body).toContain("주민 생활과 밀접한 지역 현안");
    expect(body).toContain("지속적인 점검과 개선");
    expect(body?.length).toBeGreaterThan(250);
  });

  it("상세 parser는 충분한 visible body가 있으면 바로 반환한다", async () => {
    const html = `
      <table class="bbs_basic">
        <tbody class="tb">
          <tr><th scope="row">내용</th><td class="board_text_td" id="cnText">
            가평군은 군민에게 필요한 정책 정보를 더 빠르게 전달하기 위해 보도자료 운영 체계를 지속적으로 개선하고 있다.<br/>
            담당 부서는 공개 자료의 정확성과 접근성을 높이고, 주요 사업의 진행 상황을 군민이 쉽게 이해할 수 있도록 설명 자료를 보강하고 있다.<br/>
            앞으로도 현장 의견을 반영해 생활밀착형 행정 서비스를 강화하고, 지역 공동체가 체감할 수 있는 변화를 만들겠다고 밝혔다.<br/>
            이번 조치는 군정 홍보의 투명성과 신뢰도를 높이기 위한 과정으로, 관계 기관과 협력해 후속 점검도 이어갈 예정이다.
          </td></tr>
        </tbody>
      </table>
    `;

    const body = await parseDetailBody(html);
    expect(body).toContain("보도자료 운영 체계를 지속적으로 개선");
    expect(body?.length).toBeGreaterThan(250);
  });
});
