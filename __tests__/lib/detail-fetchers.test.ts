import { describe, expect, it } from "vitest";
import { findFetcher, type RowIdentity } from "@/lib/detail-fetchers";

function row(input: Partial<RowIdentity>): RowIdentity {
  return {
    id: "row-1",
    source_code: null,
    source_id: null,
    source_url: null,
    raw_payload: null,
    ...input,
  };
}

describe("detail fetcher matching", () => {
  it("does not match MSS rows without raw_payload", () => {
    expect(
      findFetcher(
        row({
          source_code: "mss",
          source_id: "View.do?cbIdx=310&bcIdx=1066439",
          raw_payload: null,
        }),
      ),
    ).toBeNull();
  });

  it("matches MSS rows only when source_id and raw_payload are both present", () => {
    expect(
      findFetcher(
        row({
          source_code: "mss",
          source_id: "View.do?cbIdx=310&bcIdx=1066439",
          raw_payload: {
            itemId: "View.do?cbIdx=310&bcIdx=1066439",
            writerName: "담당자",
            writerPhone: "02-0000-0000",
          },
        }),
      )?.sourceCode,
    ).toBe("mss");
  });

  it("does not match Bokjiro rows when the service id is missing", () => {
    expect(
      findFetcher(
        row({
          source_code: "bokjiro",
          source_id: null,
          source_url: "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do",
        }),
      ),
    ).toBeNull();
  });
});
