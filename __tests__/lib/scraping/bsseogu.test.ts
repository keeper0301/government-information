// bsseogu parser 회귀 방어. 부산 서구 보도/해명 자료의
// RFC3 board/list.bsseogu + board/view.bsseogu 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListPage } from "@/lib/scraping/local-press/bsseogu";

const bodyText = `부산 서구보건소는 아토피피부염의 올바른 예방관리 습관을 어린 시기부터 형성할 수 있도록 관내 유치원과 어린이집 아동을 대상으로 숲속 꿈나무 아토피·천식 예방교실을 운영한다고 밝혔다. 이번 프로그램은 구덕산 유아숲체험원에서 진행되며 자연 속 체험과 놀이를 접목한 건강교육을 통해 어린이들이 알레르기질환 예방의 중요성을 쉽고 재미있게 배울 수 있도록 구성됐다. 전문 강사가 그림자료와 퀴즈, 율동 등 다양한 활동을 진행하고 식품 알레르기 예방교육도 함께 제공한다. 서구보건소는 앞으로도 아토피·천식 안심학교와 연계한 다양한 예방관리 사업을 지속적으로 추진해 아이들이 건강하게 성장할 수 있는 환경 조성에 최선을 다하겠다고 말했다.`;

describe("bsseogu local press parser", () => {
  it("parses RFC3 list rows with dataSid", () => {
    const html = `
      <table>
        <tr>
          <td>9884</td>
          <td class="l">
            <a href="/board/view.bsseogu?boardId=BBS_0000011&amp;menuCd=DOM_000000103001015000&amp;orderBy=REGISTER_DATE DESC&amp;paging=ok&amp;startPage=1&amp;dataSid=274196" title="부산 서구 보건소, 숲속 꿈나무 아토피·천식 예방교실 운영">부산 서구 보건소, 숲속 꿈나무 아토피·천식 예방교실 운영</a>
          </td>
          <td>보건행정과</td>
          <td>2026. 07. 09</td>
          <td>61</td>
        </tr>
      </table>
    `;

    const [item] = parseListPage(html);

    expect(item).toMatchObject({
      seq: "274196",
      title: "부산 서구 보건소, 숲속 꿈나무 아토피·천식 예방교실 운영",
      publishedDate: "2026-07-09",
    });
    expect(item.sourceUrl).toContain("dataSid=274196");
    expect(item.sourceUrl).toContain("boardId=BBS_0000011");
  });

  it("parses RFC3 detail visible body", () => {
    const html = `
      <div class="board-view-wrap">
        <h4> 부산 서구 보건소, 숲속 꿈나무 아토피·천식 예방교실 운영 </h4>
        <ul class="info"><li> 2026-07-09 11:13:09 </li><li>조회수 : 62.</li></ul>
        <div class="doc-file"><a href="/board/download.bsseogu?fileSid=117378">첨부.jpeg</a></div>
        <div class="con">
          ${bodyText.replace(/\n/g, "<br/>")}
        </div>
      </div>
      <div class="sgap"></div>
    `;

    const body = parseDetailBody(html);

    expect(body).toContain("부산 서구보건소는 아토피피부염");
    expect(body).toContain("2026-07-09");
    expect(body?.length).toBeGreaterThan(250);
  });
});
