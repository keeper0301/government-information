// ============================================================
// 화성·전주 parseListPage + parseDetailBody 단위 테스트 (G4)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseListPage as parseHwaseongList,
  parseDetailBody as parseHwaseongBody,
} from "@/lib/scraping/local-press/hwaseong";
import {
  parseListPage as parseJeonjuList,
  parseDetailBody as parseJeonjuBody,
} from "@/lib/scraping/local-press/jeonju";

describe("hwaseong parseListPage", () => {
  it("BD_selectBbs seq + 한국어 title + 날짜 seq 앞 8자리에서 도출", () => {
    const html = `
      <a href="BD_selectBbs.do?q_bbsCode=1051&amp;q_bbscttSn=20260515182947631&amp;q_deptCode=55306620000">화성특례시, 풍수해 대비 노후 간판 현장점검 실시</a>
      <a href="BD_selectBbs.do?q_bbsCode=1051&amp;q_bbscttSn=20260514103022100&amp;q_deptCode=55306620000">화성시, 의사도 약사도 함께 어르신 댁으로</a>
    `;
    const items = parseHwaseongList(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("20260515182947631");
    expect(items[0].title).toContain("풍수해");
    expect(items[0].publishedDate).toBe("2026-05-15"); // seq 앞 8자리
    expect(items[0].sourceUrl).toContain("q_bbscttSn=20260515182947631");
  });

  it("같은 seq 중복 link 단일화", () => {
    const html = `
      <a href="BD_selectBbs.do?q_bbsCode=1051&amp;q_bbscttSn=20260515182947631">첫 link 제목</a>
      <a href="BD_selectBbs.do?q_bbsCode=1051&amp;q_bbscttSn=20260515182947631">두번째 같은 seq</a>
    `;
    expect(parseHwaseongList(html).length).toBe(1);
  });
});

describe("hwaseong parseDetailBody", () => {
  it("board_text_td 안 본문 추출", () => {
    const html = `
      <td class="board_text_td">화성특례시는 5월 15일 풍수해 대비 노후 간판 일제 점검을 실시했다고 밝혔다. 이번 점검은 잠재적 위험 요소를 사전 차단하기 위한 것이다.</td>
    `;
    const body = parseHwaseongBody(html);
    expect(body).toContain("화성특례시");
    expect(body).toContain("풍수해");
  });

  it("fallback <p> 한국어 다수", () => {
    const html = `
      <table>
        <tr><td>
          <p>화성특례시는 도시의 안전을 최우선으로 하는 정책을 추진하고 있으며, 모든 시민이 편안하게 거주할 수 있도록 노력합니다.</p>
          <p>또한 환경 보호와 지속 가능한 발전을 위한 다양한 프로그램을 운영하고 있습니다.</p>
        </td></tr>
      </table>
    `;
    const body = parseHwaseongBody(html);
    expect(body).toContain("화성특례시");
    expect(body).toContain("환경 보호");
  });
});

describe("jeonju parseListPage", () => {
  it("dataUid (32자리 hex) + title + 날짜 매핑", () => {
    const html = `
      <td class="title"><a href="/planweb/board/view.9is?dataUid=9be517a89e2aaa21019e2b5922d018e2&amp;contentUid=ff8080818990c349018b041a87fe3960&amp;boardUid=ff8080818b5bc5cf018ba8ca7216641f&amp;page=1">전주시, 환경기초시설의 온실가스 감축 역량 강화</a></td>
      <td data-cell-header="작성일" class="date">2026-05-15</td>
      <td class="title"><a href="/planweb/board/view.9is?dataUid=9be517a89e2aaa21019e2b5868bb18d4&amp;contentUid=ff8080818990c349018b041a87fe3960&amp;boardUid=ff8080818b5bc5cf018ba8ca7216641f&amp;page=1">전주시, 청년과 기업을 잇는 자립프로그램 운영</a></td>
      <td data-cell-header="작성일" class="date">2026-05-14</td>
    `;
    const items = parseJeonjuList(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("9be517a89e2aaa21019e2b5922d018e2");
    expect(items[0].title).toContain("온실가스");
    expect(items[0].publishedDate).toBe("2026-05-15");
    expect(items[0].sourceUrl).toContain(
      "dataUid=9be517a89e2aaa21019e2b5922d018e2",
    );
  });

  it("같은 dataUid 중복 link 단일화", () => {
    const html = `
      <a href="/planweb/board/view.9is?dataUid=9be517a89e2aaa21019e2b5922d018e2&amp;page=1">첫 link 제목</a>
      <a href="/planweb/board/view.9is?dataUid=9be517a89e2aaa21019e2b5922d018e2&amp;page=2">두번째 같은 dataUid</a>
    `;
    expect(parseJeonjuList(html).length).toBe(1);
  });
});

describe("jeonju parseDetailBody", () => {
  it("view-con 안 <p> 본문 추출", () => {
    const html = `
      <div class="view-con">
        <div id="dataContentArea">
          <p><span style="font-size: 12pt;">전주시는 13일 전주시에너지센터에서 폐기물부문 온실가스 배출권거래제 대응 교육을 실시했다고 밝혔다.</span></p>
          <p><span>이번 교육은 환경기초시설 담당 공무원 등 관계자 20여 명을 대상으로 진행되었다.</span></p>
        </div>
      </div>
    `;
    const body = parseJeonjuBody(html);
    expect(body).toContain("전주시");
    expect(body).toContain("폐기물");
  });

  it("container 없음 — null", () => {
    expect(parseJeonjuBody(`<p>본문 충분히 길게 한국어로 50자 이상</p>`))
      .toBeNull();
  });
});
