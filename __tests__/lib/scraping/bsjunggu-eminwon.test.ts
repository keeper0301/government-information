// bsjunggu parser 회귀 방어. 부산 중구 보도/해명의
// legacy eminwon 목록/상세 HTML 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/bsjunggu-eminwon";

const bodyText = `부산 중구는 혹서기 취약계층의 건강한 여름나기를 지원하기 위해 지역사회보장협의체와 함께 보양식 전달과 안부 확인 활동을 추진했다. 이번 활동은 고령자와 1인 가구 등 폭염에 취약한 주민을 대상으로 진행됐으며, 동 행정복지센터와 지역 봉사자들이 가정을 방문해 건강 상태를 확인하고 필요한 복지 서비스를 연계했다. 중구는 앞으로도 주민 생활과 밀접한 현장을 지속적으로 살피고 민관 협력 체계를 강화해 안전하고 따뜻한 지역 공동체를 만들어가겠다고 밝혔다. 관계자는 작은 관심과 나눔이 주민 안전을 지키는 큰 힘이 된다고 설명했다.`;

describe("bsjunggu eminwon local press parser", () => {
  it("parses legacy eminwon table rows", () => {
    const html = `
      <table>
        <tr>
          <td>2588</td>
          <td class='subject'><a href="javaScript:searchDetail('2597')">광복동 지역사회보장협의체, 혹서기 취약계층을 위한‘건강한 여름 나기’보양...</a></td>
          <td>광복동</td>
          <td>2026-07-20</td>
          <td>26</td>
        </tr>
      </table>
    `;

    const [item] = parseListItems(html);

    expect(item).toMatchObject({
      newsEpctNo: "2597",
      title: "광복동 지역사회보장협의체, 혹서기 취약계층을 위한‘건강한 여름 나기’보양...",
      department: "광복동",
      publishedDate: "2026-07-20",
    });
  });

  it("parses legacy eminwon detail body", () => {
    const html = `
      <table>
        <tr><td>제목</td><td>부산 중구 보도자료</td></tr>
        <tr><td>등록일</td><td>2026-07-20</td></tr>
        <tr><td style='word-break:break-all;' colspan=4>${bodyText}</td></tr>
      </table>
    `;

    const body = parseDetailBody(html);

    expect(body).toContain("부산 중구는 혹서기 취약계층");
    expect(body).toContain("민관 협력 체계");
    expect(body?.length).toBeGreaterThan(250);
  });
});
