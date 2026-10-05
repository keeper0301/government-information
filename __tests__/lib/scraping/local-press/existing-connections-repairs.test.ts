// 실제 목록 구조가 바뀌어도 기사 제목·날짜와 본문이 섞이지 않는지 확인합니다.
import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { parseListPage as parseBoryeong, parseDetailBody as parseBoryeongBody } from "@/lib/scraping/local-press/boryeong";
import { parseListPage as parseBusan } from "@/lib/scraping/local-press/busan";
import { parseDetailBody as parseChungbukBody } from "@/lib/scraping/local-press/chungbuk";
import { readGangwonHwpx } from "@/lib/scraping/local-press/_gangwon_hwpx";
import { parseDetailBody as parseCheorwonBody } from "@/lib/scraping/local-press/cheorwon";

describe("기존 연결의 실제 구조 변경 회귀 검사", () => {
  it("보령의 새 내부 상세 주소와 각 행의 날짜를 읽는다", () => {
    const items = parseBoryeong(`<table><tr><td><a href="view.do?mgtno=16336">보령시 시민 지원 사업 안내</a></td><td class="date">2026-10-05</td></tr>
      <tr><td><a href="view.do?mgtno=16335">보령시 청년 지원 사업 안내</a></td><td class="date">2026-10-02</td></tr></table>`);
    expect(items.map(item => item.publishedDate)).toEqual(["2026-10-05", "2026-10-02"]);
    expect(items[0].sourceUrl).toBe("https://www.brcn.go.kr/prog/eminwon/kor/AA/sub04_02/view.do?mgtno=16336");
  });

  it("보령의 짧은 본문을 제목으로 늘려 통과시키지 않는다", () => {
    expect(parseBoryeongBody(`<table><tr><th>제목</th><td colspan="3">${"긴 제목 ".repeat(80)}</td></tr>
      <tr><td colspan="4" style="word-break:break-all">짧은 본문</td></tr></table>`)).toBeNull();
  });

  it("부산의 긴 사진 카드에서도 제목과 작성일만 읽는다", () => {
    const items = parseBusan(`<ul><li><a href="/nbtnewsBU/1754000"><span>${"사진 설명 ".repeat(600)}</span>
      <strong class="bTitle">부산시 시민 지원 정책 발표</strong><span class="writer">작성일 2026-10-05</span></a></li>
      <li><a href="/nbtnewsBU/1753999"><strong class="bTitle">부산시 청년 정책 안내</strong><span class="writer">작성일 2026-10-02</span></a></li></ul>`);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("부산시 시민 지원 정책 발표");
    expect(items.map(item => item.publishedDate)).toEqual(["2026-10-05", "2026-10-02"]);
  });

  it("충북의 중첩 본문을 끝까지 읽고 사진 및 첨부 안내를 제외한다", () => {
    const sentence = "충청북도는 주민에게 도움이 되는 지원 사업을 안내합니다. ";
    const body = parseChungbukBody(`<div class="contenttext"><div class="p-photo__wrap">사진 확대보기</div>
      <div><p>${sentence.repeat(8)}</p></div><div><p>마지막 본문 문장입니다.</p></div>
      <div class="attach_item">첨부 파일 내려받기</div></div><footer>바깥 메뉴</footer>`);
    expect(body).toContain("마지막 본문 문장입니다.");
    expect(body).not.toContain("사진 확대보기");
    expect(body).not.toContain("첨부 파일");
    expect(body).not.toContain("바깥 메뉴");
  });

  it("강원 새 한글 문서의 문장만 문서 순서대로 읽는다", async () => {
    const archive = new JSZip();
    archive.file("Contents/section10.xml", `<hp:p xmlns:hp="urn:test"><hp:t>마지막 부분</hp:t></hp:p>`);
    archive.file("Contents/section2.xml", `<hp:p xmlns:hp="urn:test"><hp:t>${"강원도는 주민 지원 정책을 발표했습니다. ".repeat(15)}</hp:t></hp:p>`);
    archive.file("Contents/header.xml", "서식에 있는 잡음 문장");
    const body = await readGangwonHwpx(await archive.generateAsync({ type: "nodebuffer" }));
    expect(body?.startsWith("강원도는")).toBe(true);
    expect(body?.endsWith("마지막 부분")).toBe(true);
    expect(body).not.toContain("잡음");
  });

  it("강원 문서에 문장이 없으면 빈 본문으로 처리한다", async () => {
    const archive = new JSZip();
    archive.file("Contents/section0.xml", "<hp:p xmlns:hp='urn:test'><hp:t>짧은 안내</hp:t></hp:p>");
    expect(await readGangwonHwpx(await archive.generateAsync({ type: "nodebuffer" }))).toBeNull();
  });

  it("철원 화면이 요약뿐이면 공식 한글 첨부 원문을 읽는다", async () => {
    const archive = new JSZip();
    archive.file("Contents/section0.xml", `<hp:p xmlns:hp="urn:test"><hp:t>${"철원군은 주민을 위한 지원 정책을 안내합니다. ".repeat(15)}</hp:t></hp:p>`);
    const bytes = await archive.generateAsync({ type: "uint8array" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array(bytes).buffer));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const body = await parseCheorwonBody(`<table><tr><td class="p-table__content">짧은 요약</td></tr></table>
        <ul><li class="p-attach__item"><a class="p-attach__link" href="./downloadBbsFile.do?atchmnflNo=177601&amp;bbsNo=32&amp;nttNo=294558">보도자료.hwpx</a></li></ul>`);
      expect(body?.length).toBeGreaterThanOrEqual(250);
      expect(String(fetchMock.mock.calls[0][0])).toContain("https://www.cwg.go.kr/www/downloadBbsFile.do?");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
