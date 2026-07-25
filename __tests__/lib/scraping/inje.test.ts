// inje parser 회귀 방어. 인제군청 보도자료의
// skinTb 목록과 thin visible body / PDF 첨부 fallback 구조를 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/inje";

describe("inje local press parser", () => {
  it("parses skinTb list rows", () => {
    const html = `
      <table class="skinTb skinTb-data-resList skinTb-data-bgEven">
        <tbody>
          <tr>
            <td class="skinTxa-center">576</td>
            <td class="skinTb-sbj" data-seq="first">
              <a href="/portal/inje-news/inje-pr/briefing?articleSeq=252088" onclick="goPage(252088); return false;">
                인제군 보도자료[2026년 7월 24일(금)]
              </a>
            </td>
            <td class="skinTb-name skinTxa-center">기획예산담당관</td>
            <td class="skinTb-date skinTxa-center">2026-07-24</td>
          </tr>
          <tr>
            <td class="skinTxa-center">575</td>
            <td class="skinTb-sbj" data-seq="first">
              <a href="/portal/inje-news/inje-pr/briefing?articleSeq=252041" onclick="goPage(252041); return false;">
                인제군 보도자료[2026년 7월 23일(목)]
              </a>
            </td>
            <td class="skinTb-name skinTxa-center">기획예산담당관</td>
            <td class="skinTb-date skinTxa-center">2026-07-23</td>
          </tr>
        </tbody>
      </table>
    `;

    const items = parseListPage(html);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "252088",
      title: "인제군 보도자료[2026년 7월 24일(금)]",
      publishedDate: "2026-07-24",
      sourceUrl:
        "https://www.inje.go.kr/portal/inje-news/inje-pr/briefing?articleSeq=252088",
    });
  });

  it("falls back to a long visible skinTb body when present", async () => {
    const bodyHtml = [
      "인제군은 지역 농업인의 소득 안정과 농촌 활력 회복을 위해 여름철 현장 지원을 강화한다.",
      "이번 보도자료에는 청년 농업인 교육, 마을 공동체 사업, 생활 인프라 개선 등 여러 군정 소식이 포함되어 있다.",
      "군은 관계 기관과 협력해 사업 대상자를 점검하고 주민이 체감할 수 있는 정책 홍보와 행정 지원을 이어갈 계획이다.",
      "인제군 관계자는 현장 의견을 반영해 군민 생활에 도움이 되는 사업을 지속적으로 발굴하겠다고 밝혔다.",
    ].join(" ");
    const html = `
      <div class="skinTb skinTb-data-resList skinTb-data-bgSbj">
        <div class="skinTb-tr"><div class="skinTb-th">제목</div><div class="skinTb-td skinTb-sbj">인제군 보도자료[2026년 7월 24일(금)]</div></div>
        <div class="skinTb-tr"><div class="skinTb-th">등록일</div><div class="skinTb-td col2 skinTb-date">2026-07-24</div></div>
        <div class="skinTb-tr"><div class="skinTb-td skinTb-conts"><p>${bodyHtml}</p></div></div>
        <div class="skinTb-tr"><div class="skinTb-th">첨부파일</div><div class="skinTb-td"></div></div>
      </div>
    `;

    const body = await parseDetailBody(html);

    expect(body).toContain("인제군 보도자료[2026년 7월 24일(금)]");
    expect(body).toContain("등록일 2026-07-24");
    expect(body).toContain("군민 생활에 도움이 되는 사업");
    expect(body?.length).toBeGreaterThan(250);
  });
});
