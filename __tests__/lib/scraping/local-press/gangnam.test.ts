// ============================================================
// 강남구 parseListPage + parseDetailBody 단위 테스트
// ============================================================
// 2026-06-01 cron 검증서 발견: 사이트가 한컴 웹에디터(JS 렌더)로 개편되어
// hwp_editor_board_content 컨테이너가 정적 HTML 에선 빈 div → 본문 0자 → 전 글
// silent skip(9일 0건). 본문은 hidden input#content_main_text value 로 이전됨.

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/gangnam";

describe("gangnam parseListPage", () => {
  it("seq + title + 날짜 매핑", () => {
    const html = `
      <a href="/board/B_000031/1075139/view.do?mid=ID01_031">강남구, AI가 민원창구·버스정류장·복지현장 바꾼다</a>
      <td>2026-06-01</td>
    `;
    const items = parseListPage(html);
    expect(items.length).toBe(1);
    expect(items[0].seq).toBe("1075139");
    expect(items[0].title).toContain("민원창구");
    expect(items[0].publishedDate).toBe("2026-06-01");
    expect(items[0].sourceUrl).toContain("/board/B_000031/1075139/view.do");
  });

  it("같은 seq 중복 link 단일화", () => {
    const html = `
      <a href="/board/B_000031/1075139/view.do?mid=ID01_031">강남구 첫 link 제목</a>
      <a href="/board/B_000031/1075139/view.do?mid=ID01_031">강남구 두번째 link</a>
    `;
    expect(parseListPage(html).length).toBe(1);
  });
});

describe("gangnam parseDetailBody (content_main_text)", () => {
  it("hidden input#content_main_text value 에서 본문 추출", () => {
    const html = `
      <div class="hwp_editor_board_content" data-hjsonver="1.0" data-jsonlen="22354" id="hwpEditorBoardContent"></div>
      <input type="hidden" id="content_main_text" value="강남구가 6월부터 구청 민원창구와 복지현장에 인공지능 기술을 도입해 생활밀착형 행정을 구현한다고 29일 밝혔다." />
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("강남구");
    expect(body).toContain("인공지능 기술을 도입");
  });

  it("value 가 id 앞에 오는 마크업 순서도 추출 (m[2] OR 경로)", () => {
    const html = `<input type="hidden" value="강남구가 인공지능 행정을 도입해 생활밀착형 서비스를 구현한다고 밝혔다. 주민 편의가 크게 향상될 전망이다." id="content_main_text" />`;
    const body = parseDetailBody(html);
    expect(body).toContain("인공지능 행정");
  });

  it("value 안 &quot; HTML entity 디코딩", () => {
    const html = `<input id="content_main_text" value="구청장은 &quot;지속가능한 미래도시 강남을 만들겠다&quot;고 밝혔다. 일상 가까이에서 책과 문화를 누릴 수 있도록 노력한다." />`;
    const body = parseDetailBody(html);
    expect(body).toContain('"지속가능한 미래도시 강남을 만들겠다"');
  });

  it("content_main_text 없음(빈 hwp 컨테이너만) — null (과거 버그 회귀 방어)", () => {
    const html = `<div class="hwp_editor_board_content" data-jsonlen="22354" id="hwpEditorBoardContent"></div>`;
    expect(parseDetailBody(html)).toBeNull();
  });

  it("50자 미만 — null", () => {
    expect(parseDetailBody(`<input id="content_main_text" value="짧음" />`)).toBeNull();
  });
});
