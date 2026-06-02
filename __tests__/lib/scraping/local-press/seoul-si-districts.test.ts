// ============================================================
// 서울 SI selectBbsNttList 자치구 list 파서 단위 테스트 (2026-06-01)
// ============================================================
// 성동·영등포·은평 parseListPage 의 regex silent 회귀 방어.
// 본문(parseDetailBody)은 공용 parseSiNttBody → si-ntt-helper.test.ts 가 커버.
// 여기서는 list 추출만 검증:
//   - bbsNo lookahead 필터 (다른 게시판 배너 anchor 제외)
//   - "NEW" 새 글 배지 strip (배지 뒤 공백 유무 무관, RENEW 등 단어는 보호)
//   - 작성일 td 날짜 추출 (YYYY.MM.DD → YYYY-MM-DD)
//   - 은평: href param 체인이 길어 </a> 가 500자 밖 → {0,900} window 필수
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseListPage as parseSeongdong,
  stripSiPdfMeta,
  parseDetailBody as parseSeongdongBody,
} from "@/lib/scraping/local-press/seongdong";
import { parseListPage as parseYeongdeungpo } from "@/lib/scraping/local-press/yeongdeungpo";
import { parseListPage as parseEunpyeong } from "@/lib/scraping/local-press/eunpyeong";

describe("성동구 parseListPage (bbsNo=188)", () => {
  it("seq/title/date 추출 + 공백 없는 'NEW' 배지 strip", () => {
    const html = `
      <td class="p-subject">
        <a href="./selectBbsNttView.do?bbsNo=188&nttNo=358685&key=1477" target="_self">성동구, 동 자치회관 새 단장 본격화NEW</a>
      </td>
      <td>주민복지과</td><td>2026.06.01</td>
    `;
    const items = parseSeongdong(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("358685");
    expect(items[0].title).toBe("성동구, 동 자치회관 새 단장 본격화"); // NEW 제거
    expect(items[0].publishedDate).toBe("2026-06-01");
    expect(items[0].sourceUrl).toContain(
      "selectBbsNttView.do?bbsNo=188&nttNo=358685&key=1477",
    );
  });

  it("끝이 'RENEW' 인 제목은 NEW 만 잘라내지 않는다 (\\b 보호)", () => {
    const html = `
      <a href="./selectBbsNttView.do?bbsNo=188&nttNo=10&key=1477">성동 ICT 센터 RENEW</a><td>2026.05.30</td>
    `;
    const items = parseSeongdong(html);
    expect(items[0].title).toBe("성동 ICT 센터 RENEW"); // RE 로 잘리지 않음
  });
});

describe("영등포구 parseListPage (bbsNo=45)", () => {
  it("배지 뒤 공백 있는 'NEW ' 도 strip", () => {
    const html = `
      <a href="./selectBbsNttView.do?bbsNo=45&nttNo=415226&key=2868">영등포구, 호국보훈의 달 기념행사 개최 NEW </a>
      <td>총무과</td><td>2026.06.01</td>
    `;
    const items = parseYeongdeungpo(html);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("영등포구, 호국보훈의 달 기념행사 개최"); // NEW + 공백 제거
    expect(items[0].publishedDate).toBe("2026-06-01");
  });
});

describe("은평구 parseListPage (bbsNo=48)", () => {
  it("href param 체인이 길어 </a> 가 500자 밖이어도 {0,900} 로 추출", () => {
    // 실제 은평 anchor 재현 — search 파라미터 6개 + 제목 영역 공백 패딩으로 </a> 를 500자 밖에 둠.
    const longHref =
      "./selectBbsNttView.do?key=762&amp;bbsNo=48&amp;nttNo=317612&amp;searchCtgry=&amp;searchCnd=all&amp;searchKrwd=&amp;integrDeptCode=&amp;pageIndex=1";
    const pad = " ".repeat(550); // 500 초과 → 구 {0,500} window 면 0건 (회귀 가드)
    const html = `
      <td class="p-subject">
        <a href="${longHref}" target="_self">은평구, 스마트 안전관리 시스템 구축${pad}</a>
      </td>
      <td>건축과</td><td>2026.06.01</td>
    `;
    const items = parseEunpyeong(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("317612");
    expect(items[0].title).toBe("은평구, 스마트 안전관리 시스템 구축");
    expect(items[0].publishedDate).toBe("2026-06-01"); // anchor +far 작성일 td
  });

  it("다른 게시판 배너 anchor (bbsNo=197) 는 제외", () => {
    const html = `
      <a href="./selectBbsNttView.do?key=1270&amp;bbsNo=197&amp;nttNo=237" class="banner_anchor">지진발생시 시민행동요령</a>
      <a href="./selectBbsNttView.do?key=762&amp;bbsNo=48&amp;nttNo=317600">은평구 정식 보도자료 제목</a><td>2026.05.31</td>
    `;
    const items = parseEunpyeong(html);
    expect(items).toHaveLength(1); // 배너 제외, 보도자료만
    expect(items[0].seq).toBe("317600");
  });
});

// 성동 본문은 첨부 PDF 전문(2026-06-02 fix). PDF 메타 머리 cut + PDF 부재 fallback 회귀 방어.
describe("성동구 stripSiPdfMeta (PDF 메타 머리 cut)", () => {
  it("'총 매수 N쪽' 마커 이후를 본문으로 cut (담당자 메타 제거)", () => {
    const pdf =
      "(자료 제공) 2026. 6. 2.(화) 성동구 보도자료 과장 반경자 사진 있음 총 매수 2쪽 " +
      "성동구, 무더위 속 노숙인 안전 지킨다. 서울 성동구는 폭염 피해에 취약한 거리 노숙인의 건강과 안전을 보호하기 위해 보호대책을 추진한다고 밝혔다. ".repeat(
        5,
      );
    const body = stripSiPdfMeta(pdf);
    expect(body.startsWith("성동구, 무더위")).toBe(true);
    expect(body).not.toContain("자료 제공"); // 메타 머리 제거됨
  });

  it("마커 부재 시 전체 유지 (전문 확보 우선)", () => {
    const pdf =
      "성동구는 폭염 대비 거리노숙인 보호대책을 추진한다고 밝혔다. 현장 중심의 선제 대응 체계를 강화한다. ".repeat(
        4,
      );
    const body = stripSiPdfMeta(pdf);
    expect(body).toContain("성동구는");
  });

  it("cut 후 250 미만이면 전체 유지 (잘못된 cut 방지)", () => {
    const pdf = "보도자료 메타 머리 정보 총 매수 1쪽 짧은본문";
    const body = stripSiPdfMeta(pdf);
    expect(body).toContain("메타 머리"); // cut 후 본문 짧아 전체 유지
  });
});

describe("성동구 parseDetailBody (PDF 부재 시 SI 헬퍼 fallback)", () => {
  it("downloadBbsFile.do 첨부 없으면 정적 본문(parseSiNttBody)으로 fallback", async () => {
    // 본문 셀에 250+ 정적 본문이 있는 (드문) 글 — PDF fetch 없이 정적 추출.
    const body250 =
      "서울 성동구는 폭염 피해에 취약한 거리 노숙인의 건강과 안전을 보호하기 위해 2026년 폭염 대비 거리노숙인 보호대책을 추진한다고 밝혔다. 현장 중심의 선제 대응 체계를 강화해 거리 노숙인 보호에 총력을 기울일 방침이다. ".repeat(
        3,
      );
    const html = `<td colspan="2" class="p-table__content">${body250}</td>`;
    const body = await parseSeongdongBody(html);
    expect(body).not.toBeNull();
    expect(body).toContain("성동구는");
  });
});
