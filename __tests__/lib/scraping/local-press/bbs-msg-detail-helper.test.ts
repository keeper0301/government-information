import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBbsMsgDetailCollector } from "@/lib/scraping/local-press/_bbs_msg_detail_helper";

const 긴공백 = " ".repeat(1200);

describe("bbsMsgDetail 공통 도우미", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("게시판 코드가 press인 목록도 수집한다", async () => {
    const 목록문서 = `
      <html><body>${긴공백}
        <a href="/main/bbs/bbsMsgDetail.do?msg_seq=13778&amp;bcd=press">
          인천 동구, 찾아가는 아동권리 교육 운영
        </a>
        <span>2026.05.28</span>
      </body></html>
    `;
    const 상세문서 = `
      <html><body>${긴공백}
        <div class="board_view">
          인천 동구는 관내 아동과 보호자를 대상으로 찾아가는 아동권리 교육을 운영한다고 밝혔다.
          이번 교육은 아동의 권리 이해를 높이고 지역사회 보호 체계를 강화하기 위해 마련됐다.
          구는 가정과 학교를 직접 방문해 아동의 눈높이에 맞춘 교육 프로그램을 제공하며, 참여 아동들이
          자신의 권리와 책임을 자연스럽게 이해할 수 있도록 다양한 체험 활동을 함께 진행한다.
          구 관계자는 앞으로도 아동이 행복하게 성장할 수 있는 환경을 만들기 위해 지역사회와 협력해
          아동권리 보호 사업을 지속적으로 확대해 나가겠다고 밝혔다.
        </div>
        <div class="btn"><a>목록</a></div>
      </body></html>
    `;
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(목록문서, { status: 200 }))
      .mockResolvedValueOnce(new Response(상세문서, { status: 200 }));

    const insert = vi.fn(async () => ({ error: null }));
    const admin = { from: vi.fn(() => ({ insert })) };
    const { scrapeAndInsert } = createBbsMsgDetailCollector({
      baseUrl: "https://www.icdonggu.go.kr",
      listPath: "/main/bbs/bbsMsgList.do?bcd=press",
      detailBasePath: "/main/bbs",
      cityName: "인천 동구",
      region: "인천",
      ministry: "인천 동구청",
      sourceCode: "local-press-donggu-incheon",
      bcd: "press",
    });

    const result = await scrapeAndInsert(admin as never, 1);

    expect(result).toMatchObject({ fetched: 1, inserted: 1, skipped: 0 });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "인천 동구, 찾아가는 아동권리 교육 운영",
        source_url:
          "https://www.icdonggu.go.kr/main/bbs/bbsMsgDetail.do?msg_seq=13778&bcd=press",
        source_code: "local-press-donggu-incheon",
      }),
    );
  });
});
