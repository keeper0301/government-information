// gunsan parser 회귀 방어. 군산시 보도 및 대응자료의
// legacy eminwon 목록/상세 HTML 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/gunsan";

const bodyText = `군산시는 시민 생활과 밀접한 주요 현안을 신속하게 알리기 위해 보도 및 대응자료를 배포했다. 이번 자료에는 지역 안전, 산업 지원, 행정 서비스 개선과 관련된 세부 내용이 포함되어 있으며 시민들이 쉽게 확인할 수 있도록 담당 부서별 안내도 함께 제공된다. 군산시는 앞으로도 현장 중심 행정과 투명한 정보 공개를 강화하고, 지역 주민들이 필요한 정보를 제때 받을 수 있도록 다양한 홍보 채널을 활용할 계획이라고 밝혔다. 관계자는 시민 편의와 행정 신뢰도를 높이기 위해 지속적으로 자료 품질을 개선하겠다고 설명했다.`;

describe("gunsan eminwon local press parser", () => {
  it("parses legacy eminwon table rows", () => {
    const html = `
      <table>
        <tr bgColor="#FFFFFF">
          <td onclick="javaScript:searchDetail('34737')">34555</td>
          <td align="left" onclick="javaScript:searchDetail('34737')"><p align=left>옥구읍 의용소방대, 학생 안전 위한 통학로 환경정비 나서</p></td>
          <td onclick="javaScript:searchDetail('34737')">옥구읍</td>
          <td onclick="javaScript:searchDetail('34737')">2026-07-22</td>
          <td onclick="javaScript:searchDetail('34737')">20</td>
        </tr>
      </table>
    `;

    const [item] = parseListItems(html);

    expect(item).toMatchObject({
      newsEpctNo: "34737",
      title: "옥구읍 의용소방대, 학생 안전 위한 통학로 환경정비 나서",
      department: "옥구읍",
      publishedDate: "2026-07-22",
    });
  });

  it("parses legacy eminwon detail body", () => {
    const html = `
      <table>
        <tr><td>제목</td><td>군산시 보도자료</td></tr>
        <tr><td>등록일</td><td>2026-07-22</td></tr>
        <tr><td>${bodyText}</td></tr>
      </table>
    `;

    const body = parseDetailBody(html);

    expect(body).toContain("군산시는 시민 생활과 밀접한 주요 현안");
    expect(body).toContain("행정 신뢰도");
    expect(body?.length).toBeGreaterThan(250);
  });
});
