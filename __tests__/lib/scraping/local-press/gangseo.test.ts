// ============================================================
// 강서구 보도자료 parser 단위 테스트 (2026-06-01)
// ============================================================
// eDotXpress CMS. list = /gs040201/{id}?... 테이블, 본문 = view-content div.
// 검증:
//   - list: /gs040201/{id} (쿼리 필수) anchor 제목 + 같은 row 작성일(YYYY-MM-DD)
//   - 쿼리 없는 /gs040201, 다른 path(/gs041204) 메뉴 anchor 는 제외
//   - body: view-content div-depth 추출 (중첩 div 안 잘림), 안전 분기

import { describe, it, expect } from "vitest";
import { parseListPage, parseDetailBody } from "@/lib/scraping/local-press/gangseo";

describe("강서구 parseListPage (/gs040201/{id})", () => {
  it("seq/title/date 추출 + sourceUrl 정규화", () => {
    const html = `
      <tr>
        <td>4105</td>
        <td class='text-align is-left'>
          <a href="/gs040201/320849?srchCtgry=&srchStdg=&curPage=">"행성 중 가장 보기 힘든 수성, 6월에 맨눈으로 보세요" ...강서별빛우주과학관, 하지 맞이 천문 프로그램 풍성</a><!-- 신규게시물 -->
        </td>
        <td>홍보소통과</td><td>2026-05-28</td><td>33</td>
      </tr>
    `;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("320849");
    expect(items[0].title).toContain("수성");
    expect(items[0].title).toContain("강서별빛우주과학관"); // 부제까지 전체 제목
    expect(items[0].publishedDate).toBe("2026-05-28");
    expect(items[0].sourceUrl).toBe("https://www.gangseo.seoul.kr/gs040201/320849");
  });

  it("쿼리 없는 /gs040201, 다른 path 메뉴 anchor 는 제외", () => {
    const html = `
      <a href="/gs040201">보도자료 메뉴</a>
      <a href="/gs041204">60대 일자리</a>
      <a href="/gs040201/320848?srchKey=">강서구 정식 보도자료 글</a><td>2026-05-28</td>
    `;
    const items = parseListPage(html);
    expect(items).toHaveLength(1); // /gs040201/{id}? 만
    expect(items[0].seq).toBe("320848");
  });
});

describe("강서구 parseDetailBody (view-content div)", () => {
  const LONG =
    "서울 강서구는 6월 1일부터 관내 사업체를 대상으로 경제총조사를 실시한다고 밝혔다. 구는 조사 참여를 적극 당부했다.";

  it("view-content 본문 + 중첩 div(이미지 등) 안 잘림", () => {
    const html = `
      <div class="board-view-body">
        <div class="view-content">
          <p>${LONG}</p>
          <div class="img-wrap"><img src="/photo.jpg" alt="사진"/></div>
          <p>자세한 사항은 구청 누리집을 참고하시기 바랍니다.</p>
        </div>
      </div>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("경제총조사"); // 이미지 div 앞
    expect(body).toContain("누리집을 참고"); // 이미지 div 뒤 (조기 잘림 X)
  });

  it("view-content 없으면 null", () => {
    expect(parseDetailBody(`<div class="other"><p>${LONG}</p></div>`)).toBeNull();
  });

  it("본문 50자 미만 null", () => {
    expect(parseDetailBody(`<div class="view-content"><p>짧은 안내</p></div>`)).toBeNull();
  });

  it("닫는 div 없으면(응답 잘림) null — junk 방지", () => {
    expect(parseDetailBody(`<div class="view-content"><p>${LONG}`)).toBeNull();
  });
});
