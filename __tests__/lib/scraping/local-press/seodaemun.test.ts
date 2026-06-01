// ============================================================
// 서대문구 구정뉴스 parser 단위 테스트 (2026-06-01)
// ============================================================
// EUC-KR 사이트(factory encoding opt-in)지만 parser 는 디코딩된 문자열만 받으므로
// fixture 는 일반 문자열. 검증:
//   - list: goView('seq') anchor 제목 + 같은 row 작성일 td (YYYY.MM.DD → YYYY-MM-DD)
//   - body: <td class="viewCon"> 셀을 td-depth 로 추출 (HWP 중첩 table 안 잘림)
//   - 안전 분기: viewCon 없음 → null, 50자 미만 → null

import { describe, it, expect } from "vitest";
import { parseListPage, parseDetailBody } from "@/lib/scraping/local-press/seodaemun";

describe("서대문 parseListPage (goView)", () => {
  it("goView seq + 제목 + 작성일 추출", () => {
    const html = `
      <tr>
        <td class="aleft">
          <a href="javascript:goView('312072');" title="서대문구 평생학습 프로그램 모집">서대문구 평생학습 프로그램 모집</a>
          &nbsp;<img src="/images/common/icon_new.gif" alt="새로 올라온 글"/>
        </td>
        <td>교육지원과</td><td>2026.06.01</td><td>33</td><td>1</td>
      </tr>
    `;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("312072");
    expect(items[0].title).toBe("서대문구 평생학습 프로그램 모집");
    expect(items[0].publishedDate).toBe("2026-06-01");
    expect(items[0].sourceUrl).toBe(
      "https://www.sdm.go.kr/news/news.do?mode=view&sdmBoardSeq=312072",
    );
  });

  it("부서명이 길어도 +800 window 안에서 날짜 추출", () => {
    const longDept = "서대문구청 도시재생및지역경제활성화추진단 일자리경제과";
    const html = `
      <a href="javascript:goView('311999');" title="홍제폭포 러닝 이용자 모집">홍제폭포 러닝 이용자 모집</a></td>
      <td>${longDept}</td><td>2026.05.28</td>
    `;
    const items = parseListPage(html);
    expect(items[0].publishedDate).toBe("2026-05-28");
  });

  it("제목 5자 미만/한글 없음은 제외", () => {
    const html = `
      <a href="javascript:goView('1');" title="abc">abc</a><td>2026.06.01</td>
      <a href="javascript:goView('2');" title="공지">공지</a><td>2026.06.01</td>
    `;
    expect(parseListPage(html)).toHaveLength(0); // 둘 다 5자 미만 또는 비한글
  });
});

describe("서대문 parseDetailBody (viewCon 셀)", () => {
  const LONG =
    "서대문구민과 관내 직장인, 학생 분들을 위한 3분기 평생학습 프로그램이 시작됩니다. 이번 프로그램은 생애주기에 맞춘 다양한 강좌로 구성되어 있으며, 직장인을 위한 야간 강좌와 주말 강좌도 함께 운영될 예정입니다. 어학과 인문학, 디지털 역량 강화, 건강 관리 등 폭넓은 분야의 강좌가 마련되어 있어 누구나 관심 있는 분야를 선택해 배울 수 있습니다. 구는 주민 누구나 부담 없이 배움의 기회를 누릴 수 있도록 수강료를 합리적으로 책정했다고 밝혔습니다. 반드시 커리큘럼을 확인하신 후 신청해 주시기 바랍니다.";

  it("td.viewCon 본문 추출 + HWP 중첩 table 안 잘림", () => {
    const html = `
      <td colspan="4" class="viewCon" id="viewCon">
        <p>${LONG}</p>
        <table><tbody><tr><td>구분</td><td>일시</td></tr><tr><td>강좌</td><td>6월 15일</td></tr></tbody></table>
        <p>신청 방법은 구청 누리집을 참고하시기 바랍니다.</p>
      </td></tr>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("평생학습 프로그램"); // 표 앞
    expect(body).toContain("누리집을 참고"); // 표 뒤 (조기 잘림 X)
  });

  it("id=viewCon 만 있어도 추출", () => {
    const html = `<td id="viewCon"><p>${LONG}</p></td></tr>`;
    expect(parseDetailBody(html)).toContain("평생학습");
  });

  it("viewCon 셀 없으면(공고·구보 등) null", () => {
    expect(parseDetailBody(`<td class="other"><p>${LONG}</p></td>`)).toBeNull();
  });

  it("본문 50자 미만 null", () => {
    expect(parseDetailBody(`<td class="viewCon"><p>짧은 안내</p></td></tr>`)).toBeNull();
  });

  it("닫는 td 없으면(응답 잘림) null — junk 방지", () => {
    expect(parseDetailBody(`<td class="viewCon"><p>${LONG}`)).toBeNull();
  });
});
