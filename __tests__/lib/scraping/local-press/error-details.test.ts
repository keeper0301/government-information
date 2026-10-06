import { expect, it } from "vitest";
import { describeScrapeError } from "@/lib/scraping/local-press/_error-details";

it("접속 실패 안에 숨은 인증서 원인도 기록한다", () => {
  const cause = Object.assign(new Error("인증서 확인 실패"), { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" });
  expect(describeScrapeError(new TypeError("fetch failed", { cause }))).toContain("UNABLE_TO_VERIFY_LEAF_SIGNATURE");
});

it("여러 주소의 접속 실패와 시간 초과 원인도 기록한다", () => {
  const timeout = Object.assign(new Error("접속 시간 초과"), { code: "ETIMEDOUT" });
  expect(describeScrapeError(new TypeError("fetch failed", { cause: new AggregateError([timeout]) }))).toContain("ETIMEDOUT");
});
