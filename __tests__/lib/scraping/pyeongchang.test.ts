// pyeongchang parser 회귀 방어. 평창군청 공식 보도자료의
// skinTb 목록과 thin visible body / eGov attachment fallback 구조를 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/pyeongchang";

describe("pyeongchang local press parser", () => {
  it("skinTb 목록에서 articleSeq/title/date/sourceUrl을 추출한다", () => {
    const html = `
      <table class="skinTb skinTb-data-resList skinTb-data-bgEven">
        <tbody>
          <tr>
            <td class="skinTxa-center">4544</td>
            <td class="skinTb-sbj">
              <a href="/portal/government/government-press/government-press-press?articleSeq=329753" onclick="goPage(329753); return false;">
                7월 24일 보도자료
              </a>
            </td>
            <td class="skinTb-name skinTxa-center">기획예산과</td>
            <td class="skinTb-date skinTxa-center">2026-07-24</td>
            <td class="skinTxa-center">35</td>
          </tr>
        </tbody>
      </table>
    `;

    expect(parseListPage(html)).toEqual([
      {
        seq: "329753",
        title: "7월 24일 보도자료",
        publishedDate: "2026-07-24",
        sourceUrl:
          "https://www.pc.go.kr/portal/government/government-press/government-press-press?articleSeq=329753",
      },
    ]);
  });

  it("상세 본문은 visible skinTb-conts가 충분하면 fallback으로 추출한다", async () => {
    const bodyHtml = [
      "평창군은 여름철 지역 축제와 생활 행정 정보를 군민에게 신속하게 제공하기 위해 보도자료 공개 체계를 운영하고 있다.",
      "이번 자료에는 지역 관광 활성화, 농업 현장 지원, 취약계층 복지, 주민 안전 관리 등 군민 생활과 밀접한 내용이 포함되어 있다.",
      "군은 부서별 추진 상황을 공식 누리집에 공개하고, 필요한 경우 첨부자료와 사진자료를 함께 제공해 언론과 주민이 정확한 정보를 확인할 수 있도록 할 계획이다.",
      "앞으로도 평창군은 보도자료 관리와 공개 절차를 안정적으로 유지해 행정 신뢰도를 높이고 현장 중심의 소통을 강화하겠다고 밝혔다.",
    ].join(" ");
    const html = `
      <div class="skinTb skinTb-data-bgSbj skinTb-data-view">
        <div class="skinTb-tr">
          <div class="skinTb-th col2">내용</div>
          <div class="skinTb-td skinTb-conts"><p>${bodyHtml}</p></div>
        </div>
      </div>
      <div class="skinBtnBo_box skinTxa-right"></div>
    `;

    const body = await parseDetailBody(html);
    expect(body).toContain("지역 관광 활성화");
    expect(body).toContain("행정 신뢰도를 높이고");
    expect(body?.length).toBeGreaterThan(250);
  });
});
