import { describe, expect, it } from "vitest";
import {
  formatDigestMessage,
  reviewQueueTotal,
  type DigestData,
} from "@/lib/notifications/daily-digest";

const ZERO: DigestData = {
  signups24h: 0,
  newPolicies24h: 0,
  active7d: 0,
  pressAutoConfirmed24h: 0,
  newsAutoHidden24h: 0,
  dedupeAutoConfirmed24h: 0,
  wordpressPublished24h: 0,
  cronFailures24h: 0,
  dedupePending: 0,
  naverBlogPending: 0,
};

describe("formatDigestMessage", () => {
  it("핵심 KPI 모두 포함 (사장님 빠른 인지)", () => {
    const message = formatDigestMessage({
      ...ZERO,
      signups24h: 3,
      newPolicies24h: 47,
      active7d: 12,
      pressAutoConfirmed24h: 28,
      newsAutoHidden24h: 5,
      dedupeAutoConfirmed24h: 2,
      wordpressPublished24h: 1,
    });
    expect(message).toContain("[keepioo");
    expect(message).toContain("가입 3");
    expect(message).toContain("활성 12");
    expect(message).toContain("신규 정책 47");
    expect(message).toContain("워드 1");
    expect(message).toContain("보도 28");
    expect(message).toContain("뉴스hide 5");
    expect(message).toContain("dedupe 2");
  });

  it("MM/DD 날짜 형식 포함 (어제 데이터 인지 보강)", () => {
    const message = formatDigestMessage({
      ...ZERO,
      signups24h: 1,
      newPolicies24h: 1,
      active7d: 1,
    });
    expect(message).toMatch(/\[keepioo \d{2}\/\d{2}\]/);
  });

  it("검토 큐 0 — 검토 필요 줄 미포함 (정상 운영 SMS 깔끔)", () => {
    const message = formatDigestMessage(ZERO);
    expect(message).not.toContain("검토 필요");
  });

  it("검토 큐 ≥1 — 검토 필요 줄 포함 + 항목별 카운트", () => {
    const message = formatDigestMessage({
      ...ZERO,
      dedupePending: 5,
      naverBlogPending: 3,
    });
    expect(message).toContain("검토 필요");
    expect(message).toContain("dedupe 5");
    expect(message).toContain("네이버 3");
  });

  it("cron 실패 0 — cron 실패 줄 미포함", () => {
    const message = formatDigestMessage(ZERO);
    expect(message).not.toContain("cron 실패");
  });

  it("cron 실패 ≥1 — cron 실패 줄 포함 (어드민 진입 동기)", () => {
    const message = formatDigestMessage({
      ...ZERO,
      cronFailures24h: 4,
    });
    expect(message).toContain("cron 실패 4");
  });

  it("link 는 메시지에 포함 안 됨 (link 결정은 cron 라우터 책임)", () => {
    const message = formatDigestMessage(ZERO);
    expect(message).not.toContain("keepioo.com");
  });
});

describe("reviewQueueTotal", () => {
  it("dedupe + naver-blog 합산", () => {
    expect(
      reviewQueueTotal({ ...ZERO, dedupePending: 3, naverBlogPending: 2 }),
    ).toBe(5);
  });

  it("0 큐 — 0 반환 (link 미노출 신호)", () => {
    expect(reviewQueueTotal(ZERO)).toBe(0);
  });
});
