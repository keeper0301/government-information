// yangyang parser 회귀 방어. 양양군청 보도자료의
// eminwon 목록/상세 HTML 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/yangyang";

const longBody = `양양 하조대 해변이 한여름 밤을 뜨겁게 달굴 음악과 레크리에이션의 장으로 변신한다. 하조대 비치페스티벌은 하조대 해변 일원에서 개최되며 피서객과 지역 주민 누구나 함께 즐길 수 있는 참여형 프로그램과 공연으로 채워진다. 무더위를 날려줄 물풍선 게임, 풍선탑 쌓기, 현장 레크리에이션과 이벤트가 이어지고 어쿠스틱 공연과 트롯 무대, 걸그룹 공연도 마련된다. 행사 관계자는 하조대를 찾은 피서객들과 지역 주민들이 일상의 스트레스를 날리고 잊지 못할 여름날의 추억을 만들 수 있도록 준비했다고 밝혔다.`;

describe("yangyang eminwon local press parser", () => {
  it("parses eminwon skinTb list rows", () => {
    const html = `
      <table class="skinTb skinTb-data-resList skinTb-data-bgEven">
        <tbody class="skinTxa-center">
          <tr>
            <td data-hidden="tablet mob"><a href="#" onclick="javaScript:searchDetail('8656')">8642</a></td>
            <td class="skinTb-sbj" data-seq="first"><a href="#" onclick="javaScript:searchDetail('8656')">2026 하조대 비치페스티벌 8월 1일 개최</a></td>
            <td class="skinTb-name"><a href="#" onclick="javaScript:searchDetail('8656')">기획예산과</a></td>
            <td class="skinTb-date"><a href="#" onclick="javaScript:searchDetail('8656')">2026-07-24</a></td>
            <td data-hidden="tablet mob"><a href="#" onclick="javaScript:searchDetail('8656')">3</a></td>
          </tr>
        </tbody>
      </table>
    `;

    const [item] = parseListItems(html);

    expect(item).toMatchObject({
      newsEpctNo: "8656",
      title: "2026 하조대 비치페스티벌 8월 1일 개최",
      department: "기획예산과",
      publishedDate: "2026-07-24",
    });
  });

  it("parses eminwon detail body", () => {
    const html = `
      <div class="skinTb skinMb-small skinTb-data-resList skinTb-data-bgSbj">
        <div class="skinTb-tr">
          <div class="skinTb-th col3 skinTxa-center">제목</div>
          <div class="skinTb-td skinTb-sbj">2026 하조대 비치페스티벌 8월 1일 개최</div>
        </div>
        <div class="skinTb-tr">
          <div class="skinTb-th col3 skinTxa-center">등록일자</div>
          <div class="skinTb-td col3 skinTb-date">2026-07-24</div>
        </div>
        <div class="skinTb-tr">
          <div class="skinTb-td skinTb-conts">${longBody}</div>
        </div>
      </div>
    `;

    const body = parseDetailBody(html);

    expect(body).toContain("양양 하조대 해변");
    expect(body).toContain("하조대 비치페스티벌");
    expect(body?.length).toBeGreaterThan(250);
  });
});
