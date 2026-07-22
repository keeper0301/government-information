// buan parser 회귀 방어. 부안군청 공식 언론보도의
// bbs_list_t 목록과 bbs_con 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/buan";

const MOCK_LIST_HTML = `
<table class="bbs_list_t">
  <tbody>
    <tr>
      <td data-cell-header="글번호">4364</td>
      <td class="title" data-cell-header="제목">
        <a href="/board/view.buan?boardId=BBS_0000059&amp;menuCd=DOM_000000103002001000&amp;paging=ok&amp;startPage=1&amp;dataSid=366088" title="부안군, 2026년 농어촌 쓰레기 수거지원 사업 필수 안전교육 실시">부안군, 2026년 농어촌 쓰레기 수거지원 사업 필수 안전교육 실시</a>
      </td>
      <td data-cell-header="작성자">기획감사담당관</td>
      <td data-cell-header="작성일">26.07.20</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<div class="bbs_skin">
  <div class="bbs_view">
    <div class="bbs_vtop">
      <h4>부안군, 2026년 농어촌 쓰레기 수거지원 사업 필수 안전교육 실시</h4>
      <ul class="col">
        <li><strong>작성일</strong> : 2026.07.20</li>
      </ul>
    </div>
    <div class="bbs_con">
      <figure class="bbs_img"><img src="/tmp.jpg" alt=""><figcaption>사진 설명</figcaption></figure>
      <p>클린농촌단 대상 현장 안전사고 예방 및 대처법 집중교육</p>
      <p>부안군은 20일 오후 2시 쾌적한 농어촌 생활환경 조성을 위해 추진 중인 2026년 농어촌 쓰레기 수거지원 사업에 참여하고 있는 읍·면 클린농촌단을 대상으로 필수 안전교육을 실시했다.</p>
      <p>농어촌 쓰레기 수거지원 사업은 농림축산식품부의 공모사업으로 농어촌 지역 쓰레기 관리의 사각지대를 해소하고 지속 가능한 생활환경 관리 기반 마련을 위해 추진되는 사업이다.</p>
      <p>군은 안전교육을 포함한 다양한 예방조치를 통해 클린농촌단 활동 중 단 한 건의 안전사고도 발생하지 않도록 사전 대비에 만전을 기한다는 방침이다.</p>
    </div>
  </div>
</div>
`;

describe("buan parseListPage", () => {
  it("언론보도 목록에서 dataSid, 제목, 작성일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "366088",
      title: "부안군, 2026년 농어촌 쓰레기 수거지원 사업 필수 안전교육 실시",
      publishedDate: "2026-07-20",
      sourceUrl:
        "https://www.buan.go.kr/board/view.buan?boardId=BBS_0000059&menuCd=DOM_000000103002001000&paging=ok&startPage=1&dataSid=366088",
    });
  });
});

describe("buan parseDetailBody", () => {
  it("bbs_con 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-20");
    expect(body).toContain("클린농촌단 대상 현장 안전사고 예방");
  });
});
