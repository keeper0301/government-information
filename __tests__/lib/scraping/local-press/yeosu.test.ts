// ============================================================
// 여수시 parseListPage — "새로운글" 배지 cut 회귀 (2026-06-03)
// ============================================================
// list anchor inner 에 제목 + "새로운글" 배지(span)가 붙는데, 기존 `새로운글$`
// 정규식은 <tag> 제거·\s+→" " 후 끝 공백이 남아 $ 미매칭(trim 이 cut 뒤라 무효)
// 이었음. `\s*새로운글\s*$` 로 앞뒤 공백 허용해 실제 제거. 끝 공백 재현 포함.

import { describe, it, expect } from "vitest";
import { parseListPage } from "@/lib/scraping/local-press/yeosu";

describe("yeosu parseListPage — 새로운글 배지 제거", () => {
  it("배지 span(+끝 공백/줄바꿈)이 있어도 제목만 추출", () => {
    const html =
      `<a href="/www/govt/news/release/view?idx=12345">` +
      `여수시, 친환경 나눔 장터 개최 <span class="badge_new">새로운글</span>\n` +
      `</a> <span class="date">2026-06-02</span>`;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("여수시, 친환경 나눔 장터 개최");
    expect(items[0].title).not.toContain("새로운글");
    expect(items[0].publishedDate).toBe("2026-06-02");
  });

  it("배지 없는 일반 제목은 그대로", () => {
    const html =
      `<a href="/www/govt/news/release/view?idx=12340">` +
      `여수시립합창단, 제88회 정기연주회 개최</a> 2026-06-01`;
    const items = parseListPage(html);
    expect(items[0].title).toBe("여수시립합창단, 제88회 정기연주회 개최");
  });
});
