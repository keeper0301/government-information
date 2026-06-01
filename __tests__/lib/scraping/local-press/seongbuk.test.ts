// ============================================================
// 성북구 SI 보도자료 list 파서 단위 테스트 (2026-06-01)
// ============================================================
// 본문은 공용 parseSiNttBody → si-ntt-helper.test.ts 커버. list 만 검증:
//   - bbsNo=46 seq/title/date 추출
//   - lookahead 종결자 (?:&|") 가 bbsNo=460·461 prefix 충돌 차단 (짧은 bbsNo)
//   - "새글" 배지 strip

import { describe, it, expect } from "vitest";
import { parseListPage } from "@/lib/scraping/local-press/seongbuk";

describe("성북구 parseListPage (bbsNo=46)", () => {
  it("seq/title/date 추출 + 새글 strip", () => {
    const html = `
      <a href="./selectBbsNttView.do?key=6356&amp;bbsNo=46&amp;nttNo=700111&amp;pageIndex=1">성북구, 기후위기 재난대응 강화사업 본격 운영 <span class="new">새글</span></a>
      <td>환경과</td><td>2026-05-29</td>
    `;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("700111");
    expect(items[0].title).toBe("성북구, 기후위기 재난대응 강화사업 본격 운영");
    expect(items[0].publishedDate).toBe("2026-05-29");
    expect(items[0].sourceUrl).toBe(
      "https://www.sb.go.kr/www/selectBbsNttView.do?bbsNo=46&nttNo=700111&key=6356",
    );
  });

  it("bbsNo=460·461 등 prefix 충돌 제외 (짧은 bbsNo 종결자 가드)", () => {
    const html = `
      <a href="./selectBbsNttView.do?key=6356&amp;bbsNo=460&amp;nttNo=111">다른 게시판 글 제목</a><td>2026-05-29</td>
      <a href="./selectBbsNttView.do?key=6356&amp;bbsNo=46&amp;nttNo=222">성북 보도자료 글 제목</a><td>2026-05-29</td>
    `;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("222");
  });
});
