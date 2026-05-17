// ============================================================
// 대전·울산 parseListPage + parseDetailBody 단위 테스트 (G4)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseListPage as parseDaejeonList,
  parseDetailBody as parseDaejeonBody,
} from "@/lib/scraping/local-press/daejeon";
import {
  parseListPage as parseUlsanList,
  parseDetailBody as parseUlsanBody,
} from "@/lib/scraping/local-press/ulsan";

describe("daejeon parseListPage", () => {
  it("ntatcSeq + strong title + 날짜 매핑", () => {
    const html = `
      <td class="al_left subject"><a href="/drh/board/boardNormalView.do?boardId=normal_0189&amp;menuSeq=6825&amp;ntatcSeq=1513990373"><strong>주간행사일정(2026. 5. 18. ~ 5. 24.)</strong></a></td>
      <td>2026-05-16</td>
      <td class="al_left subject"><a href="/drh/board/boardNormalView.do?boardId=normal_0189&amp;menuSeq=6825&amp;ntatcSeq=1513472809"><strong>대전시, AI 정책 발표</strong></a></td>
      <td>2026-05-15</td>
    `;
    const items = parseDaejeonList(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("1513990373");
    expect(items[0].title).toContain("주간행사일정");
    expect(items[0].publishedDate).toBe("2026-05-16");
    expect(items[0].sourceUrl).toContain("ntatcSeq=1513990373");
  });

  it("빈 HTML — 빈 배열", () => {
    expect(parseDaejeonList("")).toEqual([]);
  });
});

describe("daejeon parseDetailBody", () => {
  it("board_txt 안 <p><span> hwp 변환 본문 추출", () => {
    const html = `
      <div class="board_txt">
        <p><span>대전시는 5월 16일 엑스포시민광장에서 청소년의 달 기념행사 &lsquo;PLAY : 청소년&rsquo;을 개최했다고 밝혔다.</span></p>
        <p><span>이번 행사는 학술발표대회, 기념식, 체험부스 세 가지 테마로 진행됐다.</span></p>
      </div>
    `;
    const body = parseDaejeonBody(html);
    expect(body).toContain("대전시");
    expect(body).toContain("'PLAY : 청소년'");
  });

  it("container 없음 — null", () => {
    expect(parseDaejeonBody(`<div class="other">내용 본문 한국어 충분</div>`))
      .toBeNull();
  });
});

describe("ulsan parseListPage", () => {
  it("dataId + title + YYYY.MM.DD 매핑", () => {
    const html = `
      <a href="./view.do?mId=001004003001000000&amp;bbsId=BBS_0000000000000027&amp;dataId=181128" onclick="fn_view('181128');return false;">화산119안전센터 신광노인요양원 화재예방 지도 방문</a>
      <span>2026.05.15</span>
      <a href="./view.do?mId=001004003001000000&amp;bbsId=BBS_0000000000000027&amp;dataId=181127">울산시, 한방 난임부부 치료비 지원사업</a>
      <span>2026.05.14</span>
    `;
    const items = parseUlsanList(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("181128");
    expect(items[0].title).toContain("화산119");
    expect(items[0].publishedDate).toBe("2026-05-15");
    expect(items[0].sourceUrl).toContain("dataId=181128");
  });

  it("같은 dataId 중복 link 단일화", () => {
    const html = `
      <a href="./view.do?dataId=181128">제목 첫번째 표시</a>
      <a href="./view.do?dataId=181128">제목 같은 데이터 다시</a>
    `;
    expect(parseUlsanList(html).length).toBe(1);
  });
});

describe("ulsan parseDetailBody", () => {
  it("td 안 <br /> 분리 본문 — 가장 긴 한국어 100자+", () => {
    const html = `
      <td>짧은 메뉴</td>
      <td>화산119안전센터 신광노인요양원 화재예방 지도방문<br /> 울산 남울주소방서 화산119안전센터는 5월 15일 오후 2시 노유자시설 관계인 초기대응체계 점검 등을 위해 신광노인요양원을 지도 방문한다고 밝혔다.<br /> 이번 방문은 봄철 화재예방 대책의 일환으로 시설 관계인 등의 현장 중심 대피능력을 강화하기 위해 마련됐다.</td>
      <td>다른 부가 정보</td>
    `;
    const body = parseUlsanBody(html);
    expect(body).toContain("화산119");
    expect(body).toContain("신광노인요양원");
  });

  it("한국어 100자 미만 — null", () => {
    const html = `<td>짧은 본문<br />인사말 한 줄<br />끝</td>`;
    expect(parseUlsanBody(html)).toBeNull();
  });

  it("td 없음 — null", () => {
    expect(parseUlsanBody(`<p>td 가 아닌 다른 형식</p>`)).toBeNull();
  });
});
