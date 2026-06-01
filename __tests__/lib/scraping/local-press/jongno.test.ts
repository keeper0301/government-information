// ============================================================
// 종로구 보도자료 parser 단위 테스트 (2026-06-01)
// ============================================================
// eGovFrame selectBoardList. list = viewMove(nttId), 본문 = view_type01 td.output.
// 검증:
//   - list: viewMove('nttId') anchor 제목 + date1 td(YYYY년MM월DD일) 정확 추출
//   - 날짜는 date1 td 에서만 — 제목 안 "(M. D.)" 같은 다른 날짜 표기에 오염되지 않음
//   - body: view_type01 이후 td.output, "내용" 라벨 strip, 중첩 table td-depth 안 잘림
//   - 안전 분기(view_type01 없음/닫는 td 없음/50자 미만 → null)

import { describe, it, expect } from "vitest";
import { parseListPage, parseDetailBody } from "@/lib/scraping/local-press/jongno";

describe("종로구 parseListPage (viewMove)", () => {
  it("seq/title/date(date1 td) 추출 + sourceUrl", () => {
    const html = `
      <tr>
        <td class="output num">3786</td>
        <td class="output tal sj"><a href="javascript:viewMove('250550');">(6. 1.)“북촌 주민 정주권 지킨다”… 종로구, 북촌 지구단위계획 정비 추진</a></td>
        <td class="output file"></td>
        <td class="output date1">2026년06월01일</td>
      </tr>
    `;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("250550");
    expect(items[0].title).toContain("북촌 주민 정주권");
    expect(items[0].publishedDate).toBe("2026-06-01");
    expect(items[0].sourceUrl).toBe(
      "https://www.jongno.go.kr/portal/bbs/selectBoardArticle.do?bbsId=BBSMSTR_000000001618&menuId=388338&menuNo=388338&nttId=250550",
    );
  });

  it("날짜는 date1 td 에서만 — 제목 속 (5. 29.) 행사일에 오염 안 됨", () => {
    // 제목엔 (5. 29.) 이지만 실제 작성일(date1)은 6월 1일 (일괄 게시).
    const html = `
      <tr>
        <td class="output tal sj"><a href="javascript:viewMove('250549');">(5. 29.)종로구, IoT·AI 활용 공기질 관리</a></td>
        <td class="output date1">2026년06월01일</td>
      </tr>
    `;
    const items = parseListPage(html);
    expect(items[0].publishedDate).toBe("2026-06-01"); // 5-29 아님
  });
});

describe("종로구 parseDetailBody (view_type01 td.output)", () => {
  const LONG =
    "종로구가 북촌 내 급증하는 한옥체험업으로 인한 주민 불편을 줄이고 정주환경을 보호하기 위해 북촌 지구단위계획 정비를 추진한다고 밝혔다.";

  it("view_type01 td.output 본문 + '내용' 라벨 strip + 중첩 table 안 잘림", () => {
    const html = `
      <div class="board_view">
        <table class="view_type01"><caption>상세보기</caption><tbody>
          <tr><th>제목</th></tr>
          <tr><th>등록일</th></tr>
          <tr><td class="output">
            <em class="blind">내용</em>
            <p>${LONG}</p>
            <table><tbody><tr><td>구분</td><td>일정</td></tr></tbody></table>
            <p>자세한 사항은 구청 누리집을 참고하시기 바랍니다.</p>
          </td></tr>
        </tbody></table>
      </div>
    `;
    const body = parseDetailBody(html);
    expect(body).not.toMatch(/^내용/); // 라벨 제거됨
    expect(body).toContain("북촌 지구단위계획"); // 표 앞
    expect(body).toContain("누리집을 참고"); // 표 뒤 (조기 잘림 X)
  });

  it("view_type01 없으면 null", () => {
    expect(parseDetailBody(`<td class="output">내용 ${LONG}</td>`)).toBeNull();
  });

  it("닫는 td 없으면(응답 잘림) null", () => {
    expect(
      parseDetailBody(`<table class="view_type01"><td class="output">내용 ${LONG}`),
    ).toBeNull();
  });

  it("본문 50자 미만 null", () => {
    expect(
      parseDetailBody(
        `<table class="view_type01"><tr><td class="output">내용 짧음</td></tr></table>`,
      ),
    ).toBeNull();
  });
});
