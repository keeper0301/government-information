// ============================================================
// 부산 parseListPage + parseDetailBody 단위 테스트 (G4)
// ============================================================
// (수원은 2026-06-02 Playwright 경로 이관으로 정적 parser 삭제 → 본 파일에서 제거)

import { describe, it, expect } from "vitest";
import {
  parseListPage as parseBusanList,
  parseDetailBody as parseBusanBody,
  stripPdfMeta,
} from "@/lib/scraping/local-press/busan";

describe("busan parseListPage", () => {
  it("/nbtnewsBU/{seq} link + title 매핑", () => {
    const html = `
      <a href="/nbtnewsBU/1731118?curPage=">부산시, BTS 월드투어 부산 공연 대비 가격안정 대책회의</a>
      <span>2026-05-15</span>
      <a href="/nbtnewsBU/1731116?srchText=">부산시, 신년 인사회 5대 종단 화합 메시지</a>
      <span>2026-05-14</span>
    `;
    const items = parseBusanList(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("1731118");
    expect(items[0].title).toContain("BTS");
    expect(items[0].publishedDate).toBe("2026-05-15");
    expect(items[0].sourceUrl).toBe(
      "https://www.busan.go.kr/nbtnewsBU/1731118",
    );
  });

  it("같은 seq 중복 link 단일화", () => {
    const html = `
      <a href="/nbtnewsBU/1731118">제목 첫번째 노출 충분히 길게</a>
      <a href="/nbtnewsBU/1731118">제목 두번째 같은 row 의 동일 seq</a>
    `;
    const items = parseBusanList(html);
    expect(items.length).toBe(1); // 중복 차단
  });

  it("title 5자 미만 skip", () => {
    const html = `<a href="/nbtnewsBU/1234">짧음</a>`;
    expect(parseBusanList(html)).toEqual([]);
  });
});

// 2026-06-02 — 본문은 boardView 의 <dt>부제목</dt><dd>본문</dd>. 같은 form-data-info dl 의
// 부서명/작성자 메타가 본문 앞에 와도 부제목 dd 만 추출(메타 누출 방어).
describe("busan parseDetailBody (부제목 dd)", () => {
  it("부제목 dd 본문 추출 + 메타(부서명/작성자) 미누출", async () => {
    const html = `
      <div class="boardView">
        <div class="form-group"><dl class="form-data-info">
          <dt><span>부서명</span></dt><dd>인공지능소프트웨어과</dd>
          <dt><span>전화번호</span></dt><dd>051-888-4484</dd>
          <dt><span>작성자</span></dt><dd>정용준</dd>
        </dl></div>
        <div class="form-group"><dl class="form-data-info">
          <dt><span>부제목</span></dt>
          <dd>◈ 부산대학교 연구팀이 글로벌 퀀텀 이노베이션 챌린지에서 최종 우승했다고 시가 밝혔다. 시는 덴마크 이노베이션 센터와 협력해 지역 연구자들의 국제 연구 활동을 지원해 왔다.</dd>
        </dl></div>
      </div>`;
    const body = await parseBusanBody(html);
    expect(body).toContain("부산대학교");
    expect(body).toContain("글로벌 퀀텀");
    expect(body).not.toContain("부서명");
    expect(body).not.toContain("인공지능소프트웨어과");
    expect(body).not.toContain("작성자");
  });

  it("부제목 dt 가 없으면 null", async () => {
    expect(await parseBusanBody(`<dd>본문만 있고 부제목 dt 없음입니다.</dd>`)).toBeNull();
  });

  it("HTML entity 디코딩", async () => {
    const html = `<dt><span>부제목</span></dt><dd>부산시 &quot;글로벌 가교&quot; 역할 &amp; 협력을 강화한다고 밝혔다.</dd>`;
    const body = await parseBusanBody(html);
    expect(body).toContain('"글로벌 가교"');
    expect(body).toContain("역할 & 협력");
  });
});

// 2026-06-02 — 부산 본문은 첨부 PDF 전문(unpdf 추출). 보도자료 표준 메타 머리
// (담당부서·전화·유형·공개여부)를 "각종 회의…표시" 마커로 제거. ※ 위치는 PDF
// 레이아웃 따라 앞/뒤 가변이라 마커는 ※ 아닌 문구 기준.
describe("busan stripPdfMeta (PDF 메타 머리 제거)", () => {
  const 본문 =
    "부산시, 시민 참여형 부산시민 홈스테이를 추진한다고 밝혔다. 공정숙박 확산으로 숙박요금을 " +
    "안정화하고 부산시민단체협의회 회원들의 자발적 참여를 기반으로 공정하고 상생하는 시민 " +
    "홈스테이를 제공한다. 홈스테이 예약 보증금 5만 원은 부산관광상품카드로 전액 환급된다. 시는 " +
    "월드투어 공연을 앞두고 고질적인 숙박업소 폭리 문제를 근절하기 위한 대응책을 마련했다고 " +
    "설명했다. 이번 사업은 시민 참여형으로 추진되며 지역사회 신뢰 회복에 기여할 것으로 기대된다.";

  it("'각종 회의…표시'(※ 앞) 마커로 메타 머리 제거", () => {
    const pdf = `2026년 6월 1일 담당부서 : 경제정책과 유 형 : 회의 공개여부 : 공개 □ 비공개 □ ※ 각종 회의 행사 등에 한해서 표시, ${본문}`;
    const out = stripPdfMeta(pdf);
    expect(out).not.toContain("담당부서");
    expect(out).not.toContain("공개여부");
    expect(out.startsWith("부산시")).toBe(true);
  });

  it("※ 위치 역전(표시,※)도 제거 (PDF 레이아웃 가변)", () => {
    const pdf = `담당부서 : 디자인산업혁신과 공개여부 : 공개 □ 각종 회의 행사 등에 한해서 표시,※ ${본문}`;
    const out = stripPdfMeta(pdf);
    expect(out).not.toContain("담당부서");
    expect(out.startsWith("부산시")).toBe(true);
  });

  it("마커 부재 시 전체 유지 (전문 확보 우선)", () => {
    expect(stripPdfMeta(본문)).toContain("부산시");
  });
});
