import { expect, it } from "vitest";
import { parseListPage } from "@/lib/scraping/local-press/seogwipo";
it("서귀포 데스크톱과 모바일 게시판 행을 모두 읽는다", () => {
  const item = '<p class="title"><a href="/news/seogwiponews/sijungnews.htm?act=view&seq=12">지역 안내 보도자료</a></p><p class="date">담당부서 | 2026-10-02</p>';
  for (const html of [`<ul><li>${item}</li></ul>`, `<div class="blog-board-list"><div class="list">${item}</div></div>`]) {
    expect(parseListPage(html)).toHaveLength(1);
    expect(parseListPage(html)[0].publishedDate).toBe("2026-10-02");
  }
});
