// ============================================================
// 인천 서구 collector 단위 테스트 (2026-06-11)
// ============================================================
// 인천 서구는 board_view 인라인 본문이 없고 본문 전문이 HWP 첨부(bbsMsgFileDown.do)
// 에만 있어, parseDetailBody 가 SI 첨부 헬퍼(fetchSiAttachBody)로 HWP 추출 후
// board_view 인라인 fallback 하는 async 구조.
// 여기서는 첨부 없을 때 fallback 분기(회귀 방어)를 검증한다.
// (HWP 첨부 추출 경로는 네트워크/@ohah 의존이라 라이브 검증으로 확인 — 3글 791/516/652자.)
// ============================================================

import { describe, it, expect } from "vitest";
import { parseDetailBody } from "@/lib/scraping/local-press/seo_incheon";

const LONG =
  "인천 서구가 관내 아동·청소년을 대상으로 다양한 문화예술 교육 프로그램을 운영한다고 밝혔다. " +
  "이번 사업은 지역 주민이 일상에서 예술을 누리고 건강한 문화시민으로 성장할 수 있도록 " +
  "마련됐다. 구는 관계 기관과 협력해 맞춤형 강좌와 공연을 제공하고, 가정과 학교가 함께 " +
  "참여할 수 있도록 다양한 연계 활동을 운영한다.";

describe("인천 서구 parseDetailBody (HWP 첨부 우선 + board_view fallback)", () => {
  it("첨부(fileDown.do) 없으면 board_view 인라인 본문으로 fallback", async () => {
    const html = `<html><body><div class="board_view"><p>${LONG}</p></div></body></html>`;
    const body = await parseDetailBody(html);
    expect(body).not.toBeNull();
    expect(body).toContain("인천 서구가");
  });

  it("첨부도 board_view(본문 컨테이너)도 없으면 null (factory skip)", async () => {
    const html = `<html><body><div class="other">본문 컨테이너 없음</div></body></html>`;
    expect(await parseDetailBody(html)).toBeNull();
  });
});
