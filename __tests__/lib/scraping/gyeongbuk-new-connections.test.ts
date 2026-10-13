// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import fixtures from "../../fixtures/local-press/gyeongbuk-new.json";
// 단위 검사는 외부 사이트 상태와 무관하게 문서 구조만 확인합니다.
vi.mock("@/lib/scraping/local-press/_si_attach_helper", () => ({
  fetchSiAttachBody: vi.fn(async () => null),
  fetchEgovDownFileAttachBody: vi.fn(async () => null),
}));
afterEach(() => vi.unstubAllGlobals());
for (const fixture of fixtures) {
  describe(`${fixture.city} 공식 자료 해석`, () => {
    it("실제 목록 구조에서 제목과 날짜를 읽고 중복을 제거한다", async () => {
      const collector = await import(`@/lib/scraping/local-press/${fixture.key}.ts`);
      const once = collector.parseListPage(fixture.listHtml);
      const duplicated = collector.parseListPage(fixture.listHtml + fixture.listHtml + "<footer>2099-12-31 다른 날짜</footer>");
      expect(once).toHaveLength(1);
      expect(duplicated).toEqual(once);
      expect(once[0].title.length).toBeGreaterThan(4);
      expect(once[0].publishedDate).toMatch(/^2026-\d{2}-\d{2}$/);
      expect(new URL(once[0].sourceUrl).hostname).toMatch(/\.go\.kr|\.kr$/);
      expect(once[0].sourceUrl).not.toMatch(/cmd=2(?:&|$)/);
    });
    it("본문만 추출하고 메뉴와 스크립트를 제외한다", async () => {
      const collector = await import(`@/lib/scraping/local-press/${fixture.key}.ts`);
      const text = "주민에게 도움이 되는 공식 지원사업의 대상과 신청 방법을 설명합니다. ".repeat(12);
      const emptyImage = fixture.key === "yeongyang" ? `<div class="view_box"><img src="/사진.jpg"></div>` : "";
      const html = `${emptyImage}<nav>섞이면 안 되는 메뉴</nav><div class="${fixture.bodyClass}"><p>${text}</p><script>섞이면 안 되는 실행문</script></div><footer>섞이면 안 되는 주소</footer>`;
      const body = await collector.parseDetailBody(html);
      expect(body?.length).toBeGreaterThanOrEqual(250);
      expect(body).toContain("신청 방법");
      expect(body).not.toContain("섞이면 안");
      expect(await collector.parseDetailBody(`<div class="${fixture.bodyClass}">짧은 안내</div>`)).toBeNull();
    });
  });
}

it("성주 공개 첨부 요청에 상세 페이지의 세션을 전달한다", async () => {
  const fetchMock = vi.fn(async () => new Response("공개 상세 페이지", {
    headers: { "set-cookie": "JSESSIONID=public-session; Path=/; HttpOnly" },
  }));
  vi.stubGlobal("fetch", fetchMock);
  const { parseDetailBody, LIST_URL } = await import("@/lib/scraping/local-press/seongju");
  const { fetchSiAttachBody } = await import("@/lib/scraping/local-press/_si_attach_helper");
  const html = '<input name="bod_uid" value="123"><a href="/programs/board/board_download.do?file_uid=456">공개 첨부</a>';
  await parseDetailBody(html);
  expect(fetchMock).toHaveBeenCalledWith(LIST_URL + "&bod_uid=123&cmd=258", expect.any(Object));
  expect(fetchSiAttachBody).toHaveBeenLastCalledWith(html, LIST_URL, {
    Cookie: "JSESSIONID=public-session", Referer: LIST_URL + "&bod_uid=123&cmd=258",
  });
});
