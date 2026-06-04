// ============================================================
// board.es CMS helper parseBoardEsDetailBody 단위 테스트
// ============================================================
// 2026-05-29 광주 4구 본문 파싱 수리 회귀 방지:
//   - tb_contents 스킨 (남·북·동구): <td/div class="tb_contents">, class 앞 colspan
//   - contents 스킨 (서구): <div class="contents">
//   - 본문 내 HWP/워드 export 중첩 table → </td> 경계 깨짐 → 구조 마커까지 캡처
//   - 끝 마커(add_file·file·BtnArea/goList) 없으면(응답 truncation) null = junk insert 차단

import { describe, it, expect } from "vitest";
import {
  parseBoardEsDetailBody,
  cleanBoardEsInnerTitle,
} from "@/lib/scraping/local-press/_board_es_helper";

describe("parseBoardEsDetailBody — tb_contents 스킨 (광주 남·북·동구)", () => {
  it("td.tb_contents (class 앞 colspan) → add_file 직전까지 추출", () => {
    const html = `
      <tr><td colspan="4" class="tb_contents">
        <p>북구는 2026년 희망아카데미를 개최한다고 밝혔다. 이번 강좌는 인문학과 시민교양을 주제로 매주 진행되며, 관심 있는 주민 누구나 무료로 참여할 수 있다. 자세한 일정은 구청 누리집에서 확인할 수 있다.</p>
      </td></tr>
      <ul class="add_file"><li><strong>첨부파일</strong> 포스터.jpg</li></ul>
    `;
    const body = parseBoardEsDetailBody(html);
    expect(body).toContain("희망아카데미");
    expect(body).not.toContain("첨부파일");
    expect(body).not.toContain("포스터.jpg");
  });

  it("본문 내 중첩 table 이 있어도 전체 본문 캡처 (핵심 회귀)", () => {
    const html = `
      <div class="tb_contents">
        <div>6월은 제1기분 자동차세 납부의 달입니다.</div>
        <table><tbody><tr><td>구분</td><td>금액</td></tr></tbody></table>
        <div>전국 금융기관에서 간편하게 납부하세요. 문의는 세무과로 바랍니다.</div>
      </div>
      <p class="BtnArea"><button type="button" onclick="goList(); return false;">목록</button></p>
    `;
    const body = parseBoardEsDetailBody(html);
    expect(body).toContain("자동차세");
    expect(body).toContain("간편하게 납부");
    expect(body).toContain("세무과");
    expect(body).not.toContain("목록");
  });

  it("MS Word/HWP 조건부 주석 제거", () => {
    const html = `
      <td colspan="4" class="tb_contents">
        <p class="0"><!--[if !supportEmptyParas]--><b>&nbsp;</b><!--[endif]--></p>
        <p><span style="font-family:batang;">행안부에서 여름철 재난&middot;안전 집중신고제를 운영한다고 밝혔다. 자세한 내용은 시청에 문의 바란다.</span></p>
      </td>
      <ul class="add_file"></ul>
    `;
    const body = parseBoardEsDetailBody(html);
    expect(body).toContain("재난·안전");
    expect(body).not.toContain("supportEmptyParas");
    expect(body).not.toContain("endif");
  });
});

describe("parseBoardEsDetailBody — contents 스킨 (광주 서구)", () => {
  it("div.contents → file 섹션 직전까지 추출", () => {
    const html = `
      <article class="board_view">
        <div class="contents">
          <h2 class="title">광주 서구, 숨은 가족돌봄청년 찾는다</h2>
          <p>광주 서구는 6월 30일까지 관내 4257세대를 대상으로 가족돌봄청년 전수조사를 실시한다고 밝혔다. 방문·유선조사와 욕구조사를 병행해 맞춤형 지원으로 연계할 계획이다.</p>
        </div>
      </article>
      <div class="file"><strong class="title">첨부파일</strong></div>
    `;
    const body = parseBoardEsDetailBody(html);
    expect(body).toContain("가족돌봄청년");
    expect(body).toContain("전수조사");
    expect(body).not.toContain("첨부파일");
  });
});

describe("parseBoardEsDetailBody — 안전 분기", () => {
  // 응답이 끝 마커 없이 잘려 오면(남구 truncation 사례) 부분/전체를 통째로 넣지 말고 null
  it("끝 마커 없으면 — null (truncation 시 garbage insert 차단)", () => {
    const html = `
      <td colspan="4" class="tb_contents">
        <p>남구는 본문이 있으나 첨부·버튼·목록 마커가 응답에 전혀 없이 잘려 왔다.</p>
    `;
    expect(parseBoardEsDetailBody(html)).toBeNull();
  });

  it("본문 컨테이너 자체가 없으면 — null", () => {
    expect(parseBoardEsDetailBody(`<p>일반 본문만 있고 board.es 컨테이너 없음</p>`)).toBeNull();
  });

  // 본문 내 인라인 <a class="file"> 다운로드 링크에서 본문이 잘리면 안 됨 (code review).
  // file 마커는 컨테이너(ul/div)로 한정했으므로 인라인 a 는 무시되고 본문 뒷부분까지 캡처.
  it("본문 내 인라인 <a class=file> 링크가 있어도 본문 전체 캡처", () => {
    const html = `
      <div class="tb_contents">
        <p>서구는 청년 지원 사업을 추진한다고 밝혔다. 신청서는 <a class="file" href="/down">여기</a>에서 받을 수 있다.</p>
        <p>접수는 6월 말까지이며 자세한 사항은 구청 일자리경제과로 문의하면 된다고 안내했다.</p>
      </div>
      <div class="file"><strong>첨부파일</strong> 신청서.hwp</div>
    `;
    const body = parseBoardEsDetailBody(html);
    expect(body).toContain("청년 지원");
    expect(body).toContain("일자리경제과"); // 인라인 file 링크 뒤 문장까지 살아있어야 함
    expect(body).not.toContain("신청서.hwp"); // 진짜 첨부 섹션은 제외
  });
});

describe("cleanBoardEsInnerTitle — inner 전략 제목 정제 (서구·동구)", () => {
  // 라이브(seogu.gwangju.kr) 신규 글 anchor inner 구조 재현 — sr_only "새글" 배지가 제목 앞에.
  it('신규 글 "새글" sr_only 배지를 제거하고 제목만 추출', () => {
    const inner =
      '\n<i class="xi-new"></i><span class="sr_only">새글</span> 광주 서구, 가족돌봄청년 전수조사 실시\n';
    expect(cleanBoardEsInnerTitle(inner)).toBe(
      "광주 서구, 가족돌봄청년 전수조사 실시",
    );
  });

  it("sr_only 배지가 없는 일반 글은 제목 그대로", () => {
    const inner = "\n광주 서구, 여름철 폭염 대응 종합대책 추진\n";
    expect(cleanBoardEsInnerTitle(inner)).toBe(
      "광주 서구, 여름철 폭염 대응 종합대책 추진",
    );
  });

  // 핵심 회귀: 제목이 우연히 "새글" 로 시작해도(sr_only span 아님) 오제거하면 안 됨.
  // (^새글 텍스트 제거 방식의 약점 — sr_only span 단위 제거라 안전)
  it('제목 본문이 "새글" 로 시작해도 보존 (오제거 방지)', () => {
    const inner = "\n새글동 행복마을 사업 설명회 개최\n";
    expect(cleanBoardEsInnerTitle(inner)).toBe("새글동 행복마을 사업 설명회 개최");
  });

  it("HTML 엔티티 디코드 + 공백 정규화", () => {
    const inner =
      '<span class="sr_only">새글</span> 서구 &middot; 동구 합동 안전점검';
    expect(cleanBoardEsInnerTitle(inner)).toBe("서구 · 동구 합동 안전점검");
  });
});
