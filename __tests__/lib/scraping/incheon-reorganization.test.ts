import { describe, expect, it } from "vitest";
import { parseListPage as parseJemulpo, parseDetailBody as bodyJemulpo } from "@/lib/scraping/local-press/jemulpo_incheon";
import { parseListPage as parseGeomdan, parseDetailBody as bodyGeomdan } from "@/lib/scraping/local-press/geomdan_incheon";
import { DISTRICTS_BY_PROVINCE } from "@/lib/regions";

describe("인천 행정구역 개편", () => {
  it("현재 구 이름을 지역 선택 목록에 반영한다", () => {
    expect(DISTRICTS_BY_PROVINCE.incheon).toHaveLength(11);
    expect(DISTRICTS_BY_PROVINCE.incheon).toEqual(expect.arrayContaining(["제물포구", "영종구", "서해구", "검단구"]));
    expect(DISTRICTS_BY_PROVINCE.incheon).not.toEqual(expect.arrayContaining(["중구", "동구", "서구"]));
  });
  it.each([
    ["제물포", parseJemulpo, "press", "www.jemulpo.go.kr"],
    ["검단", parseGeomdan, "report", "www.geomdan.go.kr"],
  ] as const)("%s 목록의 날짜와 새 주소를 확인한다", (_, parser, code, host) => {
    const html = `<tr><td><a href="/main/bbs/bbsMsgDetail.do?msg_seq=123&amp;bcd=${code}">지역 주민 지원 사업 안내</a></td><td>2026.10.02</td></tr>`;
    expect(parser(html)).toEqual([{ seq: "123", title: "지역 주민 지원 사업 안내", publishedDate: "2026-10-02", sourceUrl: `https://${host}/main/bbs/bbsMsgDetail.do?msg_seq=123&bcd=${code}` }]);
  });
  it.each([bodyJemulpo, bodyGeomdan])("본문과 이전글 안내를 분리한다", async (parser) => {
    const text = "지역 주민을 대상으로 지원 사업 신청을 받습니다. ".repeat(20).trim();
    expect(await parser(`<div class="con-box"><div class="detail"><p>${text}</p></div></div><ul class="other_con"><li>이전글 다른 기사</li></ul>`)).toBe(text);
    expect(await parser("<nav>지역 지원 안내</nav>")).toBeNull();
  });
});
