import { afterEach, describe, expect, it, vi } from "vitest";

import { createNaverContentFingerprint } from "@/lib/naver-blog/content-identity";
import { summarizeGa4Rows } from "@/lib/naver-blog/post-performance-readback";

describe("Naver post performance readback", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps awaiting publication separate from a published no-signal window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T12:00:00.000Z"));

    expect(summarizeGa4Rows([], "2026-09-20T00:00:00.000Z", 24)).toMatchObject({
      state: "no_signal",
      sessions: 0,
      ctaClicks: 0,
      conversionSignals: 0,
    });
  });

  it("counts sessions only on session_start and counts CTA/conversion events once", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T12:00:00.000Z"));
    const rows = [
      { dimensionValues: [{ value: "session_start" }, { value: "202609200930" }], metricValues: [{ value: "2" }, { value: "2" }] },
      { dimensionValues: [{ value: "cta_clicked" }, { value: "202609200935" }], metricValues: [{ value: "2" }, { value: "3" }] },
      { dimensionValues: [{ value: "checkout_completed" }, { value: "202609200940" }], metricValues: [{ value: "2" }, { value: "1" }] },
      { dimensionValues: [{ value: "cta_clicked" }, { value: "202609190900" }], metricValues: [{ value: "99" }, { value: "99" }] },
    ];

    expect(summarizeGa4Rows(rows, "2026-09-20T00:00:00.000Z", 24)).toMatchObject({
      state: "signal",
      sessions: 2,
      ctaClicks: 3,
      conversionSignals: 1,
    });
  });

  it("binds approval identity to queue, content and rendered payload", () => {
    const base = {
      queueId: "queue-a",
      contentId: "content-a",
      title: "title",
      bodyHtml: "body",
      backlinkUrl: "https://www.keepioo.com/blog/post?utm_id=queue-a",
      coverImageUrl: null,
    };
    const fingerprint = createNaverContentFingerprint(base);
    expect(fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(createNaverContentFingerprint(base)).toBe(fingerprint);
    expect(createNaverContentFingerprint({ ...base, queueId: "queue-b" })).not.toBe(fingerprint);
    expect(createNaverContentFingerprint({ ...base, bodyHtml: "changed" })).not.toBe(fingerprint);
  });
});
