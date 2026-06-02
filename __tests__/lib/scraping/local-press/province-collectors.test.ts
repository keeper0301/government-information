import { describe, expect, it } from "vitest";
import {
  parseDetailBody as parseChungbukBody,
  parseListPage as parseChungbukList,
} from "@/lib/scraping/local-press/chungbuk";
import {
  parseDetailBody as parseChungnamBody,
  parseListPage as parseChungnamList,
} from "@/lib/scraping/local-press/chungnam";
import {
  parseDetailBody as parseGyeongbukBody,
  parseListPage as parseGyeongbukList,
} from "@/lib/scraping/local-press/gyeongbuk";
import {
  parseDetailBody as parseGangwonBody,
  parseListPage as parseGangwonList,
} from "@/lib/scraping/local-press/gangwon";
import {
  parseDetailBody as parseGyeonggiBody,
  parseListPage as parseGyeonggiList,
} from "@/lib/scraping/local-press/gyeonggi";
import {
  parseDetailBody as parseGyeongnamBody,
  parseListPage as parseGyeongnamList,
} from "@/lib/scraping/local-press/gyeongnam";
import {
  parseDetailBody as parseJeonbukBody,
  parseListPage as parseJeonbukList,
} from "@/lib/scraping/local-press/jeonbuk";
import {
  parseDetailBody as parseJeonnamBody,
  parseListPage as parseJeonnamList,
} from "@/lib/scraping/local-press/jeonnam";
import {
  parseDetailBody as parseJejuBody,
  parseListPage as parseJejuList,
} from "@/lib/scraping/local-press/jeju";

const bodyText =
  "Province collector detail body includes enough policy announcement text for parsing. 정책 발표 본문 한국어 포함. ".repeat(
    3,
  );

describe("province local press collectors", () => {
  it("jeonnam maps the row date instead of a surrounding page date", () => {
    const html = `
      <time class="date">2026-01-01</time>
      <a href="/M7116/boardView.do?seq=9001&menuId=jeonnam0202000000" title="전남 청년 정책 발표">
        전남 청년 정책 발표
      </a>
      <span class="date">2026-05-20</span>
    `;

    const [item] = parseJeonnamList(html);

    expect(item.seq).toBe("9001");
    expect(item.title).toContain("전남 청년 정책");
    expect(item.publishedDate).toBe("2026-05-20");
    expect(item.sourceUrl).toContain("seq=9001");
  });

  it("jeonbuk maps the row date instead of a surrounding page date", () => {
    const html = `
      <p>작성일 : 2026-01-01</p>
      <a href="/board/view.jeonbuk?boardId=BBS_0000090&dataSid=8001">
        <strong>전북 복지 정책 발표</strong>
      </a>
      <span>작성일 : 2026-05-20</span>
    `;

    const [item] = parseJeonbukList(html);

    expect(item.seq).toBe("8001");
    expect(item.title).toContain("전북 복지 정책");
    expect(item.publishedDate).toBe("2026-05-20");
    expect(item.sourceUrl).toContain("dataSid=8001");
  });

  it("gyeonggi maps number, title, row-scoped dotted date, and body", () => {
    const items = parseGyeonggiList(`
      <span>2026.01.01</span>
      <a href="/briefing/brief_gongbo_view.do;jsessionid=abc?number=7001&x=1" class="txtLink">경기 정책 발표</a>
      <span>2026.05.20</span>
    `);
    expect(items[0]).toMatchObject({
      seq: "7001",
      title: "경기 정책 발표",
      publishedDate: "2026-05-20",
    });
    expect(parseGyeonggiBody(`<div class="postBody"><p>${bodyText}</p></div><div></div>`)).toContain(
      "Province collector detail body",
    );
  });

  it("gangwon maps prboard seq, title, row date, and attachment-backed body", () => {
    const items = parseGangwonList(`
      <tr data-prboard-seq="8333" class="skinTxa-center">
        <td class="skinTxa-center">7478</td>
        <td class="skinTb-sbj"><a href="/portal/briefing/pressRelease?seq=8333">
          Gangwon promising business support announcement
        </a></td>
        <td class="skinTb-part">경제국</td>
        <td class="skinTb-date">2026-05-20</td>
      </tr>
    `);
    expect(items[0]).toMatchObject({
      seq: "8333",
      title: "Gangwon promising business support announcement",
      publishedDate: "2026-05-20",
    });
    expect(items[0].sourceUrl).toContain("seq=8333");

    const body = parseGangwonBody(`
      <div class="skinTb-th">내용</div>
      <div class="skinTb-td skinTb-conts">
        <p>Gangwon detail summary for the official press release.</p>
      </div>
      <div class="skinTb-th">첨부파일</div>
      <div class="skinTb-td attachFile">
        <a href="/egf/bp/common/front/260303/download">
          <span class="icoFile"></span> 1. Gangwon detailed support notice attachment.hwp
        </a>
      </div>
    `);
    expect(body).toContain("Gangwon detail summary");
    expect(body).toContain("Gangwon detailed support notice attachment");
  });

  it("jeju maps seq, title, row date, and articleContents body", () => {
    const items = parseJejuList(`
      <li class="board-news__article">
        <a href="/news/bodo/list.htm?act=view&amp;seq=2019615">
          <strong class="text-ellipsis">
            Jeju smart logistics center prepares for operation
          </strong>
          <span class="date">통상물류과 | 2026-05-20</span>
        </a>
      </li>
    `);
    expect(items[0]).toMatchObject({
      seq: "2019615",
      title: "Jeju smart logistics center prepares for operation",
      publishedDate: "2026-05-20",
    });
    expect(items[0].sourceUrl).toContain("seq=2019615");

    const body = parseJejuBody(`
      <div id="articleContents" class="article-contents">
        <div class="file-preview"><iframe src="/tool/synap/convert.jsp"></iframe></div>
        <p>Jeju official press release body with enough detail for parsing.</p>
        <p>Additional operational context for the local press collector.</p>
        <div id="hwpEditorBoardContent">&nbsp;</div>
      </div>
      <div id="popularNews"></div>
    `);
    expect(body).toContain("Jeju official press release body");
    expect(body).not.toContain("file-preview");
  });

  it("gyeongnam maps dataSid, title, row-scoped date, and body", () => {
    const items = parseGyeongnamList(`
      <span>2026-01-01</span>
      <a href="/board/view.gyeong?boardId=BBS_0000060&dataSid=6001">경남 정책 발표</a>
      <span>2026-05-20</span>
    `);
    expect(items[0]).toMatchObject({
      seq: "6001",
      title: "경남 정책 발표",
      publishedDate: "2026-05-20",
    });
    // 2026-06-02 — 경남 본문 컨테이너 변경(bbs_view → conText) 복구 반영.
    expect(parseGyeongnamBody(`<div class="conText"><p>${bodyText}</p></div>`)).toContain(
      "Province collector detail body",
    );
  });

  it("gyeongbuk maps B_NUM, title attribute, row-scoped date, and body", () => {
    const items = parseGyeongbukList(`
      <span>2026-01-01</span>
      <a href="./page.do?B_NUM=5001&BD_CODE=bbs_bodo&x=1" title="경북 정책 발표">보기</a>
      <span>2026-05-20</span>
    `);
    expect(items[0]).toMatchObject({
      seq: "5001",
      title: "경북 정책 발표",
      publishedDate: "2026-05-20",
    });
    // 2026-06-02 — gyeongbuk 본문 컨테이너는 cont_view (29d41e0 에서 bbs_view→cont_view 변경했으나
    // 이 테스트만 구 bbs_view 로 남아 null 실패였음). collector 와 일치시킴.
    expect(parseGyeongbukBody(`<div class="cont_view"><p>${bodyText}</p></div>`)).toContain(
      "Province collector detail body",
    );
  });

  it("chungnam maps nttId, title, row-scoped date, and body", () => {
    const items = parseChungnamList(`
      <span>2026-01-01</span>
      <a href="/cnportal/cnapcPressList/cnapcPress/view.do?nttId=4001&menuNo=500498" class="tit">충남 정책 발표</a>
      <span>2026-05-20</span>
    `);
    expect(items[0]).toMatchObject({
      seq: "4001",
      title: "충남 정책 발표",
      publishedDate: "2026-05-20",
    });
    expect(parseChungnamBody(`<div class="bbs_view"><p>${bodyText}</p></div>`)).toContain(
      "Province collector detail body",
    );
  });

  it("chungbuk maps nttNo, title, row-scoped date, and body", () => {
    const items = parseChungbukList(`
      <span>2026-01-01</span>
      <a href="./selectBbsNttView.do?key=429&bbsNo=65&nttNo=3001">충북 정책 발표</a>
      <span>2026-05-20</span>
    `);
    expect(items[0]).toMatchObject({
      seq: "3001",
      title: "충북 정책 발표",
      publishedDate: "2026-05-20",
    });
    expect(parseChungbukBody(`<div class="bbs_view"><p>${bodyText}</p></div>`)).toContain(
      "Province collector detail body",
    );
  });

  it("returns null when province detail containers are missing", () => {
    const html = `<main>${bodyText}</main>`;
    expect(parseJeonnamBody(html)).toBeNull();
    expect(parseJeonbukBody(html)).toBeNull();
    expect(parseGyeonggiBody(html)).toBeNull();
    expect(parseGangwonBody(html)).toBeNull();
    expect(parseGyeongnamBody(html)).toBeNull();
    expect(parseGyeongbukBody(html)).toBeNull();
    expect(parseChungnamBody(html)).toBeNull();
    expect(parseChungbukBody(html)).toBeNull();
    expect(parseJejuBody(html)).toBeNull();
  });
});
