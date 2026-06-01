// ============================================================
// 전북특별자치도 parseListPage + parseDetailBody 단위 테스트
// ============================================================
// 2026-06-02 — 본문 selector bbs_view → bbs_con 교정(메타/figure 제외) 회귀 방어.

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/jeonbuk";

describe("jeonbuk parseListPage", () => {
  it("dataSid + strong 제목 + 작성일 매핑", () => {
    const html = `
      <a href="/board/view.jeonbuk?boardId=BBS_0000090&amp;dataSid=662116">
        <strong>전북자치도, 인공어초 1,300개 투하 수산자원 회복</strong>
      </a>
      작성일 : 2026-05-29
      <a href="/board/view.jeonbuk?dataSid=662100">
        <strong>전북자치도, 청년 일자리 박람회 개최</strong>
      </a>
      작성일 : 2026-05-28
    `;
    const items = parseListPage(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("662116");
    expect(items[0].title).toContain("인공어초");
    expect(items[0].publishedDate).toBe("2026-05-29");
    expect(items[0].sourceUrl).toContain("dataSid=662116");
  });

  it("같은 dataSid 중복 단일화", () => {
    const html = `
      <a href="/board/view.jeonbuk?dataSid=100"><strong>첫 link 제목 충분히</strong></a>
      <a href="/board/view.jeonbuk?dataSid=100"><strong>두번째 같은 dataSid</strong></a>
    `;
    expect(parseListPage(html).length).toBe(1);
  });
});

describe("jeonbuk parseDetailBody", () => {
  const 긴본문 =
    "전북특별자치도는 수산자원 회복과 어업인 소득 증대를 위해 군산과 부안 해역에 인공어초 1,300개를 " +
    "신규 설치한다고 29일 밝혔다. 도는 총사업비 23억 원을 투입해 군산 횡경도와 부안 위도 해역 104헥타르에 " +
    "사각형 인공어초를 조성할 계획이다. 상반기 행정절차를 마무리한 뒤 현재 육상 제작을 진행 중이며, 오는 " +
    "9월 바지선과 크레인을 활용해 바다에 투하할 예정이다. 인공어초는 물고기의 산란과 서식 환경을 조성해 " +
    "연안 수산자원 회복과 어장 생산성 향상에 기여하는 기반시설이다.";

  it("bbs_con 본문만 추출 — 제목·메타(bbs_vtop)·figure 제외", () => {
    const html = `
      <div class="bbs_view">
        <div class="bbs_vtop">
          <h4>전북자치도, 인공어초 1,300개 투하 수산자원 회복</h4>
          <ul class="vtop_list">
            <li><strong>작성자</strong><span> : 대변인</span></li>
            <li><strong>작성일</strong><span> : 2026-05-29</span></li>
          </ul>
        </div>
        <div class="bbs_con">
          <figure class="bbs_img"><img src="/x.png"/><figcaption>인공어초 이미지(1)</figcaption></figure>
          <p>${긴본문}</p>
        </div>
      </div>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("전북특별자치도는");
    expect(body).not.toContain("작성자"); // bbs_vtop 메타 제외
    expect(body).not.toContain("이미지(1)"); // figure 캡션 제외
    expect((body ?? "").length).toBeGreaterThanOrEqual(250);
  });

  it("본문 안 중첩 div 를 첫 </div> 에서 끊지 않음 (기존 버그 회귀 방어)", () => {
    // 기존 non-greedy 버그: bbs_con 안 첫 중첩 div 의 </div> 에서 끊겨 88자만 추출.
    // depth 추적이 중첩을 통과해 컨테이너 끝까지 가는지 검증.
    const html = `
      <div class="bbs_con">
        <div class="quote_box"><p>중첩된 인용 블록 안의 짧은 문장이다.</p></div>
        <p>${긴본문}</p>
      </div>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("인용 블록"); // 중첩 div 안 텍스트도 포함
    expect(body).toContain("전북특별자치도는"); // 중첩 div 이후 본문까지 도달
  });

  it("250자 미만 본문 — null (thin 차단)", () => {
    const html = `<div class="bbs_con"><p>전북자치도 짧은 안내</p></div>`;
    expect(parseDetailBody(html)).toBeNull();
  });

  it("bbs_con 부재 — null", () => {
    expect(parseDetailBody(`<div class="other"><p>본문 없음</p></div>`)).toBeNull();
  });
});
