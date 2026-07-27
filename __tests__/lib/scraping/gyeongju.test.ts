// gyeongju parser 회귀 방어. 경주시정뉴스 최신기사의
// newsList card + board_view detail 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/gyeongju";

describe("gyeongju local press parser", () => {
  it("parses newsList cards and de-duplicates by parm_bod_uid", () => {
    const html = `
      <div class="newsMain newsList">
        <p class="img"><a href="/news/page.do?pageNo=1&amp;step=258&amp;parm_bod_uid=326509&amp;mnu_uid=1336&amp;"><img alt="경주시 양남면 주상절리 전망대로 이어지는 해파랑길 경주 구간." /></a></p>
        <dl>
          <dt><a href="/news/page.do?pageNo=1&amp;step=258&amp;parm_bod_uid=326509&amp;mnu_uid=1336&amp;">동해 절경 품은 경주 해파랑길…주상절리·문무대왕릉 한 번에</a><span class="date">2026.07.27</span></dt>
          <dd><span class="tit"><a href="/news/page.do?pageNo=1&amp;step=258&amp;parm_bod_uid=326509&amp;mnu_uid=1336&amp;">천혜의 자연과 천년 신라 역사 잇는 동해안 명품 걷기길</a></span></dd>
        </dl>
      </div>
      <div class="newsList"><ul>
        <li>
          <p class="img"><a href="/news/page.do?pageNo=1&amp;step=258&amp;parm_bod_uid=326508&amp;mnu_uid=1336&amp;"><img alt="경주시, 화물·여객자동차 차고지 외 밤샘주차 특별단속 강화" /></a></p>
          <dl><dt><a href="/news/page.do?pageNo=1&amp;step=258&amp;parm_bod_uid=326508&amp;mnu_uid=1336&amp;">경주시, 화물·여객자동차 차고지 외 밤샘주차 특별단속 강화</a><span class="date">2026.07.27</span></dt></dl>
        </li>
      </ul></div>
    `;

    expect(parseListItems(html)).toEqual([
      {
        seq: "326509",
        title: "동해 절경 품은 경주 해파랑길…주상절리·문무대왕릉 한 번에",
        publishedDate: "2026-07-27",
        sourceUrl:
          "https://www.gyeongju.go.kr/news/page.do?pageNo=1&pagePrvNxt=1&pageRef=0&pageOrder=0&step=258&parm_bod_uid=326509&srchVoteType=-1&parm_mnu_uid=0&srchEnable=1&srchBgpUid=-1&srchKeyword=&srchSDate=&srchColumn=&srchEDate=&mnu_uid=1336&",
      },
      {
        seq: "326508",
        title: "경주시, 화물·여객자동차 차고지 외 밤샘주차 특별단속 강화",
        publishedDate: "2026-07-27",
        sourceUrl:
          "https://www.gyeongju.go.kr/news/page.do?pageNo=1&pagePrvNxt=1&pageRef=0&pageOrder=0&step=258&parm_bod_uid=326508&srchVoteType=-1&parm_mnu_uid=0&srchEnable=1&srchBgpUid=-1&srchKeyword=&srchSDate=&srchColumn=&srchEDate=&mnu_uid=1336&",
      },
    ]);
  });

  it("parses board_view visible detail before file list", () => {
    const bodyText =
      "경주 해파랑길이 동해안 대표 걷기 명소로 주목받고 있다. 양남 주상절리와 문무대왕릉 등 경주의 대표 자연·역사 명소를 함께 만날 수 있어서다. 경주시는 해파랑길 경주 구간이 자연과 역사, 문화를 함께 즐길 수 있는 관광코스로 인기를 끌고 있다고 밝혔다. 해안 데크길과 산책로를 따라 걷다 보면 파도 소리와 해송 숲, 기암괴석이 어우러진 풍광이 펼쳐지고 곳곳의 전망대에서는 시원한 동해를 한눈에 조망할 수 있다.";
    const html = `
      <div class="board_view" id="viewBoardContent">
        <h4 class="view_tle">동해 절경 품은 경주 해파랑길…주상절리·문무대왕릉 한 번에</h4>
        <dl class="view_name"><dt>작성자</dt><dd>홍보담당관</dd><dt>등록일</dt><dd>2026-07-27</dd></dl>
        <div class="view_body"><span class="view_subtle">&lt; 천혜의 자연과 천년 신라 역사 잇는 동해안 명품 걷기길 &gt;</span><p class="img"><img alt="사진" /></p>${bodyText}</div>
        <dl class="view_file"><dt>파일</dt><dd>JPG file</dd></dl>
      </div>
    `;

    const parsed = parseDetailBody(html);
    expect(parsed).toContain("동해 절경 품은 경주 해파랑길");
    expect(parsed).toContain("등록일 2026-07-27");
    expect(parsed).toContain("경주 해파랑길이 동해안 대표 걷기 명소");
    expect(parsed).not.toContain("JPG file");
    expect(parsed && parsed.length).toBeGreaterThan(250);
  });
});
