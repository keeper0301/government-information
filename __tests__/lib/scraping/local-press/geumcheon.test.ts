// ============================================================
// 금천구 보도자료 list 파서 단위 테스트 (2026-06-01)
// ============================================================
// SI selectBbsNttList. 본문은 공용 parseSiNttBody → si-ntt-helper.test.ts 커버.
// list 검증 핵심:
//   - bbsNo=8 lookahead 종결자 `(?:&|")` 가 bbsNo=80·800 등 prefix 충돌 차단
//     (짧은 bbsNo 특유 위험 — 다른 게시판 사이드 링크 오매칭 방지)
//   - "새글" 한글 배지 strip (\b 미적용, $ 앵커)
//   - href param 체인 길어도 {0,900} window 로 추출
//   - 작성일 td 날짜 추출

import { describe, it, expect } from "vitest";
import { parseListPage } from "@/lib/scraping/local-press/geumcheon";

describe("금천구 parseListPage (bbsNo=8)", () => {
  it("seq/title/date 추출 + '새글' 배지 strip", () => {
    const html = `
      <a href="./selectBbsNttView.do?key=297&amp;bbsNo=8&amp;nttNo=269403&amp;pageIndex=1">
        “금천 9경 구경하며 도장 찍고 기념품 받자” <span class="p-icon p-icon__new">새글</span>
      </a>
      <td>관광과</td><td>2026.06.01</td>
    `;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("269403");
    expect(items[0].title).toBe("“금천 9경 구경하며 도장 찍고 기념품 받자”"); // 새글 제거
    expect(items[0].publishedDate).toBe("2026-06-01");
    expect(items[0].sourceUrl).toBe(
      "https://www.geumcheon.go.kr/portal/selectBbsNttView.do?bbsNo=8&nttNo=269403&key=297",
    );
  });

  it("bbsNo=80 등 prefix 충돌 anchor 는 제외 (짧은 bbsNo 종결자 가드)", () => {
    const html = `
      <a href="./selectBbsNttView.do?key=297&amp;bbsNo=80&amp;nttNo=111">금천소식 다른 게시판 글 제목</a><td>2026.06.01</td>
      <a href="./selectBbsNttView.do?key=297&amp;bbsNo=8&amp;nttNo=222">금천 보도자료 정식 글 제목</a><td>2026.06.01</td>
    `;
    const items = parseListPage(html);
    expect(items).toHaveLength(1); // bbsNo=80 제외, bbsNo=8 만
    expect(items[0].seq).toBe("222");
  });

  it("href param 체인 길어 </a> 가 500자 밖이어도 {0,900} 로 추출", () => {
    const longHref =
      "./selectBbsNttView.do?key=297&amp;id=&amp;bbsNo=8&amp;nttNo=269400&amp;searchCtgry=&amp;searchCnd=all&amp;searchKrwd=&amp;pageIndex=1&amp;integrDeptCode=&amp;searchDeptCode=";
    const pad = " ".repeat(520); // 500 초과 → 구 {0,500} 이면 0건 (회귀 가드)
    const html = `
      <a href="${longHref}">금천구, 폭염 잡는 도심 물길 연다${pad}</a>
      <td>2026.06.01</td>
    `;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("269400");
    expect(items[0].title).toBe("금천구, 폭염 잡는 도심 물길 연다");
  });
});
