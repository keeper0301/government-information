// ============================================================
// 충주시 보도자료 collector parseListPage 단위 테스트
// ============================================================
// 2026-06-04 제목 junk 수리 회귀 방지:
//   SI substance 구조의 anchor inner 에는 제목 <strong class="subject"> 와
//   부제목·담당부서·본문 <span class="text"> 가 함께 있어, 통째 태그제거 시
//   "제목 - 부제목 - (부서) 본문…" junk 가 섞임 → subject 블록만 추출하도록 수정.

import { describe, it, expect } from "vitest";
import { parseListPage } from "@/lib/scraping/local-press/chungju";

describe("chungju parseListPage — subject 제목만 추출 (라이브 구조)", () => {
  // 라이브(chungju.go.kr selectBbsNttList) anchor inner 구조 재현
  const html = `
    <a href="./selectBbsNttView.do?key=494&bbsNo=6&nttNo=321044&pageIndex=1">
      <div>
        <span class="photo"><img src="/no_img2.gif" width="137" height="97" alt="GOOD 충주"/></span>
        <div class="substance">
          <strong class="subject">
            충주시, 중학생 진로탐험활동 지원사업 6월 1일 첫 시행
          </strong>
          <span class="text">- 자기주도적 진로 설계 지원으로 학생들의 미래 응원 -<br/><br/>(여성청소년과 아동친화드림팀장, 850-6870)<br/><br/>충주시는 중학생들의 적성과 흥미를 조기에 발견하고 다양한 진로체험 기회를 제공하기 위한 사업을 1일부터 본격 시행한다고 밝혔다.</span>
        </div>
      </div>
    </a>
    <span class="date">2026.06.01</span>
  `;
  const items = parseListPage(html);

  it("subject 블록 안의 제목만 추출", () => {
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe(
      "충주시, 중학생 진로탐험활동 지원사업 6월 1일 첫 시행",
    );
  });

  it("부제목·담당부서·본문이 제목에 섞이지 않음 (junk 회귀 방어)", () => {
    expect(items[0].title).not.toContain("자기주도적"); // 부제목
    expect(items[0].title).not.toContain("여성청소년과"); // 담당부서
    expect(items[0].title).not.toContain("850-6870"); // 전화
    expect(items[0].title).not.toContain("밝혔다"); // 본문
  });

  it("날짜 파싱 (YYYY.MM.DD → YYYY-MM-DD)", () => {
    expect(items[0].publishedDate).toBe("2026-06-01");
  });
});

describe("chungju parseListPage — subject 없으면 fallback", () => {
  it("subject 블록이 없으면 기존 통째 추출 (안전망 — 회귀 방지)", () => {
    const html = `
      <a href="./selectBbsNttView.do?key=494&bbsNo=6&nttNo=999&pageIndex=1">
        <div class="substance">충주시 일반 공지사항 제목입니다</div>
      </a>
    `;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain("충주시 일반 공지사항 제목입니다");
  });
});
