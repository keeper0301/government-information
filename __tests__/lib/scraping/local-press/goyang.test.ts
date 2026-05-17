// ============================================================
// 고양특례시 parseListPage + parseDetailBody 단위 테스트 (G4)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/goyang";

describe("goyang parseListPage", () => {
  it("fnView onclick seq + title + 날짜 매핑", () => {
    const html = `
      <td class="subject text-left">
        <a href="#" onclick="fnView('1090','20260515150923086','/news', 'All');">고양시, 18일부터 고유가 피해지원금 2차 지급 시작</a>
      </td>
      <td class="date">2026.05.15</td>
      <td class="subject text-left">
        <a href="#" onclick="fnView('1090','20260515150513858','/news', 'All');">고양시, 2040 도시기본계획 수립</a>
      </td>
      <td class="date">2026.05.14</td>
    `;
    const items = parseListPage(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("20260515150923086");
    expect(items[0].title).toContain("고유가");
    expect(items[0].publishedDate).toBe("2026-05-15");
    expect(items[0].sourceUrl).toContain(
      "q_bbscttSn=20260515150923086",
    );
  });

  it("title 5자 미만 skip", () => {
    const html = `<a onclick="fnView('1090','20260515150923086','/news', 'All');">짧음</a>`;
    expect(parseListPage(html)).toEqual([]);
  });

  it("빈 HTML — 빈 배열", () => {
    expect(parseListPage("")).toEqual([]);
  });
});

describe("goyang parseDetailBody", () => {
  it("webView article-detail 안 본문 추출 + numeric entity 디코딩", () => {
    const html = `
      <div id="webView" class="article-detail">
        고양특례시는 고유가와 고물가로 인한 시민의 부담을 완화하기 위해 추진 중인 고유가 피해지원금 2차 지급을 오는 5월 18일부터 시작한다&#46;<br />
        시는 취약계층과 소득 하위 70&#37; 시민을 대상으로 총 920억 원 규모의 지원사업을 추진한다.
      </div>
      <div id="mobileView" class="article-detail">동일 본문 모바일</div>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("고유가 피해지원금");
    expect(body).toContain("시작한다."); // &#46; (.) 디코딩
    expect(body).toContain("70%"); // &#37; (%) 디코딩
  });

  it("mobileView fallback (webView 없을 때)", () => {
    const html = `
      <div id="mobileView" class="article-detail">고양시는 시민의 편의를 위해 모바일 전용 본문 한국어 콘텐츠를 충분히 길게 작성하여 50자 이상의 의미 있는 정보를 정확히 전달하고 있습니다. 이는 검색 엔진에도 노출됩니다.</div>
      <div class="other">다른</div>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("고양시");
    expect(body).toContain("모바일 전용 본문");
  });

  it("container 없음 — null", () => {
    expect(parseDetailBody(`<p>일반 단락 본문</p>`)).toBeNull();
  });

  it("50자 미만 — null", () => {
    const html = `<div id="webView" class="article-detail">짧음</div><div id="mobileView">x</div>`;
    expect(parseDetailBody(html)).toBeNull();
  });
});
