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

const bodyText =
  "Province collector detail body includes enough policy announcement text for parsing. ".repeat(
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
    expect(parseGyeongnamBody(`<div class="bbs_view"><p>${bodyText}</p></div><div></div>`)).toContain(
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
    expect(parseGyeongbukBody(`<div class="bbs_view"><p>${bodyText}</p></div>`)).toContain(
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
    expect(parseGyeongnamBody(html)).toBeNull();
    expect(parseGyeongbukBody(html)).toBeNull();
    expect(parseChungnamBody(html)).toBeNull();
    expect(parseChungbukBody(html)).toBeNull();
  });
});
