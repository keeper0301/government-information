// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseListPage as parseGyeongbuk, parseDetailBody as bodyGyeongbuk } from "@/lib/scraping/local-press/gyeongbuk";
import { parseListPage as parseChungnam, parseDetailBody as bodyChungnam } from "@/lib/scraping/local-press/chungnam";
describe("도청 게시판 구조 변경 복구", () => {
  it("경북 새 게시판의 글 번호와 각 행의 날짜를 읽는다", () => {
    const html = `<ul class="webzine_list"><li><a title="경북 공식 정책 발표" onclick="boardList.view('1370350');"><div class="classify">문화산업과 | 2026-10-05</div></a></li><li><a title="다음 공식 정책 발표" onclick="boardList.view('1370349');"><div class="classify">방역과 | 2026-10-04</div></a></li></ul><footer>2099-01-01</footer>`;
    const rows = parseGyeongbuk(html);
    expect(rows.map((row) => row.publishedDate)).toEqual(["2026-10-05", "2026-10-04"]);
    expect(rows[0].sourceUrl).toContain("boardNo=1370350");
    expect(rows[0].sourceUrl).toContain("importUrl=%2Fboard%2Fview.do");
  });
  it("충남 제목 속성 추가와 순서 변경에 영향받지 않는다", () => {
    const html = `<table><tr><td><a title="공식 발표" class="tit" href="/cnportal/cnapcPressList/cnapcPress/view.do?nttId=123&menuNo=500498">공식 지원 정책 발표</a></td><td>2026-10-05</td></tr><tr><td><a href="/cnportal/cnapcPressList/cnapcPress/view.do?nttId=124&menuNo=500498" title="공식 발표" class="tit">다음 공식 정책 발표</a></td><td>2026-10-04</td></tr></table>`;
    expect(parseChungnam(html).map((row) => row.publishedDate)).toEqual(["2026-10-05", "2026-10-04"]);
  });
  it("경북 본문에서 첨부와 다음 글을 제외한다", () => {
    const text = "주민을 위한 공식 지원 정책을 설명합니다. ".repeat(15);
    const body = bodyGyeongbuk(`<div class="board_view"><div class="text">${text}<script>실행문</script></div><nav>다음 글</nav></div>`);
    expect(body).toContain("공식 지원");
    expect(body).not.toContain("다음 글");
    expect(body).not.toContain("실행문");
  });
  it("충남 본문에서 첨부와 담당자 정보를 제외한다", () => {
    const text = "주민을 위한 공식 지원 정책을 설명합니다. ".repeat(15);
    const body = bodyChungnam(`<div class="board-view"><div class="board-view-li item02"><div class="board-view-inner">담당자 정보</div></div><div class="board-view-li"><div class="board-view-inner">첨부파일 목록</div></div><div class="board-view-li"><div class="board-view-inner">${text}</div></div></div>`);
    expect(body).toContain("공식 지원");
    expect(body).not.toContain("첨부파일");
    expect(body).not.toContain("담당자");
  });
});
