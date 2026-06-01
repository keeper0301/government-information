// ============================================================
// 구로·동대문 SI 보도자료 list 파서 단위 테스트 (2026-06-01)
// ============================================================
// 본문은 공용 parseSiNttBody → si-ntt-helper.test.ts 커버. list 만 검증:
//   - 구로(bbsNo=665)·동대문(bbsNo=39) seq/title/date 추출
//   - bbsNo lookahead 종결자 (?:&|") 가 prefix 충돌(bbsNo=390·6650 등) 차단
//   - "새글" 배지 strip

import { describe, it, expect } from "vitest";
import { parseListPage as parseGuro } from "@/lib/scraping/local-press/guro";
import { parseListPage as parseDongdaemun } from "@/lib/scraping/local-press/dongdaemun";

describe("구로구 parseListPage (bbsNo=665)", () => {
  it("seq/title/date 추출 + 새글 strip", () => {
    const html = `
      <a href="./selectBbsNttView.do?key=1793&amp;bbsNo=665&amp;nttNo=500123&amp;pageIndex=1">구로구, 개봉3동 청소년카페 시범운영 시작 <span class="new">새글</span></a>
      <td>청소년과</td><td>2026.06.01</td>
    `;
    const items = parseGuro(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("500123");
    expect(items[0].title).toBe("구로구, 개봉3동 청소년카페 시범운영 시작");
    expect(items[0].publishedDate).toBe("2026-06-01");
    expect(items[0].sourceUrl).toBe(
      "https://www.guro.go.kr/www/selectBbsNttView.do?bbsNo=665&nttNo=500123&key=1793",
    );
  });

  it("bbsNo=6650 등 prefix 충돌 제외", () => {
    const html = `
      <a href="./selectBbsNttView.do?key=1793&amp;bbsNo=6650&amp;nttNo=111">다른 게시판 글</a><td>2026.06.01</td>
      <a href="./selectBbsNttView.do?key=1793&amp;bbsNo=665&amp;nttNo=222">구로 보도자료 글</a><td>2026.06.01</td>
    `;
    const items = parseGuro(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("222");
  });
});

describe("동대문구 parseListPage (bbsNo=39, 짧은 bbsNo)", () => {
  it("seq/title/date 추출 (anchor 길어 1600자 slice)", () => {
    // 동대문 anchor 는 href param 체인이 길어 작성일 td 가 멀리 옴.
    const longHref =
      "./selectBbsNttView.do?key=199&amp;bbsNo=39&amp;nttNo=480777&amp;searchCtgry=&amp;searchCnd=all&amp;searchKrwd=&amp;integrDeptCode=&amp;pageIndex=1";
    const gap = " ".repeat(400);
    const html = `
      <a href="${longHref}">동대문구, 중대재해 예방 민·관합동 집중안전점검</a>
      <td>안전재난과</td>${gap}<td>2026-05-27</td>
    `;
    const items = parseDongdaemun(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("480777");
    expect(items[0].publishedDate).toBe("2026-05-27");
  });

  it("bbsNo=390·391 등 prefix 충돌 제외 (종결자 가드 — 짧은 bbsNo 핵심)", () => {
    const html = `
      <a href="./selectBbsNttView.do?key=199&amp;bbsNo=390&amp;nttNo=111">다른 게시판 글 제목</a><td>2026-05-27</td>
      <a href="./selectBbsNttView.do?key=199&amp;bbsNo=391&amp;nttNo=112">또 다른 게시판 글</a><td>2026-05-27</td>
      <a href="./selectBbsNttView.do?key=199&amp;bbsNo=39&amp;nttNo=222">동대문 보도자료 글</a><td>2026-05-27</td>
    `;
    const items = parseDongdaemun(html);
    expect(items).toHaveLength(1); // bbsNo=39 만, 390·391 제외
    expect(items[0].seq).toBe("222");
  });
});
