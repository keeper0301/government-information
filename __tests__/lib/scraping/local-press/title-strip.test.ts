// ============================================================
// busan·mokpo·gwangyang 제목 junk 제거 회귀 테스트 (2026-06-03)
// ============================================================
// 제목 파서가 anchor inner 통째(메타·본문·배지)를 잡던 버그 fix.
// busan: div.bTitle 만 + entity 디코딩. mokpo: title_box h3 + "새로운글" 제거.
// gwangyang: 앞 "새글" 배지 제거.

import { describe, it, expect } from "vitest";
import { parseListPage as busanList } from "@/lib/scraping/local-press/busan";
import { parseListPage as mokpoList } from "@/lib/scraping/local-press/mokpo";
import { parseListPage as gwangyangList } from "@/lib/scraping/local-press/gwangyang";

describe("busan 제목 — div.bTitle 만 + entity 디코딩", () => {
  it("썸네일 alt(본문)·부서·작성자·전화·날짜·◈본문 미혼입", () => {
    const html = `
      <a href="/nbtnewsBU/1732593?curPage=">
        <div class="tgImg"><img alt="◈ 본문 요약이 alt 에 들어있다 ..." /></div>
        <div class="tgCont"><div class="bTitle">부산시, &quot;글로벌 가교&quot; 빛났다… 양자 경진대회 우승</div>
        <div class="writer">도시정비과 | 조대원 | 051-888-4224 | 2026-06-01</div></div>
      </a>
      <span>2026-06-01</span>`;
    const items = busanList(html);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('부산시, "글로벌 가교" 빛났다… 양자 경진대회 우승');
    expect(items[0].title).not.toContain("도시정비과");
    expect(items[0].title).not.toContain("051-");
    expect(items[0].title).not.toContain("◈");
    expect(items[0].title).not.toContain("&quot;");
  });
});

describe("mokpo 제목 — title_box h3 + 새로운글 제거", () => {
  it("본문·작성자·새로운글 배지 미혼입", () => {
    const html = `
      <a href="/www/mokpo_news/press_release/report_material?idx=12345&mode=view">
        <div class="thumb_box"><img alt="" /></div>
        <div class="cont_box">
          <div class="title_box"><h3>목포시, 감성돔 치어 14만 2천 마리 방류<span class="icon_box"><span class="icon_new">새로운글</span></span></h3></div>
          <p>- 압해대교 인근 방류… 목포시는 1일 감성돔 치어를 방류했다. 작성자 : 수산산업과 조회수 35</p>
        </div>
      </a>
      <span>2026.06.02</span>`;
    const items = mokpoList(html);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("목포시, 감성돔 치어 14만 2천 마리 방류");
    expect(items[0].title).not.toContain("새로운글");
    expect(items[0].title).not.toContain("작성자");
    expect(items[0].title).not.toContain("압해대교");
  });
});

describe("gwangyang 제목 — 앞 '새글' 배지 제거", () => {
  it("'새글' 접두사 제거", () => {
    const html = `
      <a href="/board.es?mid=a11007000000&bid=0057&act=view&list_no=9999"><span class="new">새글</span> 광양시, 남파랑길 팸투어 성료… 관광도시 매력 알려</a>
      <span>2026.06.02</span>`;
    const items = gwangyangList(html);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("광양시, 남파랑길 팸투어 성료… 관광도시 매력 알려");
    expect(items[0].title.startsWith("새글")).toBe(false);
  });
});
