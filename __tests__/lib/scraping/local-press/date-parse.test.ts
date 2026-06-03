// ============================================================
// 날짜 파서 회귀 테스트 (2026-06-03) — published_at fallback(now) 버그 fix
// ============================================================
// suncheon: td.created 날짜 신규 파싱(이전 now 하드코딩).
// gyeongbuk: "26-06-02"(2자리 연도) + 같은 줄 전화번호("054-880-6322") 오매칭 방지.

import { describe, it, expect } from "vitest";
import { parseListPage as gyeongbukList } from "@/lib/scraping/local-press/gyeongbuk";
import { parseListPage as suncheonList } from "@/lib/scraping/local-press/suncheon";

describe("gyeongbuk 날짜 — 2자리 연도 + 전화번호 오매칭 방지", () => {
  it("'26-06-02'(2자리)를 2026-06-02 로, 전화번호는 무시", () => {
    const html = `
      <a href="./page.do?BD_CODE=bbs_bodo&amp;B_NUM=508140&amp;V_NUM=1" title="경북소방, 폭염 온열질환 대응 강화">제목</a>
      <img alt="썸네일" />
      소방본부 구조구급과 ｜ 054-880-6322 ｜ 26-06-02
      경상북도 소방본부는 여름철 폭염에 대비해 대응 체계를 강화한다.`;
    const items = gyeongbukList(html);
    expect(items).toHaveLength(1);
    // 전화번호("054-880-6322")는 month/day 2자리 패턴에 안 걸림 → 26-06-02 채택(2026 접두)
    expect(items[0].publishedDate).toBe("2026-06-02");
  });
});

describe("suncheon 날짜 — td.created 파싱", () => {
  it("td.created 발행일 추출", () => {
    const html = `<tr>
      <td class="title_minwon lefttd"><a href="?mode=view&seq=12345">순천신협, 위기가구 지원 캠페인</a></td>
      <td class="writer">왕조1동</td>
      <td class="created">2026-06-02</td>
      <td class="hit end">15</td>
    </tr>`;
    const items = suncheonList(html);
    expect(items).toHaveLength(1);
    expect(items[0].publishedDate).toBe("2026-06-02");
    expect(items[0].title).toContain("순천신협");
  });
});
