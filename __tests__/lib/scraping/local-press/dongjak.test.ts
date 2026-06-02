// ============================================================
// 동작구(eGovFrame portal/bbs B0000171) collector 단위 테스트 (2026-06-03)
// ============================================================
// 동작은 본문 전문이 첨부 hwp(fileDown.do)에 있어 parseDetailBody 가 SI 첨부 헬퍼
// (fetchSiAttachBody)로 추출 후 dbData 정적 fallback 하는 async 구조.
// 여기서는 list 추출 + 첨부 없을 때 dbData fallback(회귀 방어)을 검증.
// (첨부 hwp 추출 경로는 네트워크/napi 의존이라 라이브 검증으로 확인.)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/dongjak";

describe("동작구 parseListPage (B0000171)", () => {
  it("nttId / title / date 추출", () => {
    const html = `
      <a href="/portal/bbs/B0000171/view.do?nttId=10752334&menuNo=200647">동작구, 장애진단비·검사비 지원</a>
      <span class="date">2026-06-02</span>
    `;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("10752334");
    expect(items[0].title).toContain("동작구");
    expect(items[0].publishedDate).toBe("2026-06-02");
    expect(items[0].sourceUrl).toContain("nttId=10752334");
  });
});

describe("동작구 parseDetailBody (첨부 hwp 우선 + dbData fallback)", () => {
  it("첨부(fileDown.do) 없으면 dbData 정적 본문(250+)으로 fallback", async () => {
    const body250 =
      "동작구가 장애등록 과정에서 발생하는 경제적 부담을 줄이고 복지서비스 접근성을 높이기 위해 동작형 장애등록진단서 발급비 및 검사비 지원사업을 시행한다고 밝혔다. ".repeat(
        3,
      );
    const html = `<div class="dbData">${body250}</div><div class="btnSet">`;
    const body = await parseDetailBody(html);
    expect(body).not.toBeNull();
    expect(body).toContain("동작구");
  });

  it("dbData 가 부제목 thin(250 미만) + 첨부 없으면 null (factory skip)", async () => {
    const html = `<div class="dbData">동작구, 짧은 부제목만 있는 글</div><div class="btnSet">`;
    expect(await parseDetailBody(html)).toBeNull();
  });
});
