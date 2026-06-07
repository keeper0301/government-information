// ============================================================
// 양천구 parseListPage + parseDetailBody 단위 테스트
// ============================================================
// 2026-06-02 — 본문 종결 마커(view-nuri)가 사이트에 없어 수집 0 → view_contents
// div 깊이 추적으로 복구. 종결 마커 의존 제거 회귀 방어.

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/yangcheon";

const LONG =
  "양천구는 음악분수와 물놀이터 등 도심 속 여름 피서지 18개소를 본격 운영한다고 밝혔다. " +
  "5월부터 분수 가동을 시작했으며 주민 누구나 무료로 이용할 수 있다. 자세한 운영 시간과 " +
  "장소는 구청 누리집에서 확인할 수 있으며 무더위에 지친 구민에게 시원한 휴식처가 되길 바란다.";

describe("yangcheon parseDetailBody", () => {
  it("view_contents div 깊이 추적 — 종결 마커 없어도 추출", () => {
    const html = `<div class="view_contents"><p>${LONG}</p></div><div class="board-foot-container"></div>`;
    const body = parseDetailBody(html);
    expect(body).toContain("음악분수");
    expect(body).toContain("휴식처가 되길"); // 끝까지
  });

  it("중첩 div(이미지)를 지나 본문 끝까지 캡처", () => {
    const html = `<div class="view_contents"><p>${LONG}</p><div class="img"><img src="/a.jpg"/></div><p>추가 안내 문단입니다.</p></div>`;
    const body = parseDetailBody(html);
    expect(body).toContain("음악분수");
    expect(body).toContain("추가 안내");
  });

  it("view_contents 없으면 null", () => {
    expect(parseDetailBody(`<div class="other"><p>${LONG}</p></div>`)).toBeNull();
  });

  it("닫는 div 없으면 null(junk 방지)", () => {
    expect(parseDetailBody(`<div class="view_contents"><p>${LONG}</p>`)).toBeNull();
  });

  it("view_contents_wrap 유사 class 는 오매칭 안 함", () => {
    expect(
      parseDetailBody(`<div class="view_contents_wrap"><p>${LONG}</p></div>`),
    ).toBeNull();
  });
});

describe("yangcheon parseListPage — wdigm_title 제목 추출", () => {
  // 2026-06-07 — a 태그 title 속성은 "NNNN번글2"(게시판 내부 라벨) junk. 진짜 제목은
  // a 안 <script>wdigm_title('제목')</script> JS 인자에 있다. title 속성이 아닌 wdigm_title
  // 에서 추출(본문은 정상인데 제목만 "6390번글2"로 깨지던 사고 회귀 방어).
  it("title 속성 junk('번글2') 가 아니라 wdigm_title 인자에서 진짜 제목 추출", () => {
    const html = `
      <a href="#view" onclick="doBbsFView('290','310780','16010100','310780');return false;" title="6390번글2">
        <script>document.write(wdigm_title('양천구, 도심 속 여름 피서지 18개소 본격 운영'));</script>
      </a>
      <td class="wdate">2026.06.01</td>
    `;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("310780");
    expect(items[0].title).toContain("여름 피서지");
    expect(items[0].title).not.toMatch(/번글/);
    expect(items[0].publishedDate).toBe("2026-06-01");
    expect(items[0].sourceUrl).toContain("bcIdx=310780");
  });

  it("wdigm_title 없는 행은 매치 안 됨(한글 제목 게이트)", () => {
    const html = `<a href="#view" onclick="doBbsFView('290','999','x','999');return false;" title="1번글2"></a>`;
    expect(parseListPage(html)).toHaveLength(0);
  });
});
