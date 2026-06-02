// ============================================================
// local-press collector body regex 회귀 test (2026-05-22)
// ============================================================
// 5/22 audit 발견 14 site silent fail 후속 — fix 한 selector 의 회귀 방지.
// 미래 site 재변경 시 fixture 매칭 fail 로 즉시 감지.
// ============================================================

import { describe, expect, it } from "vitest";
import { parseDetailBody as parseGwangju } from "@/lib/scraping/local-press/gwangju";
import { parseDetailBody as parseGangwon } from "@/lib/scraping/local-press/gangwon";
import { parseDetailBody as parseChungnam } from "@/lib/scraping/local-press/chungnam";
import { parseDetailBody as parseDaejeon } from "@/lib/scraping/local-press/daejeon";
import { parseDetailBody as parseJeju } from "@/lib/scraping/local-press/jeju";

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
  it("title + 첨부파일 합산 — 5/22 fix", async () => {
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
    const body = await parseGangwon(html);
    expect(body).not.toBeNull();
    // 본문 (title) + 첨부 file 이름 합산 → 50자+
    expect(body!.length).toBeGreaterThan(50);
    expect(body).toContain("재난복지 전문인력");
  });

  it("legacy fallback — copyright-bx 없는 옛 page 도 매칭", async () => {
    const html = `
      <div class="skinTb-td skinTb-conts">
        강원도, 디지털 격차 해소 사업 본격 추진. 시군 협력 확대.
      </div>
    `;
    const body = await parseGangwon(html);
    // 본문 50자 미만 → null
    expect(body).toBeNull();
  });
});

describe("chungnam parseDetailBody", () => {
  it("새 selector (board-view + content_body) — 5/22 fix", () => {
    const html = `
      <div class="board-view">
        충청남도는 지역 청년 일자리 확대를 위한 새 정책을 발표했다.
        청년 창업 지원 펀드 50억 원을 조성하고, 시군과 협력 체계 강화.
        <div class="board-view-li item02">메타 정보</div>
      </div>
    `;
    const body = parseChungnam(html);
    expect(body).not.toBeNull();
    expect(body).toContain("충청남도");
  });

  it("legacy fallback (bbs_view)", () => {
    const html = `
      <div class="bbs_view">
        충남도, 농업 ICT 융합 사업 추진. 스마트팜 100개소 확대.
        지역 특화 산업과 디지털 전환 동시 가속화.
      </div>
    `;
    const body = parseChungnam(html);
    expect(body).not.toBeNull();
    expect(body).toContain("충남도");
  });
});

describe("daejeon parseDetailBody", () => {
  it("board_txt 본문 정확 추출", () => {
    const html = `
      <div class="board_txt">
        대전광역시는 미세먼지 저감 종합 대책을 시행한다.
        주요 사업으로 노후 경유차 조기 폐차 지원 + 친환경 자동차 보급 확대.
        2030년까지 미세먼지 30% 감축 목표.
      </div>
    `;
    const body = parseDaejeon(html);
    expect(body).not.toBeNull();
    expect(body).toContain("대전광역시");
  });

  it("한글 가드 — 영문 only 본문 null", () => {
    const html = `
      <div class="board_txt">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit.
        Test content without Korean characters at all here.
      </div>
    `;
    const body = parseDaejeon(html);
    expect(body).toBeNull();
  });
});

describe("jeju parseDetailBody", () => {
  it("새 selector (article-contents) — 5/22 fix", () => {
    const html = `
      <div class="article-contents">
        제주특별자치도는 관광 산업 회복을 위한 종합 마케팅 시행.
        해외 직항 노선 확대 + 디지털 관광 컨텐츠 강화.
        <div class="file-preview">파일</div>
      </div>
    `;
    const body = parseJeju(html);
    expect(body).not.toBeNull();
    expect(body).toContain("제주");
  });

  it("legacy id (articleContents) fallback", () => {
    const html = `
      <div id="articleContents">
        제주도는 해녀 문화 보존 사업을 본격 추진한다. 후속 세대 양성과
        지역 경제 활성화를 동시에 가속화. 도내 200여 명 해녀에게 안전 장비
        지원 확대 및 디지털 기록화 사업 병행 시행.
        <div id="popularNews">인기 뉴스</div>
      </div>
    `;
    const body = parseJeju(html);
    expect(body).not.toBeNull();
    expect(body).toContain("제주도");
  });
});
