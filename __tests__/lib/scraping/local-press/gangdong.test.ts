// ============================================================
// 강동구 보도자료 parser 단위 테스트 (2026-06-01)
// ============================================================
// newportal CMS. list = /web/newportal/press/{id}, 본문 = input-table td.colspan=4.

import { describe, it, expect } from "vitest";
import { parseListPage, parseDetailBody } from "@/lib/scraping/local-press/gangdong";

describe("강동구 parseListPage (/web/newportal/press)", () => {
  it("절대 href: seq/title/date + sourceUrl", () => {
    const html = `
      <tr>
        <td class="no">10315</td>
        <td class="subject"><a href="https://www.gangdong.go.kr/web/newportal/press/15202">강동구, 전통시장 5곳 여름 전 정비 나선다</a></td>
        <td>지역경제과</td><td>2026-06-01</td>
      </tr>
    `;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("15202");
    expect(items[0].title).toBe("강동구, 전통시장 5곳 여름 전 정비 나선다");
    expect(items[0].publishedDate).toBe("2026-06-01");
    expect(items[0].sourceUrl).toBe("https://www.gangdong.go.kr/web/newportal/press/15202");
  });

  it("상대 href 도 추출 + 제목 속 날짜에 오염 안 됨", () => {
    const html = `
      <td class="subject"><a href="/web/newportal/press/15200">강동구, 2026-12-25 성탄 행사 안내</a></td>
      <td>홍보과</td><td>2026-06-01</td>
    `;
    const items = parseListPage(html);
    expect(items[0].seq).toBe("15200");
    expect(items[0].publishedDate).toBe("2026-06-01"); // 제목 12-25 아님
  });
});

describe("강동구 parseDetailBody (input-table td.colspan=4)", () => {
  const LONG =
    "서울 강동구는 관내 전통시장 5곳을 대상으로 여름철을 앞두고 시설 현대화 사업을 조기에 추진한다고 밝혔다. 구는 덮지붕과 안개 분사기를 설치하고 노후 패널을 교체하는 등 폭염과 장마에 선제적으로 대응할 계획이며, 상인과 이용객 모두가 쾌적하게 시장을 이용할 수 있도록 환경을 개선하겠다고 강조했다. 이번 사업에는 총 17억 5천여만 원의 예산이 투입되며, 길동복조리시장을 비롯한 5개 시장이 대상이다. 구는 공사 기간 중 상인들의 영업에 불편이 없도록 단계별로 공정을 추진하고, 완료 이후에는 시장 활성화를 위한 다양한 행사도 함께 추진할 예정이라고 덧붙였다.";

  it("colspan=4 본문 + 중첩 table 안 잘림", () => {
    const html = `
      <table class="input-table mt20"><caption>보도자료 상세내용</caption><tbody>
        <tr><th scope="row">제목</th><td colspan="3">전통시장 정비</td></tr>
        <tr><td colspan="4" style="border-left:0px">
          <p>${LONG}</p>
          <table><tbody><tr><td>구분</td><td>시장명</td></tr></tbody></table>
          <p>자세한 사항은 구청 지역경제과로 문의하면 된다.</p>
        </td></tr>
      </tbody></table>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("시설 현대화"); // 표 앞
    expect(body).toContain("지역경제과로 문의"); // 표 뒤 (조기 잘림 X)
  });

  it("안전 분기 (input-table 없음/colspan4 없음/닫는 td 없음/250 미만 → null)", () => {
    expect(parseDetailBody(`<table class="other"><td colspan="4">${LONG}</td></table>`)).toBeNull();
    expect(parseDetailBody(`<table class="input-table"><td colspan="3">${LONG}</td></table>`)).toBeNull();
    // 닫는 td 없음(응답 잘림) → raw===null → null (junk 방지)
    expect(parseDetailBody(`<table class="input-table"><td colspan="4">${LONG}`)).toBeNull();
    expect(parseDetailBody(`<table class="input-table"><td colspan="4">짧은 본문</td></table>`)).toBeNull();
  });
});
