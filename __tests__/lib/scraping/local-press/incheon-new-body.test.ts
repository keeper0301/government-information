import { describe, expect, it, vi } from "vitest";
import * as jemulpo from "@/lib/scraping/local-press/jemulpo_incheon";
import * as geomdan from "@/lib/scraping/local-press/geomdan_incheon";
import * as yeongjong from "@/lib/scraping/local-press/yeongjong_incheon";
import * as jejusi from "@/lib/scraping/local-press/jejusi";
import JSZip from "jszip";

const sentence = "지역 주민에게 필요한 지원 사업의 신청 절차와 행사 일정 안내입니다. ".repeat(15);
describe("새 인천 게시판과 제주시 첨부", () => {
  for (const collector of [jemulpo, geomdan]) {
    it("새 본문 위치에서 편집기 문장은 보존하고 화면 잡음을 제외한다", async () => {
      const body = await collector.parseDetailBody(`<div class="con-box"><div class="detail"><div class="hwp_editor_board_content">${sentence}</div><script>실행잡음</script><iframe>미리보기잡음</iframe></div></div>`);
      expect(body).toBe(sentence.trim());
    });
  }
  it("영종 보도 게시판만 읽고 같은 행의 등록일을 붙인다", () => {
    const html = `<table><tr><td><a href="view.do?pst_id=mn_news_yj&pst_sn=1">지역 주민 보도</a></td><td data-th="등록일">2026-10-02</td></tr><tr><td><a href="view.do?pst_id=mn_ntc&pst_sn=2">공지사항</a></td><td data-th="등록일">2026-10-03</td></tr></table>`;
    expect(yeongjong.parseListPage(html)).toEqual([{ seq: "1", title: "지역 주민 보도", publishedDate: "2026-10-02", sourceUrl: "https://www.yeongjong.go.kr/main/pst/view.do?pst_id=mn_news_yj&pst_sn=1" }]);
    expect(yeongjong.parseDetailBody(`<div class="board_content"><div class="editor_content">${sentence}<script>실행잡음</script></div></div>`)).toBe(sentence.trim());
  });
  it("제주시 한글 압축 첨부를 읽고 사진 링크는 다운로드하지 않는다", async () => {
    const zip = new JSZip();
    zip.file("Contents/section0.xml", `<hp:p><hp:t>${sentence}</hp:t></hp:p>`);
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(bytes.buffer as ArrayBuffer));
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect(await jejusi.parseDetailBody(`<div class="view-content"><a href="/boardFileDown.ac?file_id=1">사진.jpg</a><a href="/boardFileDown.ac?file_id=2">전문.hwpx</a></div>`)).toBe(sentence.trim());
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toBe("https://www.jejusi.go.kr/boardFileDown.ac?file_id=2");
    } finally { vi.unstubAllGlobals(); }
  });
});

