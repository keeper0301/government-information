// ============================================================
// 경남·미추홀 본문 컨테이너 변경 복구 회귀 테스트 (2026-06-02)
// ============================================================
// 둘 다 사이트 본문 컨테이너 변경으로 본문 0건 → div 깊이 추적으로 복구.
//   경남: se-contents → conText
//   미추홀: view_cont 류 → content editor_content

import { describe, it, expect } from "vitest";
import { parseDetailBody as bodyGyeongnam } from "@/lib/scraping/local-press/gyeongnam";
import { parseDetailBody as bodyMichuhol } from "@/lib/scraping/local-press/michuhol_incheon";

const LONG =
  "경상남도는 도민의 안전을 위해 다양한 재난 대응 훈련을 실시한다고 밝혔다. 이번 훈련은 실제 상황을 가정해 진행되며, 관계 기관이 합동으로 참여해 대응 체계를 점검한다. 도는 앞으로도 도민이 안심하고 생활할 수 있도록 안전 관리에 최선을 다하겠다고 강조했다. 자세한 내용은 도청 누리집에서 확인할 수 있다.";

describe("경남 parseDetailBody (conText div-depth)", () => {
  it("conText 본문 + 중첩 div 안 잘림", () => {
    const html = `
      <div class="conText">
        <p>${LONG}</p>
        <div class="img"><img src="/a.jpg"/></div>
        <p>문의는 경상남도청 안전정책과로 하면 된다.</p>
      </div>
    `;
    const body = bodyGyeongnam(html);
    expect(body).toContain("재난 대응 훈련"); // 이미지 div 앞
    expect(body).toContain("안전정책과로"); // 뒤 (조기 잘림 X)
  });
  it("conText 없음/50자 미만 → null", () => {
    expect(bodyGyeongnam(`<div class="other">${LONG}</div>`)).toBeNull();
    expect(bodyGyeongnam(`<div class="conText"><p>짧은 글</p></div>`)).toBeNull();
  });
});

describe("미추홀 parseDetailBody (content editor_content div-depth)", () => {
  it("content editor_content 본문 + HTML 주석/중첩 div 안 잘림", () => {
    const html = `
      <div class="content editor_content"><!-- 편집 주석 -->
        <p>${LONG}</p>
        <div class="photo"><img src="/b.jpg"/></div>
        <p>문의는 미추홀구청 홍보실로 하면 된다.</p>
      </div>
    `;
    const body = bodyMichuhol(html);
    expect(body).toContain("재난 대응 훈련");
    expect(body).toContain("홍보실로");
    expect(body).not.toContain("편집 주석"); // 주석 제거
  });
  it("content editor_content 없음/50자 미만 → null", () => {
    expect(bodyMichuhol(`<div class="other">${LONG}</div>`)).toBeNull();
    expect(bodyMichuhol(`<div class="content editor_content"><p>짧음</p></div>`)).toBeNull();
  });
});
