// seogu_daegu parser 회귀 방어. 대구 서구 보도자료의
// YH board/post list + visible view_cont detail 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/seogu_daegu";

const MOCK_LIST_HTML = `
<table class="bod_list">
  <tbody>
    <tr>
      <td class="list_num">4909</td>
      <td class="list_tit">
        <a href="/portal/board/post/view.do?bcIdx=526&mid=0601080000&idx=251305" title="게시글 상세 열람">
          대구 서구, 맞춤형 직장 내 괴롭힘 예방 교육 실시
        </a>
      </td>
      <td class="list_file"><img src="/common/img/board/jpg.gif" alt="이미지 파일"/></td>
      <td class="list_part"><span>총무과</span></td>
      <td class="list_write">문화홍보과</td>
      <td class="list_date">2026-07-10</td>
      <td class="list_hit">476</td>
    </tr>
    <tr>
      <td class="list_num">4908</td>
      <td class="list_tit">
        <a href="/portal/board/post/view.do?bcIdx=526&mid=0601080000&idx=251304" title="게시글 상세 열람">
          대구 서구, 안전취약시설 77개소 민관 협업 점검
        </a>
      </td>
      <td class="list_file"><img src="/common/img/board/hwp.gif" alt="한글 파일"/></td>
      <td class="list_part"><span>안전총괄과</span></td>
      <td class="list_write">문화홍보과</td>
      <td class="list_date">2026-07-10</td>
      <td class="list_hit">540</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<div class="bod_wrap">
  <div class="bod_view">
    <div class="subject">대구 서구, 맞춤형 직장 내 괴롭힘 예방 교육 실시</div>
    <div class="view_info"><ul><li class="view_date"><span>등록일</span> 2026-07-10(금)</li></ul></div>
    <div class="view_cont">
      <div class="mT10 allRevert">
        <p><strong>대구 서구청</strong>은 저연차 직원을 대상으로 직장 내 괴롭힘 예방 교육을 실시했다고 밝혔다.</p>
        <p>이번 교육은 공직사회의 직장 내 괴롭힘에 대한 명확한 판단 기준을 정립하고 상호 존중과 소통을 바탕으로 한 건강한 조직문화를 조성하기 위해 마련됐다.</p>
        <p>강의는 전문 강사가 맡았으며, 직장 내 괴롭힘의 정의와 유형, 구체적인 사례 분석, 예방을 위한 세대 간 소통 방안 등을 중심으로 진행됐다.</p>
        <p>서구청은 앞으로도 전 직원 대상 세대·직급별 맞춤형 교육을 지속해 모두가 안심하고 일할 수 있는 근무 환경을 조성할 계획이라고 설명했다.</p>
      </div>
    </div>
    <dl class="view_file clFix"><dt><span>첨부 파일</span></dt><dd>첨부</dd></dl>
  </div>
</div>
`;

describe("seogu daegu local press parser", () => {
  it("parses YH board/post list rows", () => {
    const items = parseListItems(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "251305",
      title: "대구 서구, 맞춤형 직장 내 괴롭힘 예방 교육 실시",
      publishedDate: "2026-07-10",
    });
    expect(items[0]?.sourceUrl).toBe(
      "https://www.dgs.go.kr/portal/board/post/view.do?bcIdx=526&mid=0601080000&idx=251305",
    );
  });

  it("extracts visible view_cont body", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).toContain("대구 서구청 은 저연차 직원을 대상으로");
    expect(body?.length).toBeGreaterThan(250);
  });
});
