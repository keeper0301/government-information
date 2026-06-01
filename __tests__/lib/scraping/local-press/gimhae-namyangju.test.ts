// ============================================================
// 김해·남양주 parseListPage + parseDetailBody 단위 테스트 (G4)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseListPage as parseGimhaeList,
  parseDetailBody as parseGimhaeBody,
} from "@/lib/scraping/local-press/gimhae";
import {
  parseListPage as parseNamyangjuList,
  parseDetailBody as parseNamyangjuBody,
} from "@/lib/scraping/local-press/namyangju";

describe("gimhae parseListPage", () => {
  it("idx + strong.t1 title + 날짜 매핑 + 새 글 child 제거", () => {
    const html = `
      <a href="?gcode=1172&amp;idx=2585376&amp;amode=view&amp;" class="a1">
        <span class="wrap1texts">
          <strong class="t1">
            김해시, 정책 수립부터 성차별 걸러낸다
            <i class="ic1 new"><span class="t1">새 글</span></i>
          </strong>
        </span>
      </a>
      <span>2026-05-15</span>
      <a href="?gcode=1172&amp;idx=2585374&amp;amode=view&amp;" class="a1">
        <strong class="t1">김해시 분성산 생태숲 황톳길 개장</strong>
      </a>
      <span>2026-05-14</span>
    `;
    const items = parseGimhaeList(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("2585376");
    expect(items[0].title).toContain("김해시");
    expect(items[0].title).toContain("성차별");
    expect(items[0].title).not.toContain("새 글"); // child element 제거
    expect(items[0].publishedDate).toBe("2026-05-15");
    expect(items[0].sourceUrl).toContain("idx=2585376");
  });

  it("같은 idx 중복 link 단일화", () => {
    const html = `
      <a href="?gcode=1172&amp;idx=1234&amp;amode=view&amp;" class="a1"><strong class="t1">첫 link 제목</strong></a>
      <a href="?gcode=1172&amp;idx=1234&amp;amode=view&amp;" class="a1"><strong class="t1">두번째 같은 idx</strong></a>
    `;
    expect(parseGimhaeList(html).length).toBe(1);
  });
});

describe("gimhae parseDetailBody", () => {
  // 250자+ 본문 (factory BODY_MIN_LEN=250 통과 + 실제 .substance 길이 재현)
  const 긴본문 =
    "김해시는 28일 김해시생활문화평생학습관에서 제3기 평생학습 SNS 서포터즈 발대식을 개최했다고 밝혔다. " +
    "이번 발대식에는 평생학습 매니저와 SNS 서포터즈 50여 명이 참석했으며, 시는 이들이 평생학습 프로그램을 " +
    "시민들에게 널리 알리는 역할을 맡게 된다고 설명했다. 서포터즈는 앞으로 6개월간 활동하며 평생학습 우수 사례를 " +
    "발굴하고 온라인 채널을 통해 홍보 콘텐츠를 제작할 예정이다. 시 관계자는 시민 누구나 평생 배움을 누릴 수 있는 " +
    "환경을 만들기 위해 지속적으로 노력하겠다고 말했다.";

  it("div.substance 중첩 div depth 추적으로 본문 추출", () => {
    // .substance 안에 사진 갤러리 div + 본문 — non-greedy 면 첫 </div> 에서 끊김.
    const html = `
      <div class="substance">
        <div class="photo_area"><img src="/x.jpg"><span>1번째 사진</span></div>
        <script>jQchangePic3('click');</script>
        <p>${긴본문}</p>
      </div>
      <div class="btn">목록</div>
    `;
    const body = parseGimhaeBody(html);
    expect(body).toContain("김해시");
    expect(body).toContain("서포터즈");
    expect(body).not.toContain("jQchangePic3"); // script 제거
    expect((body ?? "").length).toBeGreaterThanOrEqual(250);
  });

  it("선두 사진 슬라이더 잡음(‹›+빈줄) 제거 — 첫 한글부터", () => {
    // 라이브 .substance 도입부 재현: 화살표 entity + 빈 슬라이드 줄(\r\n 다발)
    const html = `
      <div class="substance">
        <div class="photo_area">-${"\r\n".repeat(40)}&lsaquo;${"\r\n".repeat(40)}&rsaquo;${"\r\n".repeat(40)}</div>
        <p>${긴본문}</p>
      </div>
    `;
    const body = parseGimhaeBody(html);
    expect(body).not.toContain("&lsaquo;");
    expect(body).not.toContain("&rsaquo;");
    expect(body?.startsWith("김해시")).toBe(true); // 선두 잡음 제거 후 한글 본문부터
  });

  it("250자 미만 본문 — null (thin 차단)", () => {
    const html = `<div class="substance"><p>김해시 짧은 안내문</p></div>`;
    expect(parseGimhaeBody(html)).toBeNull();
  });

  it("fallback <p> 한국어 다수 (.substance 부재)", () => {
    const html = `<p>${긴본문}</p>`;
    const body = parseGimhaeBody(html);
    expect(body).toContain("김해시");
  });
});

describe("namyangju parseListPage", () => {
  it("nttNo + em.p-media__heading-text title + time.p-split 날짜", () => {
    const html = `
      <a href="./selectBbsNttView.do?key=2498&amp;bbsNo=68&amp;pageIndex=1&amp;pageUnit=8&amp;searchCnd=all&amp;nttNo=541892" class="p-media__link">
        <em class="p-media__heading-text">남양주시, 대형공사장 안전관리 책임자 현장간담회 개최</em>
      </a>
      <time class="p-split">2026-05-15</time>
      <a href="./selectBbsNttView.do?key=2498&amp;bbsNo=68&amp;nttNo=541774">
        <em class="p-media__heading-text">남양주시, 청년꽃간 2호점 업무협약</em>
      </a>
      <time class="p-split">2026-05-14</time>
    `;
    const items = parseNamyangjuList(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("541892");
    expect(items[0].title).toContain("대형공사장");
    expect(items[0].publishedDate).toBe("2026-05-15");
    expect(items[0].sourceUrl).toContain("nttNo=541892");
  });

  it("같은 nttNo 중복 link 단일화", () => {
    const html = `
      <a href="./selectBbsNttView.do?nttNo=541892"><em class="p-media__heading-text">첫 link 제목</em></a>
      <a href="./selectBbsNttView.do?nttNo=541892"><em class="p-media__heading-text">두번째 같은</em></a>
    `;
    expect(parseNamyangjuList(html).length).toBe(1);
  });
});

describe("namyangju parseDetailBody", () => {
  const 긴본문 =
    "남양주시는 제9회 전국동시지방선거 사전투표일을 하루 앞둔 28일 진접읍과 오남읍 사전투표 모의시험 " +
    "현장을 찾아 선거사무 준비 상황을 점검했다고 밝혔다. 이번 점검은 사전투표 장비와 투표소 동선, " +
    "안내체계를 종합적으로 확인하기 위해 마련됐다. 시는 투표용지 발급기와 신분 확인 단말기 작동 상태를 " +
    "직접 살피고, 유권자 동선과 안내 표지 배치를 꼼꼼히 점검했다. 또한 현장 종사자들의 역할 분담과 " +
    "비상 대응 절차를 재확인하며 차질 없는 선거관리를 당부했다.";

  it("div.contenttext 중첩 div depth 추적 + 선두 소제목 머리 제거", () => {
    const html = `
      <div class="contenttext">
        <div class="sub"><p>- 사전투표 모의시험 현장점검 장비·동선 집중 점검</p></div>
        <p>${긴본문}</p>
      </div>
    `;
    const body = parseNamyangjuBody(html);
    expect(body).toContain("남양주시는");
    expect(body?.startsWith("-")).toBe(false); // 선두 "- " 머리 제거
    expect((body ?? "").length).toBeGreaterThanOrEqual(250);
  });

  it("250자 미만 본문 — null (thin 차단)", () => {
    expect(parseNamyangjuBody(`<div class="contenttext"><p>남양주시 짧은 안내</p></div>`)).toBeNull();
  });

  it("contenttext 부재 — null", () => {
    expect(parseNamyangjuBody(`<span>짧음</span>`)).toBeNull();
  });
});
