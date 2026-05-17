// ============================================================
// 포항시 parseListPage + parseDetailBody 단위 테스트 (G4)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/pohang";

describe("pohang parseListPage", () => {
  it("data-req-get-p-idx + tit + date 매핑", () => {
    const html = `
      <a href="#" data-req-form-id="viewForm" data-req-get-p-idx="1018049">
        <div class="thumb"><figure></figure></div>
        <div class="cont">
          <span class="tit"> 포항시, 그래핀산업육성위원회 출범 그래핀 산업 육성 추진 기반 구축 </span>
          <span class="date">
            2026-05-05(화)
          </span>
        </div>
      </a>
      <a data-req-get-p-idx="1018048">
        <div class="cont">
          <span class="tit">포항시, 청년 정착 지원금 신청 안내</span>
          <span class="date">2026-05-04(월)</span>
        </div>
      </a>
    `;
    const items = parseListPage(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("1018049");
    expect(items[0].title).toContain("그래핀");
    expect(items[0].publishedDate).toBe("2026-05-05");
    expect(items[0].sourceUrl).toContain("idx=1018049");
  });

  it("title 의 entity (&hellip;) 디코딩", () => {
    const html = `
      <a data-req-get-p-idx="100">
        <span class="tit">포항시, 그래핀산업육성위원회 출범&hellip;그래핀 산업</span>
        <span class="date">2026-05-05</span>
      </a>
    `;
    const items = parseListPage(html);
    expect(items[0].title).toContain("출범…");
  });

  it("같은 idx 중복 — 단일화", () => {
    const html = `
      <a data-req-get-p-idx="200">
        <span class="tit">첫 번째 정책 안내</span>
        <span class="date">2026-05-01</span>
      </a>
      <a data-req-get-p-idx="200">
        <span class="tit">중복 정책 안내 제목</span>
        <span class="date">2026-05-01</span>
      </a>
    `;
    expect(parseListPage(html).length).toBe(1);
  });
});

describe("pohang parseDetailBody", () => {
  it("view_cont 안 mT10 본문 — 평택과 같은 SI 표준", () => {
    const html = `
      <div class="view_cont">
        <img src="/img" alt="">
        <div class="mT10 ">
          2026. 5. 5.<br><br>포항시는 13일 시청 중회의실에서 그래핀산업육성위원회 출범 이후 첫 회의를 개최했다고 밝혔다.
        </div>
      </div>
      <dl class="view_file">첨부</dl>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("포항시");
    expect(body).toContain("그래핀");
  });

  it("HTML entity 디코딩 (&middot;)", () => {
    const html = `
      <div class="view_cont">
        <div class="mT10">
          포항시는 환경&middot;경제 발전을 위한 다양한 정책을 추진합니다. 또한 시민의 삶을 위해 노력합니다.
        </div>
      </div>
    `;
    expect(parseDetailBody(html)).toContain("환경·경제");
  });

  it("container 없음 — null", () => {
    expect(parseDetailBody(`<p>일반 본문</p>`)).toBeNull();
  });
});
