// bsdonggu parser 회귀 방어. 부산 동구 보도/해명자료의
// RFC3 board/list.donggu + board/view.donggu 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListPage } from "@/lib/scraping/local-press/bsdonggu";

const longVisibleBody = `부산 동구는 지역 주민과 복지기관이 함께 참여하는 나눔 행사를 열고 이웃 돌봄 체계를 강화한다고 밝혔다. 이번 행사는 관내 취약계층을 대상으로 식료품과 생활용품을 정기적으로 지원하고 주민 참여형 복지 네트워크를 확대하기 위해 마련됐다. 동구는 민간단체와 협력해 후원 물품을 안정적으로 전달하고 복지 사각지대에 놓인 주민을 지속적으로 발굴할 계획이다. 구 관계자는 앞으로도 지역 공동체와 함께 다양한 나눔 사업을 추진해 따뜻한 복지도시 동구를 만들어 가겠다고 말했다.`;

describe("bsdonggu local press parser", () => {
  it("parses RFC3 list rows with dataSid", () => {
    const html = `
      <table>
        <tbody class="tb">
          <tr>
            <td class="mobile_skip">8975</td>
            <td class="mobile_need subject">
              <a href="/board/view.donggu?boardId=BBS_0000025&amp;menuCd=DOM_000000103001006000&amp;paging=ok&amp;startPage=1&amp;dataSid=5094440" title="부산부전로터리클럽, 동구 희망나눔점빵 초량6동점에 매월 식료품 등 정기 후원">부산부전로터리클럽, 동구 희망나눔점빵 초량6동점에 매월 식료품 등 정기 후원</a>
            </td>
            <td class="mobile_skip">초량6동</td>
            <td class="mobile_skip"><a href="/board/view.donggu?boardId=BBS_0000025&amp;dataSid=5094440">첨부</a></td>
            <td class="mobile_need">2026.07.24</td>
            <td class="mobile_skip">24</td>
          </tr>
        </tbody>
      </table>
    `;

    const [item] = parseListPage(html);

    expect(item).toMatchObject({
      seq: "5094440",
      title: "부산부전로터리클럽, 동구 희망나눔점빵 초량6동점에 매월 식료품 등 정기 후원",
      publishedDate: "2026-07-24",
    });
    expect(item.sourceUrl).toContain("dataSid=5094440");
    expect(item.sourceUrl).toContain("boardId=BBS_0000025");
  });

  it("falls back to meaningful visible body when attachment extraction is unavailable", async () => {
    const html = `
      <table class="bbs_default view">
        <tbody>
          <tr class="subject">
            <th scope="row">제목</th>
            <td colspan="5">부산부전로터리클럽, 동구 희망나눔점빵 초량6동점에 매월 식료품 등 정기 후원</td>
          </tr>
          <tr>
            <th scope="row">작성자</th><td>초량6동</td>
            <th scope="row">등록일</th><td>2026.07.24</td>
            <th scope="row">조회수</th><td>25</td>
          </tr>
          <tr class="bbs_content_area">
            <td title="내용" class="bbs_content" colspan="6">${longVisibleBody.replace(/\n/g, "<br />")}</td>
          </tr>
        </tbody>
      </table>
    `;

    const body = await parseDetailBody(html);

    expect(body).toContain("부산 동구는 지역 주민과 복지기관");
    expect(body).toContain("2026-07-24");
    expect(body?.length).toBeGreaterThan(250);
  });
});
