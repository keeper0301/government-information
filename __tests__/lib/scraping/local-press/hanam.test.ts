// ============================================================
// 하남시 parseListPage + parseDetailBody 단위 테스트
// ============================================================
// 2026-06-02 — 본문 컨테이너 안 <script>(fn_deleteBbsNtt 등) 블록 미제거로 JS 코드가
// 본문 머리에 섞이던 버그 fix. script 제거 회귀 방어.

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/hanam";

const BODY =
  "하남시는 지방선거를 앞두고 관내 투표소를 대상으로 현장 점검을 실시했다고 밝혔다. " +
  "이번 점검은 유권자가 안전하고 편리하게 투표할 수 있도록 시설과 동선을 사전에 확인하기 " +
  "위해 마련됐으며 장애인·고령자 편의 시설도 함께 살폈다. 시 관계자는 공정하고 안전한 " +
  "선거 환경을 만들기 위해 끝까지 최선을 다하겠다고 강조했다.";

describe("hanam parseDetailBody", () => {
  it("본문 컨테이너 안 <script>(JS 코드) 제거", () => {
    const html = `
      <div class="bbs_wrap">
        <script>function fn_deleteBbsNtt( url ) { if( confirm("삭제하시겠습니까?") ){ location.href = url; } }</script>
        <p>${BODY}</p>
      </div>
      <div class="p-table__bottom"><a>목록</a></div>`;
    const body = parseDetailBody(html);
    expect(body).toContain("투표소를 대상으로");
    expect(body).not.toContain("function");
    expect(body).not.toContain("fn_deleteBbsNtt");
    expect(body).not.toContain("confirm");
  });

  it("본문 컨테이너 없으면 null", () => {
    expect(parseDetailBody(`<div class="other"><p>${BODY}</p></div>`)).toBeNull();
  });
});

describe("hanam parseListPage", () => {
  it("selectBbsNttView nttNo + 제목 + 날짜 매핑", () => {
    const html = `
      <a href="/sosik/selectBbsNttView.do?bbsNo=1164&nttNo=98765&key=10048">하남시, 투표소 현장 점검 실시</a>
      <span>2026.06.02</span>
    `;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("98765");
    expect(items[0].title).toContain("투표소 현장 점검");
    expect(items[0].publishedDate).toBe("2026-06-02");
    expect(items[0].sourceUrl).toContain("nttNo=98765");
  });
});
