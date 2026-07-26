// saha parser 회귀 방어. 부산 사하구 보도자료의
// portal/bbs boardView list + PDF attachment-first detail 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/saha";

const MOCK_LIST_HTML = `
<table class="tableSt_list row_over">
  <tbody>
    <tr>
      <td class="num">1591</td>
      <td class="taL title">
        <a href="#" onclick="boardView('listForm', '250power', 'Y', '153554', '24', '0301060000', '1'); return false;">
          사하구, 주민 중심 쌍방향 소통을 위한  민선 9기 「통하는 구청장실」 본격 가동
        </a>
      </td>
      <td>미디어홍보과</td>
      <td class="date">2026.07.20</td>
      <td><img src='/common/images/board/pdf.gif' alt='pdf파일'/></td>
      <td class="hits">54</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<table class="tableSt_view">
  <tbody>
    <tr><th scope="col" colspan="6" class="title">사하구, 주민 중심 쌍방향 소통을 위한 민선 9기 「통하는 구청장실」 본격 가동</th></tr>
    <tr><th id="attachedfile">첨부파일</th><td class="box_file"><a href="#">사하구 보도자료.pdf</a></td></tr>
    <tr>
      <td colspan="6">
        <div class="cont_box">
          사하구는 주민과 더 가까이 소통하기 위해 민선 9기 통하는 구청장실을 본격 가동한다고 밝혔다. 구청장은 현장의 다양한 목소리를 직접 듣고 생활 불편, 안전, 복지, 도시환경 등 주민이 체감하는 현안을 신속하게 확인할 계획이다. 문자 직통 창구와 현장 방문 상담을 함께 운영해 언제 어디서나 쉽게 의견을 전달할 수 있도록 하고, 접수된 의견은 담당 부서 검토와 처리 결과 안내까지 이어지도록 관리한다. 사하구는 이번 소통 창구를 통해 주민 중심 행정을 강화하고 열린 구정 문화를 확산하겠다고 설명했다.
        </div>
      </td>
    </tr>
  </tbody>
</table>
`;

describe("saha local press parser", () => {
  it("parses portal/bbs boardView rows", () => {
    const items = parseListItems(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "153554",
      title: "사하구, 주민 중심 쌍방향 소통을 위한 민선 9기 「통하는 구청장실」 본격 가동",
      publishedDate: "2026-07-20",
      sourceUrl:
        "https://www.saha.go.kr/portal/bbs/view.do?mId=0301060000&bIdx=153554&ptIdx=24",
    });
  });

  it("falls back to visible cont_box when attachment parsing is unavailable", async () => {
    const body = await parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).toContain("사하구는 주민과 더 가까이 소통하기 위해");
    expect(body?.length).toBeGreaterThan(250);
  });
});
