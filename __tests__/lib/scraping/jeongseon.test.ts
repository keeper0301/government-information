// jeongseon parser 회귀 방어. 정선군청 공식 보도자료의
// skinTb 목록과 thin visible body / PDF 첨부 fallback 구조를 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/jeongseon";

describe("jeongseon local press parser", () => {
  it("skinTb 목록에서 goPage2 seq/title/date/sourceUrl을 추출한다", () => {
    const html = `
      <table class="skinTb skinTb-data-resList skinTb-data-bgEven">
        <tbody class="skinTxa-center">
          <tr>
            <td>691</td>
            <td class="skinTb-sbj" data-seq="first">
              <a href="javascript:goPage2('309198');">
                7월 24일 정선군 보도자료
              </a>
            </td>
            <td class="skinTb-name">문화체육과</td>
            <td class="skinTb-date">2026-07-24</td>
            <td>16</td>
          </tr>
        </tbody>
      </table>
    `;

    expect(parseListPage(html)).toEqual([
      {
        seq: "309198",
        title: "7월 24일 정선군 보도자료",
        publishedDate: "2026-07-24",
        sourceUrl:
          "https://www.jeongseon.go.kr/portal/openadmin/adminnews/pressrelease?articleSeq=309198",
      },
    ]);
  });

  it("상세 본문은 visible skinTb-conts가 충분하면 fallback으로 추출한다", async () => {
    const bodyHtml = [
      "정선군은 지역 주민과 언론에 군정 소식을 신속하게 제공하기 위해 공식 보도자료 게시판을 운영하고 있다.",
      "이번 자료에는 문화체육 행사, 주민 복지, 지역경제 활성화, 안전 관리 등 군민 생활과 밀접한 내용이 포함되어 있다.",
      "군은 부서별 추진 상황과 현장 행정 내용을 체계적으로 공개하고, 필요한 경우 첨부자료와 사진자료를 함께 제공해 정보 접근성을 높일 계획이다.",
      "앞으로도 정선군은 공식 누리집을 통해 정확한 보도자료를 안정적으로 제공하고 주민 소통을 강화하겠다고 밝혔다.",
    ].join(" ");
    const html = `
      <div class="skinTb skinMb-small skinTb-data-resList skinTb-data-bgSbj">
        <div class="skinTb-tr">
          <div class="skinTb-td skinTb-conts"><p>${bodyHtml}</p></div>
        </div>
      </div>
      <div class="skinBtnBo_box skinTxa-right"></div>
    `;

    const body = await parseDetailBody(html);
    expect(body).toContain("지역경제 활성화");
    expect(body).toContain("주민 소통을 강화");
    expect(body?.length).toBeGreaterThan(250);
  });
});
