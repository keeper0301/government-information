import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(process.cwd(), "app/admin/naver-blog/page.tsx"), "utf8");

describe("admin naver blog queue guidance", () => {
  it("shows backlog-focused publishing guidance and operator cadence", () => {
    expect(page).toContain("const DAILY_SAFE_PUBLISH_TARGET = 20");
    expect(page).toContain("const estimatedDaysToClear");
    expect(page).toContain("대기열 해소 플랜");
    expect(page).toContain("오래된 글부터 우선 발행");
    expect(page).toContain("하루 {DAILY_SAFE_PUBLISH_TARGET}건 기준");
  });

  it("keeps the external posting boundary visible", () => {
    expect(page).toContain("마지막 발행 버튼은 운영자가 직접 클릭");
    expect(page).toContain("외부 게시 전 최종 확인");
  });
});
