import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const promptButton = readFileSync(
  join(process.cwd(), "app/admin/naver-blog/copy-prompt-button.tsx"),
  "utf8",
);

describe("naver blog bulk prompt guidance", () => {
  it("keeps the old-first drain order and final publish-click boundary explicit", () => {
    expect(promptButton).toContain("오래된 글 ${ids.length}건을 순서대로");
    expect(promptButton).toContain("아래 순서를 바꾸지 말고 오래된 큐부터 처리");
    expect(promptButton).toContain("마지막 「발행」 버튼 직전에서 멈춰주세요");
    expect(promptButton).toContain("마지막 「발행」 버튼은 제가 직접 클릭합니다");
    expect(promptButton).toContain("「발행 완료」 처리하고 다음 글");
  });
});
