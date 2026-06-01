// ============================================================
// 광산구 보도자료 parser 단위 테스트 (2026-06-02)
// ============================================================
// 사이트 구조 변경(5/28~ list 0건 사고) 복구 후 회귀 방어.
//   list: <td class="subject"><a href="...boardId=REPORT_NEW&seq=N" data-view>제목</a></td>
//         + 같은 row <td>YYYY-MM-DD</td>
//   본문: <div class="boardContents ..."> div-depth

import { describe, it, expect } from "vitest";
import { parseListPage, parseDetailBody } from "@/lib/scraping/local-press/gwangsan";

describe("광산구 parseListPage (구조 변경 복구)", () => {
  it("seq/title(anchor 텍스트)/date 추출 + sourceUrl", () => {
    const html = `
      <tr>
        <td>11985</td>
        <td class="m_show subject"><span class="new">새글</span><a href="/boardView.do?pageId=www16&boardId=REPORT_NEW&seq=5059327&movePage=1" data-view="L" data-seq="5059327">“시대 변화 대응” 광산아카데미 운영</a></td>
        <td class="m_show">홍보실</td>
        <td>2026-06-01</td>
      </tr>
    `;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("5059327");
    expect(items[0].title).toBe("“시대 변화 대응” 광산아카데미 운영"); // 새글 span 은 anchor 밖
    expect(items[0].publishedDate).toBe("2026-06-01");
    expect(items[0].sourceUrl).toBe(
      "https://www.gwangsan.go.kr/boardView.do?boardId=REPORT_NEW&pageId=www16&seq=5059327",
    );
  });

  it("REPORT_NEW 아닌 다른 게시판 anchor 는 제외", () => {
    const html = `
      <a href="/boardView.do?pageId=www868&boardId=GUBO&seq=1114269" data-view="L">구보 글 제목입니다</a><td>2026-06-01</td>
      <a href="/boardView.do?pageId=www16&boardId=REPORT_NEW&seq=222" data-view="L">광산 보도자료 글</a><td>2026-06-01</td>
    `;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("222");
  });

  it("boardContents 본문 div-depth + 중첩 div 안 잘림", () => {
    const LONG = "광산구는 시대 변화에 대응해 주민을 위한 광산아카데미를 운영한다고 밝혔다. 인공지능부터 예술까지 분야별 전문가를 초청해 매월 다양한 강좌를 제공할 계획이다.";
    const html = `
      <div class="boardContents siiru-clr">
        <p>${LONG}</p>
        <div class="img"><img src="/a.jpg"/></div>
        <p>신청은 구청 누리집에서 가능하다.</p>
      </div>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("광산아카데미");
    expect(body).toContain("누리집에서 가능");
  });

  it("안전 분기 (boardContents 없음/닫는 div 없음/50 미만 → null)", () => {
    expect(parseDetailBody(`<div class="other">짧음</div>`)).toBeNull();
    expect(parseDetailBody(`<div class="boardContents"><p>짧은 글</p>`)).toBeNull();
  });
});
