// ============================================================
// local-press collector body regex 회귀 test (2026-05-22)
// ============================================================
// 5/22 audit 발견 14 site silent fail 후속 — fix 한 selector 의 회귀 방지.
// 미래 site 재변경 시 fixture 매칭 fail 로 즉시 감지.
// ============================================================

import { describe, expect, it } from "vitest";
import { parseDetailBody as parseGwangju } from "@/lib/scraping/local-press/gwangju";
import { parseDetailBody as parseGangwon } from "@/lib/scraping/local-press/gangwon";

describe("gwangju parseDetailBody", () => {
  it("새 selector (board_view_body) 매칭 — 5/22 fix", () => {
    const html = `
      <div class="board_view_body">
        <div class="view_image"><img src="x.jpg"></div>
        강기정 광주광역시장이 21일 오후 김대중컨벤션센터에서 열린
        2026 광주식품대전 개막식에 참석해 내빈들과 함께 전시장을 둘러보고 있다.
        광주광역시는 식품 산업의 글로벌 경쟁력 강화를 위해 적극 지원하겠다고 밝혔다.
        <div class="add_file">
          <a href="x">첨부파일</a>
        </div>
      </div>
    `;
    const body = parseGwangju(html);
    expect(body).not.toBeNull();
    expect(body).toContain("광주광역시장");
    expect(body!.length).toBeGreaterThan(50);
  });

  it("legacy selector (board_view_content) fallback — 미래 site 회귀 대비", () => {
    const html = `
      <div class="board_view_content">
        구 패턴 본문 — 광주광역시는 디지털 전환을 가속화하고 있다.
        시민 참여 기반 정책 발표 행사를 매월 개최한다.
      </div>
    `;
    const body = parseGwangju(html);
    expect(body).not.toBeNull();
    expect(body).toContain("광주광역시");
  });

  it("본문 없으면 null", () => {
    const html = `<div class="other">아무것도 없음</div>`;
    expect(parseGwangju(html)).toBeNull();
  });
});

describe("gangwon parseDetailBody", () => {
  it("title + 첨부파일 합산 — 5/22 fix", () => {
    const html = `
      <div class="skinTb-td skinTb-conts">
        <p>도 사회서비스원, 재난복지 전문인력 현장 대응 역량 강화</p>
      </div>
      <div class="skinTb-tr">
        <div class="skinTb-td attachFile">
          <a href="/dl/1">
            <span class="icoFile icoFile-data-hwp"></span>
            1. 보도자료(도 사회서비스원, 재난복지 전문인력 현장 대응 역량 강화).hwp
          </a>
        </div>
      </div>
      <div class="copyright-bx">공공누리</div>
    `;
    const body = parseGangwon(html);
    expect(body).not.toBeNull();
    // 본문 (title) + 첨부 file 이름 합산 → 50자+
    expect(body!.length).toBeGreaterThan(50);
    expect(body).toContain("재난복지 전문인력");
  });

  it("legacy fallback — copyright-bx 없는 옛 page 도 매칭", () => {
    const html = `
      <div class="skinTb-td skinTb-conts">
        강원도, 디지털 격차 해소 사업 본격 추진. 시군 협력 확대.
      </div>
    `;
    const body = parseGangwon(html);
    // 본문 50자 미만 → null
    expect(body).toBeNull();
  });
});
