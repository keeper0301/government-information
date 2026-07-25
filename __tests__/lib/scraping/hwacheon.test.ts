// hwacheon parser 회귀 방어. 화천군청 군정홍보관 보도자료의
// media bbs_default 목록과 HWP 첨부 fallback 구조를 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/hwacheon";

describe("hwacheon local press parser", () => {
  it("bbs_default 목록에서 nttNo/title/date/sourceUrl을 추출한다", () => {
    const html = `
      <table class="bbs_default list" data-rwdb="yes">
        <tbody>
          <tr>
            <td>1210</td>
            <td class="subject ">
              <a href="./selectBbsNttView.do?key=900&amp;bbsNo=91&amp;nttNo=187261&amp;searchCtgry=&amp;searchCnd=all&amp;searchKrwd=&amp;pageIndex=1&amp;integrDeptCode=" >
                2026/07/23
                <img src="/common/images/board/board_new_icon.gif" alt="새글" class="new" />
              </a>
            </td>
            <td><img src="/common/images/board/file/ico_hwp.gif" alt="2026/07/23" /></td>
            <td>기획감사실</td>
            <td>13</td>
            <td class="last">2026.07.23</td>
          </tr>
        </tbody>
      </table>
    `;

    expect(parseListPage(html)).toEqual([
      {
        seq: "187261",
        title: "2026/07/23",
        publishedDate: "2026-07-23",
        sourceUrl:
          "https://www.ihc.go.kr/media/selectBbsNttView.do?key=900&bbsNo=91&nttNo=187261&pageIndex=1",
      },
    ]);
  });

  it("상세 본문은 visible bbs_content가 충분하면 fallback으로 추출한다", async () => {
    const bodyHtml = [
      "화천군은 교육 현장의 목소리를 적극 수렴해 지역 학생과 학부모가 체감할 수 있는 지원사업을 추진한다.",
      "이번 간담회에서는 농촌 유학가구 거주 문제 해결, 농촌유학센터와 학교 연계 운영, 학교 주변 시설과 환경정비 등이 논의됐다.",
      "군은 작은 학교 통학차량 임차료 지원과 방과후 프로그램 운영 등 지역 교육 여건 개선에 필요한 예산을 반영할 계획이다.",
      "화천군은 앞으로도 교육지원청, 각급 학교와 협력해 아이 기르기 좋은 교육환경을 조성하고 현장 의견을 정기적으로 확인하겠다고 밝혔다.",
    ].join(" ");
    const html = `
      <table class="bbs_default view">
        <tbody>
          <tr>
            <th scope="row">내용</th>
            <td title="내용" class="bbs_content"><div class="photo_area clearfix"></div>${bodyHtml}</td>
          </tr>
        </tbody>
      </table>
    `;

    const body = await parseDetailBody(html);
    expect(body).toContain("농촌 유학가구 거주 문제");
    expect(body).toContain("아이 기르기 좋은 교육환경");
    expect(body?.length).toBeGreaterThan(250);
  });
});
