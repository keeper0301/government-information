import { describe, expect, it } from "vitest";
import { parseDetailBody } from "@/lib/scraping/local-press/gyeongnam";

const enoughBody =
  "경남도청 보도자료 본문은 정책 안내와 신청 정보를 충분히 담고 있습니다. ".repeat(4);

describe("경남 수집기 본문 추출", () => {
  // 2026-06-02 — 사이트 본문 컨테이너 변경(se-contents → conText) 복구 반영.
  it("현재 conText 본문 구조를 추출 (div 깊이 추적, 중첩 div 안 잘림)", () => {
    const html = `
      <div class="conText">
        <p>${enoughBody}</p>
        <div class="img"><img src="/a.jpg"/></div>
        <p>문의는 경상남도청으로 하면 된다.</p>
      </div>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("경남도청 보도자료 본문"); // 이미지 div 앞
    expect(body).toContain("문의는 경상남도청"); // 뒤 (조기 잘림 X)
  });

  it("conText 없으면 null (옛 bbs_view 미지원)", () => {
    expect(
      parseDetailBody(`<div class="bbs_view"><p>${enoughBody}</p></div>`),
    ).toBeNull();
  });
});
