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
import { parseListPage as parseSeongdong } from "@/lib/scraping/local-press/seongdong";
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
