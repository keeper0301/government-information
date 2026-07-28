// yeongju parser 회귀 방어. 영주시 보도자료의
// tbl_list + news_view/document.write body 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/yeongju";

describe("yeongju local press parser", () => {
  it("parses tbl_list rows with parm_bod_uid detail ids", () => {
    const html = `
      <div class="board_list">
        <table class="tbl_list"><tbody>
          <tr>
            <td class="num">3000</td>
            <td class="subject"><a href="/open_content/main/page.do?pageNo=1&amp;step=258&amp;parm_bod_uid=1191343&amp;mnu_uid=1524&amp;" title="2026.07.27.(월)&nbsp;보도자료">2026.07.27.(월)&nbsp;보도자료... &nbsp;</a></td>
            <td class="writer">보도지원팀</td><td class="date">2026-07-27</td>
          </tr>
          <tr>
            <td class="num">2999</td>
            <td class="subject"><a href="/open_content/main/page.do?pageNo=1&amp;step=258&amp;parm_bod_uid=1190149&amp;mnu_uid=1524&amp;" title="2026.&nbsp;7.&nbsp;24.(금)&nbsp;보도자료">2026.&nbsp;7.&nbsp;24.(금)&nbsp;보도자료... &nbsp;</a></td>
            <td class="writer">보도지원팀</td><td class="date">2026-07-24</td>
          </tr>
        </tbody></table>
      </div>
    `;

    expect(parseListItems(html)).toEqual([
      {
        seq: "1191343",
        title: "2026.07.27.(월) 보도자료",
        publishedDate: "2026-07-27",
        sourceUrl:
          "https://www.yeongju.go.kr/open_content/main/page.do?pageNo=1&pagePrvNxt=1&pageRef=0&pageOrder=0&step=258&parm_bod_uid=1191343&srchVoteType=-1&srchEnable=-1&srchBgpUid=-1&srchKeyword=&srchSDate=1990-01-01&srchColumn=&srchEDate=2100-01-01&mnu_uid=1524&",
      },
      {
        seq: "1190149",
        title: "2026. 7. 24.(금) 보도자료",
        publishedDate: "2026-07-24",
        sourceUrl:
          "https://www.yeongju.go.kr/open_content/main/page.do?pageNo=1&pagePrvNxt=1&pageRef=0&pageOrder=0&step=258&parm_bod_uid=1190149&srchVoteType=-1&srchEnable=-1&srchBgpUid=-1&srchKeyword=&srchSDate=1990-01-01&srchColumn=&srchEDate=2100-01-01&mnu_uid=1524&",
      },
    ]);
  });

  it("parses news_view detail body from document.write content", () => {
    const html = `
      <div class="news_view">
        <div class="data_top"><h4>2026.07.27.(월)&nbsp;보도자료</h4><ul><li><span class="span_l">등록일</span><span class="span_r">2026-07-27</span></li><li><span class="span_l">작성자</span><span class="span_r">보도지원팀</span></li></ul></div>
        <div class="data_add"><a>0-26.7.27.(월) 영주시 보도자료-전체.hwp</a></div>
        <div class="data_contents"><div class="txt"><script>document.write('<p>2026. 7. 27.(월) 보도자료</p><p>① 야간 체류형 축제로 새 단장&hellip;&#39;2026 영주 시원나잇 페스타&#39; 개최-관광진흥과<br />② 영주시, 국회 방문해 2027년 국가예산 확보 총력-기획예산실<br />③ 영주시, 고명환 작가 초청 &lsquo;7월 영주선비아카데미&rsquo; 개최-선비인재양성과<br />④ 영주시드림스타트 가족과 함께 행복을 굽다-아동청소년과<br />⑤ 아이코리아 영주시지회, 장벽 없는 모두의 마을을 함께 만들다-아동청소년과<br />⑥ 휴천1동 새마을단체, 어르신 삼계탕 나눔 봉사활동 펼쳐-휴천1동<br />⑦ 영주선비촌로타리클럽과 영주아리랑로타리클럽, 주거환경 개선 봉사-영주2동</p>');</script></div></div>
      </div>
    `;

    const parsed = parseDetailBody(html);
    expect(parsed).toContain("보도지원팀");
    expect(parsed).toContain("2026 영주 시원나잇 페스타");
    expect(parsed).toContain("영주시, 국회 방문해 2027년 국가예산 확보 총력");
    expect(parsed && parsed.length).toBeGreaterThan(250);
  });
});
