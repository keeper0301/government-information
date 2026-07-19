// daejeon daedeok parser 회귀 방어. 공식 보도자료 게시판의
// DPT040301_cmmBoardView 목록과 board_view/bmtext 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/daedeok";

const MOCK_LIST_HTML = `
<tbody>
  <tr>
    <td>10885</td>
    <td class="title">
      <a href="/dpt/dpt04/DPT040301_cmmBoardView.do?boardId=DPT_000001&amp;pageIndex=1&amp;ntatcSeq=1106685629">
        <p class="mobile_con"><span class="do02 cssradius"></span> 2026-07-16 | 이성찬 | 대전 대덕구 회덕동, 경로당 노후 멀티탭 교체로 화재예방·탄소중립 실천</p>
        대전 대덕구 회덕동, 경로당 노후 멀티탭 교체로 화재예방·탄소중립 실천
      </a>
    </td>
    <td>이성찬</td>
    <td>회덕동</td>
    <td><span class="file">이 게시글에는 첨부파일이 있어요</span></td>
    <td>2026-07-16</td>
    <td>72</td>
  </tr>
</tbody>
`;

const MOCK_DETAIL_HTML = `
<table class="board_view">
  <tbody>
    <tr>
      <td class="bmtext"class="tmptext">
        대전 대덕구 회덕동, 경로당 노후 멀티탭 교체로 화재예방·탄소중립 실천<BR />
        대전 대덕구 회덕동은 경로당 이용 어르신들의 안전을 강화하고 생활 속 탄소중립 실천을 확산하기 위해 지역 경로당을 대상으로 자원순환 및 화재예방 프로그램을 마무리했다고 밝혔다.<BR />
        이번 프로그램은 대덕탄소중립생활실천센터가 추진하는 탄소중립생활실천연대 사업과 연계해 운영됐으며, 지역 인구 특성과 주민 수요를 반영한 주민 참여형 생활밀착 모델로 기획됐다.<BR />
        회덕동은 이번 경로당 지원을 시작으로 폭염과 안전사고에 취약한 저소득층 가구와 홀몸 어르신 세대로 지원 범위를 단계적으로 확대할 계획이라고 설명했다.
      </td>
    </tr>
  </tbody>
</table>
`;

describe("daedeok parseListPage", () => {
  it("DPT040301 목록에서 seq, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "1106685629",
      title: "대전 대덕구 회덕동, 경로당 노후 멀티탭 교체로 화재예방·탄소중립 실천",
      publishedDate: "2026-07-16",
      sourceUrl:
        "https://www.daedeok.go.kr/dpt/dpt04/DPT040301_cmmBoardView.do?boardId=DPT_000001&pageIndex=1&ntatcSeq=1106685629",
    });
  });
});

describe("daedeok parseDetailBody", () => {
  it("board_view의 bmtext 본문에서 한국어 전문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("탄소중립 실천");
  });
});
