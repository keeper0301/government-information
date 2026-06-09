// ============================================================
// bbsMsgDetail helper — board_view 본문 추출 복구 테스트 (2026-06-02)
// ============================================================
// 부평·계양·강화 본문이 `board_view`(class 중간, 예: "general_board board_view")
// div 에 정적 존재(hwp_editor 빈 div 미끼). div 깊이 추적 우선 + 없으면 기존 regex fallback.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBbsMsgDetailCollector } from "@/lib/scraping/local-press/_bbs_msg_detail_helper";

const PAD = " ".repeat(1200);
const LONG =
  "계양구는 관내 취약계층 아동을 대상으로 전문 심리치료를 지원한다고 밝혔다. " +
  "이번 사업은 발달 지연과 심리 불안을 겪는 아동에게 상담과 치료비를 후원해 " +
  "건강한 성장을 돕기 위해 마련됐다. 구는 협약 기관과 협력해 맞춤형 프로그램을 " +
  "제공하고, 가정과 학교가 함께 참여할 수 있도록 다양한 연계 활동을 운영한다. " +
  "구 관계자는 앞으로도 아동이 안심하고 자랄 수 있는 환경을 만들기 위해 지역사회와 " +
  "협력해 지원 사업을 지속적으로 확대해 나가겠다고 강조했다.";

function setup(detailHtml: string) {
  const listHtml = `<html><body>${PAD}
    <a href="/open_content/main/bbs/bbsMsgDetail.do?msg_seq=15794&amp;bcd=board_111">계양구 아동 심리치료 후원 협약</a>
    <span>2026.06.01</span></body></html>`;
  (global.fetch as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce(new Response(listHtml, { status: 200 }))
    .mockResolvedValueOnce(new Response(detailHtml, { status: 200 }));
  const insert = vi.fn(async () => ({ error: null }));
  const admin = { from: vi.fn(() => ({ insert })) };
  const { scrapeAndInsert } = createBbsMsgDetailCollector({
    baseUrl: "https://www.gyeyang.go.kr",
    listPath: "/open_content/main/open_info/admin/report.jsp",
    detailBasePath: "/open_content/main/bbs",
    cityName: "계양구",
    region: "인천",
    ministry: "계양구청",
    sourceCode: "local-press-gyeyang",
    bcd: "board_111",
  });
  return { scrapeAndInsert, admin, insert };
}

describe("bbsMsgDetail board_view 복구", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("class 중간 board_view(general_board board_view) 도 추출 (div 깊이 추적)", async () => {
    const detail = `<html><body>${PAD}
      <div class="hwp_editor_board_content" data-jsonlen="9999"></div>
      <div class="general_board board_view"><p>${LONG}</p><div class="img"><img/></div></div>
      <div class="control"></div></body></html>`;
    const { scrapeAndInsert, admin, insert } = setup(detail);
    const r = await scrapeAndInsert(admin as never, 1);
    expect(r).toMatchObject({ fetched: 1, inserted: 1, skipped: 0 });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("전문 심리치료를 지원") }),
    );
  });

  it("board_view 없으면 기존 regex(view_cont) 로 fallback", async () => {
    const detail = `<html><body>${PAD}
      <div class="view_cont"><p>${LONG}</p></div>
      <div class="file"></div></body></html>`;
    const { scrapeAndInsert, admin, insert } = setup(detail);
    const r = await scrapeAndInsert(admin as never, 1);
    expect(r).toMatchObject({ fetched: 1, inserted: 1, skipped: 0 });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("전문 심리치료를 지원") }),
    );
  });

  // 2026-06-03 — board_view 안 ul.other_con(이전글/다음글 네비)·끝 첨부/목록 잔재 제거.
  it("board_view 안 네비(ul.other_con)·끝 목록 라벨이 본문에 안 섞임", async () => {
    const detail = `<html><body>${PAD}
      <div class="general_board board_view">
        <div class="tit">계양구, 아동 심리치료 후원 협약</div>
        <p>${LONG}</p>
        <ul class="other_con">
          <li>이전글 계양구, 다른 보도자료 제목입니다</li>
          <li>다음글 계양구, 또 다른 보도자료 제목입니다</li>
        </ul>
        목록
      </div></body></html>`;
    const { scrapeAndInsert, admin, insert } = setup(detail);
    const r = await scrapeAndInsert(admin as never, 1);
    expect(r).toMatchObject({ fetched: 1, inserted: 1 });
    const body = ((insert.mock.calls as unknown[][])[0]?.[0] as { body?: string })
      ?.body ?? "";
    expect(body).toContain("전문 심리치료를 지원");
    expect(body).not.toContain("이전글");
    expect(body).not.toContain("다음글");
    expect(body).not.toContain("다른 보도자료 제목");
  });

  // 2026-06-10 — 본문이 "첨부파일 [파일명]" 목록 뒤에 오는 site(강화·인천동구·인천서구).
  // 2026-06-03 의 "첨부파일 이후 전부 cut" 이 이런 site 본문을 통째로 날려 insert 0 회귀했음.
  // 첨부 라벨+파일명만 surgical 제거해 본문(앞·뒤 무관) 보존하는지 방어.
  it("본문이 첨부파일 목록 뒤에 오는 site(강화형)도 본문 보존", async () => {
    const detail = `<html><body>${PAD}
      <div class="general_board board_view">
        <div class="tit">강화군, 폭염 대응 종합대책 본격 가동</div>
        <span>작성자 안전총괄과 작성일 2026년 6월 8일 조회수 58</span>
        첨부파일 강화군_폭염_대응_종합대책.hwp 폭염저감시설_사진(1).jpg
        <p>${LONG}</p>
        <ul class="other_con"><li>이전글 강화군, 다른 보도자료 제목입니다</li></ul>
      </div></body></html>`;
    const { scrapeAndInsert, admin, insert } = setup(detail);
    const r = await scrapeAndInsert(admin as never, 1);
    expect(r).toMatchObject({ fetched: 1, inserted: 1 });
    const body = ((insert.mock.calls as unknown[][])[0]?.[0] as { body?: string })
      ?.body ?? "";
    expect(body).toContain("전문 심리치료를 지원"); // 첨부 뒤 본문 보존(핵심)
    expect(body).not.toContain(".hwp"); // 첨부 파일명 제거
    expect(body).not.toContain("폭염저감시설_사진"); // 첨부 파일명 제거
    expect(body).not.toContain("이전글"); // 네비 제거
  });
});

// 2026-06-02 — list anchor 의 bcd·msg_seq query 순서가 사이트마다 다름(ongjin=bcd 먼저).
// helper lookahead 가 순서 무관 매칭하는지 회귀 방어.
describe("bbsMsgDetail list bcd·msg_seq 순서 무관", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  function run(listAnchor: string) {
    const listHtml = `<html><body>${PAD}${listAnchor}<span>2026.06.01</span></body></html>`;
    const detail = `<html><body>${PAD}<div class="general_board board_view"><p>${LONG}</p></div></body></html>`;
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(listHtml, { status: 200 }))
      .mockResolvedValueOnce(new Response(detail, { status: 200 }));
    const insert = vi.fn(async () => ({ error: null }));
    const admin = { from: vi.fn(() => ({ insert })) };
    const { scrapeAndInsert } = createBbsMsgDetailCollector({
      baseUrl: "https://www.ongjin.go.kr",
      listPath: "/x.jsp",
      detailBasePath: "/open_content/main/bbs",
      cityName: "옹진군",
      region: "인천",
      ministry: "옹진군청",
      sourceCode: "local-press-x",
      bcd: "notice",
    });
    return scrapeAndInsert(admin as never, 1);
  }

  it("bcd 가 msg_seq 앞에 오는 순서(ongjin)도 매칭한다", async () => {
    const r = await run(
      `<a href="/open_content/main/bbs/bbsMsgDetail.do?bcd=notice&amp;msg_seq=26687">옹진군 보도자료 제목입니다</a>`,
    );
    expect(r).toMatchObject({ fetched: 1, inserted: 1 });
  });

  it("msg_seq 가 앞에 오는 순서도 여전히 매칭한다", async () => {
    const r = await run(
      `<a href="/open_content/main/bbs/bbsMsgDetail.do?msg_seq=26687&amp;bcd=notice">옹진군 보도자료 제목입니다</a>`,
    );
    expect(r).toMatchObject({ fetched: 1, inserted: 1 });
  });
});
