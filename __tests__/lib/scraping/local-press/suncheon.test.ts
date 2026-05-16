// ============================================================
// 순천시청 보도자료 parser 단위 테스트
// ============================================================
// 실제 HTML fetch 안 함 — sample HTML 으로 parse logic 만 검증.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/suncheon";

// 실제 HTML 의 정상 패턴 — sample 4건
const SAMPLE_LIST_HTML = `
<table>
  <tbody>
    <tr>
      <td>1</td>
      <td class="title_minwon lefttd"><a href="?mode=view&amp;seq=71153" >순천시 승주읍, 주택 화재 피해 주민에 성금 전달</a></td>
      <td class="writer">승주읍</td>
    </tr>
    <tr>
      <td>2</td>
      <td class="title_minwon lefttd"><a href="?mode=view&amp;seq=71150" >"순천에서의 달콤한 하룻밤"… 순천시, 최대 12만 원 숙박 할인 쏜다</a></td>
      <td class="writer">관광과</td>
    </tr>
    <tr>
      <td>3</td>
      <td class="title_minwon lefttd"><a href="?mode=view&amp;seq=71145" >순천시, 「2026년 지역사회건강조사」 실시</a></td>
      <td class="writer">건강증진과</td>
    </tr>
    <tr>
      <td>4</td>
      <td class="title_minwon lefttd"><a href="?mode=view&amp;seq=71143" >순천시, 시청사 전 직원 대상 소방훈련 실시</a></td>
      <td class="writer">회계과</td>
    </tr>
  </tbody>
</table>
`;

describe("parseListPage", () => {
  it("정상 HTML 4건 모두 parse", () => {
    const items = parseListPage(SAMPLE_LIST_HTML);
    expect(items).toHaveLength(4);
  });

  it("첫 번째 item 의 seq·title·writer·sourceUrl 정확", () => {
    const items = parseListPage(SAMPLE_LIST_HTML);
    expect(items[0]).toEqual({
      seq: 71153,
      title: "순천시 승주읍, 주택 화재 피해 주민에 성금 전달",
      writer: "승주읍",
      sourceUrl: "http://www.suncheon.go.kr/kr/news/0006/0001/?mode=view&seq=71153",
      body: null,
    });
  });

  it("HTML entity &amp; 정상 처리 (href 안)", () => {
    const items = parseListPage(SAMPLE_LIST_HTML);
    expect(items[0].sourceUrl).toContain("&seq=");
    expect(items[0].sourceUrl).not.toContain("&amp;");
  });

  it("빈 HTML → 빈 배열", () => {
    expect(parseListPage("")).toEqual([]);
  });

  it("관련 없는 HTML → 빈 배열", () => {
    expect(parseListPage("<html><body>test</body></html>")).toEqual([]);
  });
});

describe("parseDetailBody", () => {
  it("정상 본문 추출 + <br> 줄바꿈", () => {
    const html = `
      <div class="contentStyle">
        <div class="content">- 일상 회복 -<br><br>지역사회가 하나로 뭉쳤다.<br></div>
      </div>
    `;
    const body = parseDetailBody(html);
    expect(body).toBeTruthy();
    expect(body).toContain("일상 회복");
    expect(body).toContain("지역사회가");
  });

  it("HTML entity 변환 (&nbsp; · &amp;)", () => {
    const html = `<div class="content">A&nbsp;B&amp;C</div>`;
    expect(parseDetailBody(html)).toBe("A B&C");
  });

  it("본문 없음 → null", () => {
    expect(parseDetailBody("<html></html>")).toBeNull();
  });

  it("빈 본문 → null", () => {
    expect(parseDetailBody(`<div class="content"></div>`)).toBeNull();
  });
});
