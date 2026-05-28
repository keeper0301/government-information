// ============================================================
// 부산진구 / 금정구 parseListPage + parseDetailBody 단위 테스트
// ============================================================
// 2026-05-29 본문 파싱 수리 회귀 방지:
//   - 부산진: 본문 <div class="substan"> (view01 전체를 잡으면 이전글/다음글 제목 혼입)
//   - 금정: 본문 <td class="contents"> (기존 <div class="contents"> 만 찾아 td 라 실패)
//   - 끝 경계: 버튼/첨부/이전글·다음글 마커의 여는 < 직전까지

import { describe, it, expect } from "vitest";
import * as busanjin from "@/lib/scraping/local-press/busanjin";
import * as geumjeong from "@/lib/scraping/local-press/geumjeong";

describe("busanjin parseDetailBody — div.substan", () => {
  it("substan 본문 추출 + 이전글/다음글 제목 혼입 방지 (핵심 회귀)", () => {
    const html = `
      <div class="view01">
        <div class="title">부산진구, 청년 일자리 박람회 개최</div>
        <div class="info"><p class="btxt"><strong>작성자</strong>일자리산업과</p></div>
        <div class="substan">
          <p>부산진구는 오는 6월 청년 구직자를 위한 일자리 박람회를 개최한다고 밝혔다. 50개 기업이 참여하며 현장 면접도 진행된다고 설명했다.</p>
        </div>
        <p class="gap60"></p>
        <div class="board-btns">
          <a href="#">다음글</a> 부산진구, KT&G 상상마당 부산 참여
        </div>
      </div>
    `;
    const body = busanjin.parseDetailBody(html);
    expect(body).toContain("일자리 박람회");
    expect(body).toContain("현장 면접");
    // 다음글 제목(KT&G 상상마당)이 본문에 섞이면 안 됨
    expect(body).not.toContain("KT&G 상상마당");
    expect(body).not.toContain("다음글");
  });

  it("MS Word 조건부 주석 제거 + 미완성 꼬리 태그 제거", () => {
    const html = `
      <div class="substan">
        <p class="0"><!--[if !supportEmptyParas]--><b>&nbsp;</b><!--[endif]--></p>
        <p>부산진구는 지역 소상공인을 위한 온라인 판로개척 사업을 지속 추진한다고 밝혔다. 자세한 사항은 일자리산업과로 문의하면 된다.</p>
      </div>
      <div class="board-btns"><a onclick="goList()">목록</a></div>
    `;
    const body = busanjin.parseDetailBody(html);
    expect(body).toContain("소상공인");
    expect(body).not.toContain("supportEmptyParas");
    expect(body).not.toMatch(/<[a-z]/i); // 꼬리 태그 조각 없음
  });

  it("list_no + title 매핑 + &amp; 디코딩 (detail URL 깨짐 방지)", () => {
    const html = `<a href="/board/view.busanjin?boardId=BBS_0000265&amp;menuCd=DOM_000000103007004000&amp;dataSid=3923670">부산진구, 청년 일자리 박람회 개최</a>`;
    const items = busanjin.parseListPage(html);
    expect(items[0].seq).toBe("3923670");
    expect(items[0].title).toContain("일자리 박람회");
    expect(items[0].sourceUrl).toContain("busanjin.go.kr");
    // &amp; 가 남으면 detail fetch 가 에러 페이지를 받아 본문 0건이 됨
    expect(items[0].sourceUrl).not.toContain("&amp;");
    expect(items[0].sourceUrl).toContain("&menuCd=");
  });
});

describe("geumjeong parseDetailBody — td.contents", () => {
  it("td.contents 본문 추출 (div 아닌 td) → btn_list 직전까지", () => {
    const html = `
      <td class="contents">
        <p>금정구는 장애인의 정보 접근성과 삶의 질 향상을 위한 2026년 정보통신보조기기 보급 사업 대상자를 모집한다고 밝혔다. 신청은 7월 말까지다.</p>
      </td>
      <div class="btn_list"><a onclick="goList()">목록</a></div>
      <ul class="view_list"><li>다음글 금정구 다른 소식</li></ul>
    `;
    const body = geumjeong.parseDetailBody(html);
    expect(body).toContain("정보통신보조기기");
    expect(body).toContain("신청은 7월 말까지");
    expect(body).not.toContain("목록");
    expect(body).not.toContain("다른 소식"); // 이전/다음글 제목 혼입 방지
  });

  it("본문 내 인라인 <a>첨부</a>·이미지 alt 의 '첨부'가 본문을 끊지 않음 (code review)", () => {
    const html = `
      <td class="contents">
        <p>생활쓰레기 배출요일이 변경됩니다. 신청서는 <a href="/down">첨부</a> 파일을 보세요.</p>
        <img src="/a.png" alt="배출요일 첨부 이미지 1" />
        <p>자세한 내용은 청소행정과로 문의하시기 바랍니다.</p>
      </td>
      <div class="btn_list"><a onclick="goList()">목록</a></div>
    `;
    const body = geumjeong.parseDetailBody(html);
    expect(body).toContain("배출요일");
    // 텍스트 마커 제거로 인라인 '첨부' 뒤 문장까지 온전히 살아있어야 함
    expect(body).toContain("청소행정과");
  });

  it("컨테이너 없으면 — null", () => {
    expect(geumjeong.parseDetailBody(`<p>일반 본문</p>`)).toBeNull();
  });
});
