import { describe, expect, it } from "vitest";
import {
  getRateLimitBucketClass,
  maskRateLimitBucket,
} from "@/lib/monitoring/rate-limit-status";

describe("rate limit status helpers", () => {
  it("masks raw IP/user identity from buckets", () => {
    expect(maskRateLimitBucket("events:ip:203.0.113.10")).toBe("events:ip:*");
    expect(maskRateLimitBucket("support:user:00000000-0000-0000-0000-000000000001")).toBe("support:user:*");
    expect(maskRateLimitBucket("legacybucket")).toBe("legacybucket");
  });

  it("extracts endpoint bucket class", () => {
    expect(getRateLimitBucketClass("chatbot:ip:203.0.113.10")).toBe("chatbot");
    expect(getRateLimitBucketClass("")).toBe("unknown");
  });
});
