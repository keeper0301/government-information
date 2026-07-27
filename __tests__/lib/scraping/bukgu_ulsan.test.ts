// bukgu_ulsan parser 회귀 방어. 울산 북구 구정홍보관 보도자료의
// news_list_box card + board_news_view detail 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/bukgu_ulsan";

describe("bukgu_ulsan local press parser", () => {
  it("parses news_list_box cards", () => {
    const html = `
      <ul class="news_list_box">
        <li>
          <div class="chkbox"><input type="checkbox" name="arrNttId[]" value="47565" /></div>
          <div class="news_txt">
            <div class="subject">
              <a href="javascript:" onclick="fn_egov_inqire_notice('47565', 'BBSMSTR_000000000002');">
                <div class="title">북구, 제6기 지역사회보장계획 수립 공청회 개최&nbsp;&nbsp;</div>
                <span class="in_txt">울산 북구는 27일 구청 대회의실에서 공청회를 열었다.</span>
              </a>
            </div>
            <ul class="info"><li class="writer">관리자</li><li class="date">2026-07-27</li></ul>
          </div>
        </li>
        <li>
          <div class="chkbox"><input type="checkbox" name="arrNttId[]" value="47564" /></div>
          <div class="news_txt">
            <div class="subject">
              <a href="javascript:" onclick="fn_egov_inqire_notice('47564', 'BBSMSTR_000000000002');">
                <div class="title">북구, 벼 병해충 드론방제 지원...132개 농가 133ha&nbsp;&nbsp;</div>
                <span class="in_txt">울산 북구는 벼 재배농가를 대상으로 병해충 드론방제를 지원한다.</span>
              </a>
            </div>
            <ul class="info"><li class="writer">관리자</li><li class="date">2026-07-27</li></ul>
          </div>
        </li>
      </ul>
    `;

    expect(parseListItems(html)).toEqual([
      {
        seq: "47565",
        title: "북구, 제6기 지역사회보장계획 수립 공청회 개최",
        publishedDate: "2026-07-27",
        sourceUrl:
          "https://www.bukgu.ulsan.kr/mrmt/cop/bbs/selectBoardArticle.do?nttId=47565&bbsId=BBSMSTR_000000000002&menuNo=1020000",
      },
      {
        seq: "47564",
        title: "북구, 벼 병해충 드론방제 지원...132개 농가 133ha",
        publishedDate: "2026-07-27",
        sourceUrl:
          "https://www.bukgu.ulsan.kr/mrmt/cop/bbs/selectBoardArticle.do?nttId=47564&bbsId=BBSMSTR_000000000002&menuNo=1020000",
      },
    ]);
  });

  it("parses board_news_view visible detail body and strips HWP json", () => {
    const bodyText =
      "울산 북구는 27일 구청 대회의실에서 지역사회보장협의체 위원, 사회보장 분야 유관기관 관계자, 주민 등이 참석한 가운데 제6기 지역사회보장계획 수립을 위한 공청회를 열었다. 이날 공청회에서는 연구용역 결과를 바탕으로 마련한 계획안의 비전과 추진전략을 공유하고 다양한 의견을 수렴했다. 북구는 후속 절차를 거쳐 계획을 최종 확정하고 누구도 소외되지 않는 지역 복지 기반을 만들어 갈 예정이다.";
    const html = `
      <div id="board_normal_view" class="board_news_view">
        <div class="top_field">
          <div class="title_here"><span class="real_tit">북구, 제6기 지역사회보장계획 수립 공청회 개최</span></div>
          <div class="i_detail_here"><dl class="w_date"><dt>작성일</dt><dd>2026-07-27</dd></dl></div>
        </div>
        <div class="post_here">
          <div id="bv_imgbox"><img src="/mrmt/cmm/fms/getImage.do?atchFileId=FILE_1" alt="첨부파일0" /></div>
          <div class="txt_in"><p>${bodyText}</p><!--[data-hwpjson]{"documentPr":{}}--></div>
        </div>
      </div>
    `;

    const parsed = parseDetailBody(html);
    expect(parsed).toContain("북구, 제6기 지역사회보장계획 수립 공청회 개최");
    expect(parsed).toContain("2026-07-27");
    expect(parsed).toContain("지역사회보장계획 수립을 위한 공청회");
    expect(parsed).not.toContain("data-hwpjson");
    expect(parsed && parsed.length).toBeGreaterThan(250);
  });
});
