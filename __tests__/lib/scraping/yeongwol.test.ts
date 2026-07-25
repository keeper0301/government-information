// yeongwol parser 회귀 방어. 영월군청 공식 보도자료의
// SI legacy bbs_default 목록과 thin visible body / HWP 첨부 fallback 구조를 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/yeongwol";

describe("yeongwol local press parser", () => {
  it("bbs_default 목록에서 id/title/date/sourceUrl을 추출한다", () => {
    const html = `
      <table class="bbs_default list">
        <tbody>
          <tr>
            <td class="first">6137</td>
            <td class="subject">
              <a href="./selectBbsNttView.do?key=21&amp;bbsNo=19&amp;nttNo=155858&amp;searchCtgry=&amp;searchCnd=all&amp;searchKrwd=&amp;pageIndex=1&amp;integrDeptCode=&amp;pageUnit=10">20260723 영월군 보도자료</a>
              <span class="bbs_ico new">새글</span>
            </td>
            <td><img src="/common/images/board/file/ico_folder.gif" alt="다수의 첨부파일" /></td>
            <td>2026.07.23</td>
            <td class="last">78</td>
          </tr>
        </tbody>
      </table>
    `;

    expect(parseListPage(html)).toEqual([
      {
        seq: "155858",
        title: "20260723 영월군 보도자료",
        publishedDate: "2026-07-23",
        sourceUrl:
          "https://www.yw.go.kr/www/selectBbsNttView.do?key=21&bbsNo=19&nttNo=155858&searchCtgry=&searchCnd=all&searchKrwd=&pageIndex=1&integrDeptCode=&pageUnit=10",
      },
    ]);
  });

  it("상세 본문은 SI body fallback으로 250자 이상 한글 본문을 추출한다", async () => {
    const bodyHtml = [
      "영월군은 지역 주민에게 군정 소식과 생활 정보를 신속하게 전달하기 위해 보도자료 제공 체계를 지속적으로 정비하고 있다.",
      "이번 자료에는 농촌유학 복합거점 조성, 지역 상생 기부, 치매가족 지원, 문화예술 공연 등 주민 생활과 밀접한 내용이 포함되어 있다.",
      "군은 각 사업별 추진 일정과 참여 방법을 공식 누리집을 통해 안내하고, 관련 부서와 협력해 현장 중심 행정을 강화할 계획이라고 밝혔다.",
      "앞으로도 보도자료 공개 절차를 안정적으로 운영해 군민과 방문객이 필요한 정보를 빠르게 확인할 수 있도록 자료 품질을 높일 방침이다.",
    ].join(" ");
    const html = `
      <table class="bbs_default view">
        <tbody>
          <tr class="subject"><th scope="row">제목</th><td>20260723 영월군 보도자료</td></tr>
          <tr><th scope="row">내용</th><td title="내용" class="bbs_content">${bodyHtml}</td></tr>
        </tbody>
      </table>
    `;

    const body = await parseDetailBody(html);
    expect(body).toContain("농촌유학 복합거점");
    expect(body).toContain("자료 품질을 높일 방침");
    expect(body?.length).toBeGreaterThan(250);
  });
});
