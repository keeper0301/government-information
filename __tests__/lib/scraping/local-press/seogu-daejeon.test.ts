// ============================================================
// 대전 서구 보도자료 parser 단위 테스트 (2026-06-01)
// ============================================================
// eGovFrame bbs. list = fn_search_detail(nttId) + strong.bbs-subject-txt,
// 본문 = div.ui bbs--view--cont.

import { describe, it, expect } from "vitest";
import { parseListPage, parseDetailBody } from "@/lib/scraping/local-press/seogu_daejeon";

describe("대전 서구 parseListPage (fn_search_detail)", () => {
  it("nttId(영숫자)/title/등록일 추출 + 새글 strip + sourceUrl", () => {
    const html = `
      <tr>
        <td class="atchFileId">6370</td>
        <td data-cell-header="제목" class="subject">
          <button onclick="javascript: fn_search_detail('B000000217929Hk2sL3'); return false;" class="link">
            <div class="bbs-subject-con"><strong class="bbs-subject-txt">민주평통 대전서구협의회 2분기 정기회의 개최</strong>
            <div class="bbs-subject-icons"><span class="new">새글</span></div></div>
          </button>
        </td>
        <td data-cell-header="부서명" class="deptName">홍보담당관</td>
        <td data-cell-header="조회수" class="hit">9</td>
        <td data-cell-header="등록일" class="regDate">2026-06-01</td>
      </tr>
    `;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("B000000217929Hk2sL3");
    expect(items[0].title).toBe("민주평통 대전서구협의회 2분기 정기회의 개최");
    expect(items[0].publishedDate).toBe("2026-06-01");
    expect(items[0].sourceUrl).toBe(
      "https://www.seogu.go.kr/bbs/BBSMSTR_000000000277/view.do?nttId=B000000217929Hk2sL3",
    );
  });

  it("strong 없는 행이 다음 항목 제목을 도용하지 않음 (cross-item 가드)", () => {
    // 공지행(strong 없음) + 정상행. 공지행이 정상행 제목을 끌어오면 안 됨.
    const html = `
      <button onclick="fn_search_detail('NOTICE_ROW');">제목 strong 없는 공지 버튼</button>
      <button onclick="fn_search_detail('REAL_ROW');"><strong class="bbs-subject-txt">진짜 보도자료 제목입니다</strong></button>
      <td class="regDate">2026-06-01</td>
    `;
    const items = parseListPage(html);
    // NOTICE_ROW 는 자기 strong 이 없어 매칭에서 제외, REAL_ROW 만 정상.
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("REAL_ROW");
    expect(items[0].title).toBe("진짜 보도자료 제목입니다");
  });
});

describe("대전 서구 parseDetailBody (ui bbs--view--cont)", () => {
  const LONG =
    "대전 서구는 민주평화통일자문회의 대전 서구협의회 2분기 정기회의를 개최하고 한반도 평화 관리 방안을 논의했다고 밝혔다. 이번 회의에서는 평화통일 공감대 확산을 위한 다양한 지역 활동 방안이 제시됐으며, 자문위원들은 생활 속 통일 실천 과제를 함께 발굴하기로 했다. 회의에 참석한 위원들은 청소년과 청년 세대를 대상으로 한 평화통일 교육의 중요성에도 공감하고, 지역 사회와 연계한 체험형 프로그램을 확대하자는 의견을 모았다. 구는 앞으로도 주민이 참여하는 평화통일 사업을 지속적으로 추진해 통일 기반을 다져 나가겠다고 강조했다.";

  it("bbs--view--cont 본문 + 중첩 div 안 잘림", () => {
    const html = `
      <div class="ui bbs--view--cont">
        <p>${LONG}</p>
        <div class="img"><img src="/a.jpg"/></div>
        <p>자세한 사항은 구청 홍보담당관으로 문의하면 된다.</p>
      </div>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("한반도 평화 관리"); // 이미지 div 앞
    expect(body).toContain("홍보담당관으로 문의"); // 뒤 (조기 잘림 X)
  });

  it("안전 분기 (view--cont 없음/닫는 div 없음/250 미만 → null)", () => {
    expect(parseDetailBody(`<div class="other">${LONG}</div>`)).toBeNull();
    expect(parseDetailBody(`<div class="ui bbs--view--cont"><p>${LONG}`)).toBeNull();
    expect(parseDetailBody(`<div class="ui bbs--view--cont"><p>짧은 본문</p></div>`)).toBeNull();
  });
});
