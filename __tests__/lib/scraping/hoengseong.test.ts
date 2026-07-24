// hoengseong parser 회귀 방어. 횡성군청 공식 군정보도자료의
// SI p-table 목록과 thin visible body / 첨부 fallback 구조를 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/hoengseong";

describe("hoengseong local press parser", () => {
  it("p-table 목록에서 id/title/date/sourceUrl을 추출하고 jsessionid를 버린다", () => {
    const html = `
      <table class="p-table">
        <tbody>
          <tr>
            <td>5,870</td>
            <td class="p-subject">
              <a href="./selectBbsNttView.do;jsessionid=ABC123?key=827&amp;bbsNo=67&amp;nttNo=423196&amp;pageUnit=10&amp;searchCnd=all" target="_top">
                횡성군정보도자료（2026. 7. 24.）
              </a>
            </td>
            <td>홍보팀</td>
            <td>2026-07-24</td>
          </tr>
        </tbody>
      </table>
    `;

    expect(parseListPage(html)).toEqual([
      {
        seq: "423196",
        title: "횡성군정보도자료（2026. 7. 24.）",
        publishedDate: "2026-07-24",
        sourceUrl:
          "https://www.hsg.go.kr/www/selectBbsNttView.do?key=827&bbsNo=67&nttNo=423196&pageUnit=10&searchCnd=all",
      },
    ]);
  });

  it("상세 본문은 SI body fallback으로 250자 이상 한글 본문을 추출한다", async () => {
    const bodyHtml = [
      "횡성군은 주민 생활과 밀접한 군정 정보를 빠르게 전달하기 위해 보도자료 배포 체계를 지속적으로 개선하고 있다.",
      "이번 자료에는 군민 생활 안정, 지역경제 활성화, 행정서비스 품질 향상과 관련한 주요 추진 사항이 포함되어 있다.",
      "특히 현장 중심 행정을 강화하고 부서 간 협업을 넓혀 군민이 체감할 수 있는 성과를 만들겠다는 계획을 설명했다.",
      "군은 앞으로도 공식 누리집을 통해 보도자료를 신속하게 공개하고, 정확한 정보 제공을 위해 자료 관리와 검증 절차를 보완할 방침이다.",
    ].join(" ");
    const html = `
      <table class="p-table block">
        <tbody class="p-table--th-left">
          <tr><td colspan="2"><span class="p-table__subject_text">횡성군정보도자료（2026. 7. 24.）</span><time>2026-07-24</time></td></tr>
          <tr><td colspan="2" title="내용" class="p-table__content">${bodyHtml}</td></tr>
        </tbody>
      </table>
    `;

    const body = await parseDetailBody(html);
    expect(body).toContain("군정 정보를 빠르게 전달");
    expect(body).toContain("자료 관리와 검증 절차");
    expect(body?.length).toBeGreaterThan(250);
  });
});
