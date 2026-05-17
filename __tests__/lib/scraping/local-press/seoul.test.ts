// ============================================================
// seoul.ts parseListPage + parseDetailBody 단위 테스트 (G4)
// ============================================================

import { describe, it, expect } from "vitest";
import { parseListPage, parseDetailBody } from "@/lib/scraping/local-press/seoul";

describe("parseListPage", () => {
  it("타이틀·seq·날짜 매핑 정상", () => {
    const html = `
      <table>
        <tr>
          <td class="data-num hide-mobile-table">45418</td>
          <td class="data-title aLeft"><a href="/press/36098750">제8차 도시건축 공동위원회 개최</a></td>
          <td class="data-dept">도시공간본부도시관리과</td>
          <td class="data-date">2026-05-14</td>
        </tr>
        <tr>
          <td class="data-num hide-mobile-table">45417</td>
          <td class="data-title aLeft"><a href="/press/36098830">제4차 도시재정비위원회 개최결과</a></td>
          <td class="data-dept">주택실재정비촉진과</td>
          <td class="data-date">2026-05-13</td>
        </tr>
      </table>
    `;
    const items = parseListPage(html);
    expect(items.length).toBe(2);
    expect(items[0]).toEqual({
      seq: 36098750,
      title: "제8차 도시건축 공동위원회 개최",
      publishedDate: "2026-05-14",
      sourceUrl: "https://opengov.seoul.go.kr/press/36098750",
      body: null,
    });
    expect(items[1].seq).toBe(36098830);
    expect(items[1].publishedDate).toBe("2026-05-13");
  });

  it("빈 HTML — 빈 배열", () => {
    expect(parseListPage("")).toEqual([]);
  });

  it("title 없는 row skip", () => {
    const html = `
      <td class="data-title aLeft"><a href="/press/123"></a></td>
      <td class="data-date">2026-05-14</td>
    `;
    expect(parseListPage(html)).toEqual([]);
  });
});

describe("parseDetailBody", () => {
  it("<p> 한국어 본문 추출", () => {
    const html = `
      <div class="view-content view-content-article">
        <p>○ 학습역량과 학습태도 역시 서울런 활용도가 높은 집단에서 각각 84점, 86점으로 나타났다.</p>
        <p>○ 또 예체능 진학 희망자를 위한 대학연계 특화 프로그램과 소통 전문가 강연을 운영한다.</p>
      </div>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("서울런");
    expect(body).toContain("대학연계");
  });

  it("HTML entity 디코딩", () => {
    const html = `<p>한국어 본문 &nbsp;&quot;테스트&quot; &amp;시작합니다 — 충분히 긴 본문</p>`;
    const body = parseDetailBody(html);
    expect(body).toContain('"테스트"');
    expect(body).toContain("&시작");
  });

  it("iframe PDF 공문 — 본문 추출 빈 결과 null", () => {
    const html = `
      <iframe id="pdf" src="/blank.php"></iframe>
      <p>element-invisible 안내</p>
    `;
    expect(parseDetailBody(html)).toBeNull();
  });

  it("한국어 1자 없는 <p> 제외 (영어/숫자만)", () => {
    const html = `<p>2026-05-14 EVENT_CODE_12345 ABCD efgh ijkl</p>`;
    expect(parseDetailBody(html)).toBeNull();
  });

  it("5K 자 초과 본문 — 5K 잘림", () => {
    const longText = "한" + "가나다라마바사아자차카타파하".repeat(500); // ~6500자
    const html = `<p>${longText}</p>`;
    const body = parseDetailBody(html);
    expect(body!.length).toBeLessThanOrEqual(5000);
  });
});
