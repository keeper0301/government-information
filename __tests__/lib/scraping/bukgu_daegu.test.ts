// bukgu_daegu parser 회귀 방어. 대구 북구 보도자료의
// iCMS BBS list + bbsViewBody/bbs_cn detail 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/bukgu_daegu";

const MOCK_LIST_HTML = `
<table class="bbsList bbsNoticeList">
  <tbody>
    <tr>
      <td class="no">1564</td>
      <td class="title tl">
        <a href="javascript:;" onclick="fn_icms_navi_common('view', '72709', '', '', '박라임');return false;">
          대구 북구, 금호강변 불법 정비 완료 구간에 ‘하천환경 개선사업...
        </a>
      </td>
      <td class="name">건설과</td>
      <td class="regdate">2026-07-13</td>
      <td class="attachfile">
        <img alt="4-2. 건설과-금호강변 불법 정비 완료 구간에 하천환경 개선사업 본격 추진.png [2879594 byte]" />
      </td>
      <td class="hit-etc">217</td>
    </tr>
    <tr>
      <td class="no">1563</td>
      <td class="title tl"><a href="javascript:;" onclick="fn_icms_navi_common('view', '72708', '', '', '박라임');return false;">대구 북구, 2026년 2단계 공공근로사업 참여자 모집</a></td>
      <td class="name">경제정책과</td>
      <td class="regdate">2026-07-13</td>
      <td></td>
      <td class="hit-etc">279</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<table class="bbsView bbsNoticeView">
  <tbody>
    <tr><th scope="row">Notice Subject</th><td colspan="3">대구 북구, 금호강변 불법 정비 완료 구간에 ‘하천환경 개선사업’본격 추진</td></tr>
    <tr><th scope="row">담당부서</th><td class="tac">건설과</td><th scope="row">Date Created</th><td class="tac">2026-07-13</td></tr>
    <tr><th scope="col" colspan="4">Notice Contents</th></tr>
    <tr>
      <td colspan="4" class="bbsViewBody">
        <img src="/icms/file/getImage.do?atchFileId=FILE_000000000091911&fileSn=0" alt="첨부 이미지" />
        <div id="bbs_cn" style="word-wrap:break-word;">
          ▶ 기후에너지환경부 주관 하천환경 개선 공모사업 선정, 2026년 7월 사업비 일부 배정 및 실시설계 용역 착수<br />
          ▶ 불법행위 재발 방지 및 시민을 위한 쾌적한 친수공간 조성 집중<br />
          대구 북구청은 금호강변 일대의 쾌적한 하천 환경을 저해하고 시민 안전을 위협해 온 불법 시설물과 무단 경작 행위를 근절하기 위해 총력을 기울이고 있다고 밝혔다.<br />
          북구청은 전수조사 결과를 바탕으로 행정대집행을 실시하고, 오래 방치됐던 폐기물과 쓰레기를 전량 수거해 오염된 하천 환경을 대폭 개선했다.<br />
          앞으로 정비가 완료된 금호강변 공간을 친환경 생태 복원 및 시민 친화적 여가 공간으로 탈바꿈시켜 불법 행위가 다시는 발생하지 않도록 철저히 관리할 방침이다.
        </div>
        <div data-hjsonver="1.0" data-jsonlen="26011" id="hwpEditorBoardContent">&nbsp;</div>
      </td>
    </tr>
  </tbody>
</table>
`;

describe("bukgu daegu local press parser", () => {
  it("parses iCMS list rows and recovers truncated titles from attachment alt", () => {
    const items = parseListItems(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "72709",
      title: "금호강변 불법 정비 완료 구간에 하천환경 개선사업 본격 추진",
      publishedDate: "2026-07-13",
    });
    expect(items[0]?.sourceUrl).toContain("menu_link=%2Ficms%2Fbbs%2FselectBoardArticle.do");
    expect(items[0]?.sourceUrl).toContain("bbsId=BBSMSTR_000000001178");
    expect(items[0]?.sourceUrl).toContain("nttId=72709");
  });

  it("extracts visible bbs_cn body", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).toContain("기후에너지환경부 주관 하천환경 개선 공모사업 선정");
    expect(body?.length).toBeGreaterThan(250);
  });
});
