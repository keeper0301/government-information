// bsnamgu-eminwon parser 회귀 방어. 부산 남구 보도자료의
// legacy eminwon iframe + news_epct_yn=1,2 구조를 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListItems,
} from "@/lib/scraping/local-press/bsnamgu-eminwon";

const MOCK_LIST_HTML = `
<table>
  <tbody>
    <tr>
      <td>13065</td>
      <td class="td_left"><a href="#" onclick="javaScript:searchDetail('13135');">[포토] 용당교회,‘행복한 삼계탕 DAY’행사 개최</a></td>
      <td>용당동</td>
      <td>2026-07-24</td>
      <td>0</td>
    </tr>
    <tr>
      <td>13064</td>
      <td class="td_left"><a href="#" onclick="javaScript:searchDetail('13134');">[포토] 문현2동 자율방범대, 안전한 우리 동네 만들기 ‘민·관·경 합동 순찰’실시</a></td>
      <td>문현2동</td>
      <td>2026-07-24</td>
      <td>2</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<html>
<body>
  <div>
    <h3>용당교회, 행복한 삼계탕 DAY 행사 개최</h3>
    <table class="table_03">
      <tr><th>작성부서</th><td>용당동</td><th>등록일자</th><td>2026-07-24</td></tr>
      <tr><th>첨부파일</th><td colspan="3"><ul><li>등록된 파일이 없습니다.</li></ul></td></tr>
      <tr><td class="tleft" colspan="4">부산 남구 용당동은 지역 교회와 함께 어르신을 위한 삼계탕 나눔 행사를 열었다고 밝혔다. 이번 행사는 무더위에 지친 어르신들의 건강을 살피고 이웃 간 돌봄 문화를 확산하기 위해 마련됐으며, 자원봉사자들이 직접 음식을 준비하고 안부를 확인했다. 남구는 앞으로도 주민과 민간단체가 함께하는 복지 협력 사업을 지속적으로 추진해 취약계층의 생활 안정을 돕고 따뜻한 지역 공동체를 만들어 갈 계획이다. 관계자는 작은 나눔이 지역사회에 큰 힘이 되도록 꾸준히 협력하겠다고 말했다.</td></tr>
    </table>
  </div>
</body>
</html>
`;

describe("bsnamgu-eminwon local press parser", () => {
  it("parses searchDetail rows with title, department, and date", () => {
    const items = parseListItems(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      newsEpctNo: "13135",
      title: "[포토] 용당교회,‘행복한 삼계탕 DAY’행사 개최",
      department: "용당동",
      publishedDate: "2026-07-24",
    });
  });

  it("extracts a meaningful Korean body from detail table cells", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).toContain("부산 남구 용당동");
    expect(body?.length).toBeGreaterThan(250);
  });
});
