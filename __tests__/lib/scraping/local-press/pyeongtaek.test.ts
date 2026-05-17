// ============================================================
// 평택시 parseListPage + parseDetailBody 단위 테스트 (G4)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/pyeongtaek";

describe("pyeongtaek parseListPage", () => {
  it("data-req-get-p-idx + list_title + list_data 매핑", () => {
    const html = `
      <a href="#" onclick="yhLib.inline.post(this); return false;"
         data-req-form-id="viewForm" data-req-merge-form-id="listForm" data-req-get-p-idx="352975">
        <div></div>
        <span class="list_title">평택시, 해외여행 감염병 예방수칙 준수 당부</span>
        <span class="list_txt">내용</span>
        <span class="list_data">작성일 2026.05.15 조회 9</span>
      </a>
      <a href="#" data-req-get-p-idx="352974">
        <span class="list_title">평택시, 청년 정착 지원금 신청 안내</span>
        <span class="list_data">작성일 2026.05.14 조회 12</span>
      </a>
    `;
    const items = parseListPage(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("352975");
    expect(items[0].title).toContain("해외여행");
    expect(items[0].publishedDate).toBe("2026-05-15");
    expect(items[0].sourceUrl).toContain("idx=352975");
    expect(items[1].seq).toBe("352974");
  });

  it("같은 idx 중복 anchor 단일화", () => {
    const html = `
      <a data-req-get-p-idx="100">
        <span class="list_title">첫 번째 정책 안내 제목</span>
        <span class="list_data">작성일 2026.05.01 조회 1</span>
      </a>
      <a data-req-get-p-idx="100">
        <span class="list_title">중복 정책 안내 제목</span>
        <span class="list_data">작성일 2026.05.01 조회 1</span>
      </a>
    `;
    expect(parseListPage(html).length).toBe(1);
  });

  it("list_data 없는 anchor — skip", () => {
    const html = `
      <a data-req-get-p-idx="200">
        <span class="list_title">제목만 있고 날짜 없음</span>
      </a>
    `;
    expect(parseListPage(html).length).toBe(0);
  });
});

describe("pyeongtaek parseDetailBody", () => {
  it("view_cont 안 mT10 본문 추출 + <br> 줄바꿈", () => {
    const html = `
      <div class="view_cont">
        <img src="/img" alt="">
        <div class="mT10 ">
          2026. 5. 15.<br><br>평택보건소 보건사업과<br>평택시(시장 정장선)는 2026 FIFA 북중미 월드컵을 앞두고 미국·캐나다·멕시코 등 개최국을 방문하는 시민들에게 감염병 예방수칙 준수를 당부했다.
        </div>
      </div>
      <dl class="view_file">첨부</dl>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("평택시");
    expect(body).toContain("월드컵");
  });

  it("HTML entity 디코딩 (&middot; &amp;)", () => {
    const html = `
      <div class="view_cont">
        <div class="mT10">
          평택시는 환경&middot;경제 발전을 위한 다양한 정책을 추진합니다. 또한 시민의 삶을 위해 노력합니다.
        </div>
      </div>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("환경·경제");
  });

  it("view_cont 없음 — null", () => {
    expect(parseDetailBody(`<p>일반 본문</p>`)).toBeNull();
  });

  it("mT10 내 한국어 없음 — null", () => {
    expect(
      parseDetailBody(
        `<div class="view_cont"><div class="mT10">12345 abcdef 6789012345</div></div>`,
      ),
    ).toBeNull();
  });
});
