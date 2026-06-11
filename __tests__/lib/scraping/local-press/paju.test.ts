// ============================================================
// 파주시 보도자료 collector parseListPage / parseDetailBody 단위 테스트
// ============================================================
// jsView onclick seq 추출 + 슬래시 날짜(YYYY/MM/DD) + .article-body 본문 회귀 방어.

import { describe, it, expect } from "vitest";
import { parseListPage, parseDetailBody } from "@/lib/scraping/local-press/paju";

describe("paju parseListPage — jsView onclick + 슬래시 날짜 (라이브 구조)", () => {
  // 라이브(paju.go.kr BD_board.list bbsCd=1023) 행 구조 재현 (셀 사이 공백 포함).
  const html = `
    <tr>
      <td class="cell-no">15573</td>
      <td class="cell-subject">
        <a href="javascript:void(0)" class="ellipsis_b" onclick="jsView('1023', '20260610080714412', 'N', 'Y'); return false;">
          파주시 6월 10일 보도자료입니다. <i class="ico-new">N</i><!-- 새글 -->
        </a>
      </td>
      <td class="cell-default">소통홍보관</td>
      <td class="cell-default"> 2026/06/10 </td>
    </tr>
  `;
  const items = parseListPage(html);

  it("seq·제목 추출 (NEW 배지 제거)", () => {
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("20260610080714412");
    expect(items[0].title).toBe("파주시 6월 10일 보도자료입니다.");
  });

  it("슬래시 날짜 YYYY/MM/DD → YYYY-MM-DD", () => {
    expect(items[0].publishedDate).toBe("2026-06-10");
  });

  it("상세 URL 은 BD_board.view.do?bbsCd=1023&seq=", () => {
    expect(items[0].sourceUrl).toBe(
      "https://www.paju.go.kr/news/user/board/BD_board.view.do?bbsCd=1023&seq=20260610080714412",
    );
  });

  it("seq 가 날짜(슬래시)로 오인되지 않음 — 17자리 seq 에 구분자 없음", () => {
    // jsView 의 seq(20260610...)는 구분자 없어 날짜 정규식에 안 걸림 → 행의 진짜 작성일만 채택.
    expect(items[0].publishedDate).toBe("2026-06-10");
  });
});

describe("paju parseDetailBody — .article-body 인라인 본문", () => {
  it("article-body 텍스트 추출 + footer 컷", () => {
    const html = `
      <div class="view-wrap">
        <div class="article-body">
          파주시는 군사보호구역 행정위탁을 추가 확정해 인허가 기간을 대폭 단축한다고 밝혔다.
          이번 조치로 축구장 71개 규모의 토지가 행정위탁 대상에 포함되며, 주민 불편이 크게 줄어들 전망이다.
          시는 앞으로도 규제 완화와 행정 효율화를 지속 추진할 계획이다.
        </div>
        <div class="file-list">첨부파일 보도자료.hwp</div>
        <div class="paging">이전글 다음글 목록으로</div>
      </div>
    `;
    const body = parseDetailBody(html);
    expect(body).not.toBeNull();
    expect(body).toContain("군사보호구역 행정위탁");
    // footer(첨부파일/이전글) 는 잘려나감
    expect(body).not.toContain("이전글");
  });

  it("article-body 없으면 null", () => {
    expect(parseDetailBody("<div class='other'>본문 없음</div>")).toBeNull();
  });
});
