// ============================================================
// 인천 parseListPage + parseDetailBody 단위 테스트 (G4)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/incheon";

describe("incheon parseListPage", () => {
  it("repSeq + subject + 제공일자 매핑", () => {
    const html = `
      <li>
        <a href="/IC010205/view?repSeq=DOM_0000000014711405&curPage=1">
          <div class="txt-area">
            <strong class="subject">인천형 주거정책 천원주택 매입임대 예비 입주자 모집 마감</strong>
            <dt>제공일자</dt>
            <dd>2026-05-17</dd>
          </div>
        </a>
      </li>
      <li>
        <a href="/IC010205/view?repSeq=DOM_0000000014711404&curPage=1">
          <div class="txt-area">
            <strong class="subject">인천시 바이오헬스밸리 추진협의회</strong>
            <dt>제공일자</dt>
            <dd>2026-05-16</dd>
          </div>
        </a>
      </li>
    `;
    const items = parseListPage(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("DOM_0000000014711405");
    expect(items[0].title).toContain("천원주택");
    expect(items[0].publishedDate).toBe("2026-05-17");
    expect(items[0].sourceUrl).toContain(
      "repSeq=DOM_0000000014711405",
    );
  });

  it("빈 HTML — 빈 배열", () => {
    expect(parseListPage("")).toEqual([]);
  });

  it("subject 없는 row skip", () => {
    const html = `<a href="/IC010205/view?repSeq=DOM_001&curPage=1">link</a>`;
    expect(parseListPage(html)).toEqual([]);
  });
});

describe("incheon parseDetailBody", () => {
  it("board-view-contents 안 <br /> 분리 본문 추출", () => {
    const html = `
      <div class="board-view-contents cms_content">
        <!-- 220706 개행문자 치환 -->
        인천광역시는 지난 5월 11일부터 15일까지 진행한 인천형 주거정책 &lsquo;아이플러스 집드림&rsquo;의 천원주택 매입임대주택 예비입주자 모집 접수를 마감했다고 밝혔다.<br /><br />
        이번 모집은 신혼·신생아Ⅱ유형 매입임대주택 총 300호 규모로 추진됐다.
      </div>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("인천광역시");
    expect(body).toContain("천원주택");
    expect(body).toContain("'아이플러스 집드림'"); // entity decoded
  });

  it("HTML entity 디코딩 (&ldquo;, &rdquo;)", () => {
    const html = `<div class="board-view-contents">&ldquo;시민 안전&rdquo;을 위해 인천시는 다양한 정책을 추진하고 있으며, 모든 시민이 안전하고 편안한 생활을 할 수 있도록 최선을 다하고 있습니다. 이번 발표는 그러한 노력의 일환입니다.</div>`;
    const body = parseDetailBody(html);
    expect(body).toContain('"시민 안전"');
  });

  it("container 없음 — null", () => {
    expect(parseDetailBody(`<div class="other">한국어 본문 충분히 길게</div>`))
      .toBeNull();
  });

  it("한국어 없음 — null", () => {
    const html = `<div class="board-view-contents">English only content here for test</div>`;
    expect(parseDetailBody(html)).toBeNull();
  });

  it("50자 미만 — null (의미 없는 본문 차단)", () => {
    const html = `<div class="board-view-contents">짧음</div>`;
    expect(parseDetailBody(html)).toBeNull();
  });
});
