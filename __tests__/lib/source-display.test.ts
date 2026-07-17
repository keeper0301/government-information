import { describe, expect, it } from "vitest";
import { formatSourceName, ministryToSourceName } from "@/lib/source-display";

describe("source display formatting", () => {
  it("전남 기관명은 모바일 목록에서 자연스러운 짧은 라벨로 표시한다", () => {
    expect(ministryToSourceName("전라남도")).toBe("전남도청");
    expect(formatSourceName("전라남도청")).toBe("전남도청");
    expect(formatSourceName("전라남도도청")).toBe("전남도청");
  });

  it("이미 자연스러운 시군구청 이름은 그대로 둔다", () => {
    expect(ministryToSourceName("여수시")).toBe("여수시청");
    expect(formatSourceName("여수시청")).toBe("여수시청");
  });
});
