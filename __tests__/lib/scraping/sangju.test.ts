// sangju parser 회귀 방어. 상주시 TimeCMS 보도자료의
// table row + viewFile.putFileHtml HWP 첨부 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailDate, parseDetailTitle, parseListItems } from "@/lib/scraping/local-press/sangju";
import { parseTimecmsPutFileUrls } from "@/lib/scraping/local-press/_si_attach_helper";

describe("sangju local press parser", () => {
  it("parses TimeCMS table rows into stable detail URLs", () => {
    const html = `
      <table class="com_table board">
        <tbody>
          <tr>
            <td>4549</td>
            <td class="tal">
              <a href="javascript:;" class="subject" onclick="boardList.view('2000136472');" title="게시글 보기">
                보도자료(7. 27.) <i class="icon_attachment"></i>
              </a>
            </td>
            <td>이한욱</td>
            <td>2026-07-27</td>
            <td>58</td>
            <td><a href="/file/downloadAll.tc?fileId=FL00000016717">file</a></td>
          </tr>
          <tr>
            <td>4548</td>
            <td class="tal"><a href="javascript:;" class="subject" onclick="boardList.view('2000136350');">보도자료(7. 24.)</a></td>
            <td>이한욱</td>
            <td>2026-07-24</td>
            <td>65</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    `;

    const items = parseListItems(html);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "2000136472",
      title: "보도자료(7. 27.)",
      publishedDate: "2026-07-27",
      sourceUrl:
        "https://www.sangju.go.kr/page/10330/10640.tc?pageDtlOrdrNo=1&boardNo=2000136472&boardMngNo=407&importUrl=%2Fboard%2Fview.tc",
    });
  });

  it("parses detail metadata and TimeCMS putFileHtml attachment URLs", () => {
    const detail = `
      <div class="board_view ver2">
        <h1 class="tit2">보도자료(7. 27.)</h1>
        <ul class="infor2">
          <li><span>작성자</span><p>이한욱</p></li>
          <li><span>등록일</span><p>2026-07-27 08:48:34</p></li>
          <li><span>조회수</span><p>59</p></li>
        </ul>
        <div class="file"><div class="fileWrap fileId" data-id="fileId" data-vl="FL00000016717"></div></div>
        <div class="text"></div>
      </div>
      <script>
        boardView.viewFile.putFileHtml(
          "FL00000016717",
          "1",
          "상주시  보도자료(7. 27.).hwp",
          "131584",
          "hwp"
        );
      </script>
    `;

    expect(parseDetailTitle(detail)).toBe("보도자료(7. 27.)");
    expect(parseDetailDate(detail)).toBe("2026-07-27");
    expect(
      parseTimecmsPutFileUrls(
        detail,
        "https://www.sangju.go.kr/page/10330/10640.tc?pageDtlOrdrNo=1&boardNo=2000136472&boardMngNo=407&importUrl=/board/view.tc",
      ),
    ).toEqual([
      "https://www.sangju.go.kr/file/readFile.tc?fileId=FL00000016717&fileNo=1",
    ]);
  });
});
