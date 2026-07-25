// imsil parser 회귀 방어. 임실군청 보도자료의
// legacy eminwon 목록/상세 HTML 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/imsil";

const bodyText = `임실군은 지역 현안과 군정 주요 사업을 군민에게 신속하게 알리기 위해 보도자료를 배포했다. 이번 자료에는 지역 경제 활성화, 생활 안전, 주민 편의 개선과 관련한 추진 상황이 담겼으며 담당 부서의 현장 점검 결과와 향후 계획도 함께 안내됐다. 임실군은 군민이 필요한 정보를 제때 확인할 수 있도록 공식 누리집과 다양한 홍보 채널을 통해 자료를 지속적으로 제공하고, 군민 의견을 반영해 군정 소통을 강화하겠다고 밝혔다. 관계자는 정확하고 투명한 정보 제공으로 행정 신뢰도를 높이겠다고 설명했다.`;

describe("imsil eminwon local press parser", () => {
  it("parses legacy eminwon table rows", () => {
    const html = `
      <table>
        <tr bgColor="#FFFFFF">
          <td onclick="javaScript:searchDetail('17022')">16976</td>
          <td align="left" onclick="javaScript:searchDetail('17022')"><p align=left>임실군의회, 제353회 임시회 주요업무계획 보고 ‘내실있고 심도있게’ 추진</p></td>
          <td onclick="javaScript:searchDetail('17022')">의회사무과</td>
          <td onclick="javaScript:searchDetail('17022')">2026-07-24</td>
          <td onclick="javaScript:searchDetail('17022')">0</td>
        </tr>
      </table>
    `;

    const [item] = parseListItems(html);

    expect(item).toMatchObject({
      newsEpctNo: "17022",
      title: "임실군의회, 제353회 임시회 주요업무계획 보고 ‘내실있고 심도있게’ 추진",
      department: "의회사무과",
      publishedDate: "2026-07-24",
    });
  });

  it("parses legacy eminwon detail body", () => {
    const html = `
      <table>
        <tr><td>제목</td><td>임실군 보도자료</td></tr>
        <tr><td>등록일</td><td>2026-07-24</td></tr>
        <tr><TD style='word-break:break-all;' colspan=4>${bodyText}</TD></tr>
      </table>
    `;

    const body = parseDetailBody(html);

    expect(body).toContain("임실군은 지역 현안과 군정 주요 사업");
    expect(body).toContain("행정 신뢰도");
    expect(body?.length).toBeGreaterThan(250);
  });
});
