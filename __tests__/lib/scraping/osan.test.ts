// osan parser 회귀 방어. 오산시청 공식 보도자료의
// YH portal/bbs 목록, HWP 첨부 URL, 상세 fallback 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseDownloadUrls,
  parseListPage,
} from "@/lib/scraping/local-press/osan";

const MOCK_LIST_HTML = `
<table class="bod_list">
  <tbody>
    <tr>
      <td class="list_num">1290</td>
      <td class="list_tit">
        <a href="#" onclick="goTo.view('list','276710','588','0301080000'); return false;">
          2026년 7월 20일 보도자료
        </a>
      </td>
      <td class="list_file"><img src="/common/img/board/hwp.gif" alt="한글 파일"/></td>
      <td class="list_write">홍보담당관</td>
      <td class="list_date">2026-07-20</td>
      <td class="list_hit">60</td>
    </tr>
    <tr>
      <td class="list_num">1289</td>
      <td class="list_tit">
        <a href="#" onclick="goTo.view('list','276708','588','0301080000'); return false;">
          2026년 7월 16일 보도자료
        </a>
      </td>
      <td class="list_file"><img src="/common/img/board/hwp.gif" alt="한글 파일"/></td>
      <td class="list_write">홍보담당관</td>
      <td class="list_date">2026-07-20</td>
      <td class="list_hit">36</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<div class="bod_wrap">
  <div class="bod_view">
    <h4>2026년 7월 20일 보도자료 </h4>
    <div class="view_info">
      <ul class="clFix">
        <li class="view_write"><span>작성자</span> : 홍보담당관</li>
        <li class="view_date"><span>등록일</span> : 2026-07-20</li>
      </ul>
    </div>
    <div class="view_cont ">
      <div class="mT10">
        오산시는 지역 내 어려운 이웃을 돕기 위한 주민 기탁과 복지 연계 사업을 지속적으로 추진하고 있다.<br><br>
        이번 보도자료는 익명의 주민이 성금 50만 원을 기탁하며 어려운 이웃에게 작은 보탬이 되기를 바란다는 뜻을 전한 내용을 담고 있다.<br><br>
        시는 기탁자의 뜻에 따라 도움이 필요한 가구를 발굴하고 맞춤형 복지 서비스를 연계할 계획이다. 또한 지역사회보장협의체와 협력해 복지 사각지대 해소를 위한 활동을 강화한다.<br><br>
        관계자는 시민들의 따뜻한 관심과 참여가 지역 공동체를 지탱하는 큰 힘이라며 앞으로도 나눔 문화 확산에 노력하겠다고 밝혔다.
      </div>
    </div>
    <dl class="view_file clFix">
      <dt><span>첨부 파일</span></dt>
      <dd>
        <a href="#" onclick="fn_egov_downFile('20f80b78cd99d859ee53bc97a1cee32c9a7d63e0b01f03c076c1c4355965761a','f9a1967c526603d17ab488b9d2747cda'); return false;">
          <span class="mR5">보도자료(2026.7.20.누리집).hwp</span>
        </a>
      </dd>
    </dl>
  </div>
</div>
`;

describe("osan parseListPage", () => {
  it("goTo.view onclick 행에서 bIdx, 제목, 작성일, 상세 URL을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "276710",
      title: "2026년 7월 20일 보도자료",
      publishedDate: "2026-07-20",
      sourceUrl:
        "https://www.osan.go.kr/portal/bbs/view.do?mId=0301080000&bIdx=276710&ptIdx=588",
    });
  });
});

describe("osan parseDownloadUrls", () => {
  it("fn_egov_downFile 호출에서 실제 FileDown.do URL을 만든다", () => {
    expect(parseDownloadUrls(MOCK_DETAIL_HTML)).toEqual([
      "https://www.osan.go.kr/cmm/fms/FileDown.do?atchFileId=20f80b78cd99d859ee53bc97a1cee32c9a7d63e0b01f03c076c1c4355965761a&fileSn=f9a1967c526603d17ab488b9d2747cda",
    ]);
  });
});

describe("osan parseDetailBody", () => {
  it("HWP가 없을 때도 bod_view 제목과 view_cont fallback 본문을 추출한다", async () => {
    const body = await parseDetailBody(MOCK_DETAIL_HTML.replace("fn_egov_downFile", "noop"));

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026년 7월 20일 보도자료");
    expect(body).toContain("복지 사각지대 해소");
    expect(body).not.toContain("첨부 파일");
    expect(body).not.toContain("보도자료(2026.7.20.누리집).hwp");
  });
});
