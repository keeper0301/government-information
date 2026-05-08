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
  pressProvincePct: 0,
  dedupeRandomSample: null,
  // Task 9 (2026-05-08) — 자동 등록·회수·low 큐 가시성
  autoConfirm24h: 0,
  autoRevoke24h: 0,
  pressLowTierBacklog: 0,
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

  it("press 자동 등록 0 — 광역 의존도 라벨 미포함 (의미 X)", () => {
    const message = formatDigestMessage({
      ...ZERO,
      pressProvincePct: 70, // 의미 없는 값이지만 노출 X 검증
    });
    expect(message).not.toContain("광역");
  });

  it("press 자동 등록 1+ · 광역 의존도 < 80% — (광역 N%) 표기", () => {
    const message = formatDigestMessage({
      ...ZERO,
      pressAutoConfirmed24h: 30,
      pressProvincePct: 65,
    });
    expect(message).toContain("보도 30(광역65%)");
    expect(message).not.toContain("⚠");
  });

  it("press 자동 등록 1+ · 광역 의존도 80%+ — ⚠ 마크 (LLM 추출률 ↓ 신호)", () => {
    const message = formatDigestMessage({
      ...ZERO,
      pressAutoConfirmed24h: 50,
      pressProvincePct: 95,
    });
    expect(message).toContain("보도 50(광역95%⚠)");
  });

  it("dedupe 무작위 샘플 null — 라인 미포함 (점진 도입 W0 정상)", () => {
    const message = formatDigestMessage(ZERO);
    expect(message).not.toContain("샘플 dedupe");
  });

  it("dedupe 무작위 샘플 1건 — 라인 포함 (사장님 1 click 안전망)", () => {
    const message = formatDigestMessage({
      ...ZERO,
      dedupeRandomSample: {
        title: "청년 주거 안정 지원금",
        table: "welfare_programs",
      },
    });
    expect(message).toContain("샘플 dedupe 검수: 청년 주거 안정 지원금");
  });

  // Task 9 (2026-05-08) — AI 자동 등록·회수 가시성 라인
  it("Task 9 — 자동 등록·회수 모두 0 — AI 자동 등록 라인 미포함 (SMS 압축)", () => {
    const message = formatDigestMessage(ZERO);
    expect(message).not.toContain("AI 자동 등록");
  });

  it("Task 9 — 자동 등록 ≥1 — AI 자동 등록 라인 포함", () => {
    const message = formatDigestMessage({
      ...ZERO,
      autoConfirm24h: 7,
      autoRevoke24h: 0,
    });
    expect(message).toContain("AI 자동 등록 7건 / 회수 0건");
  });

  it("Task 9 — 자동 회수 ≥1 (등록 0) — 라인 포함 (회수만으로도 노출)", () => {
    const message = formatDigestMessage({
      ...ZERO,
      autoConfirm24h: 0,
      autoRevoke24h: 2,
    });
    expect(message).toContain("AI 자동 등록 0건 / 회수 2건");
  });

  it("Task 9 — low 큐 0 — low 큐 표기 부분 생략 (선택적 노출)", () => {
    const message = formatDigestMessage({
      ...ZERO,
      autoConfirm24h: 5,
      autoRevoke24h: 1,
      pressLowTierBacklog: 0,
    });
    expect(message).toContain("AI 자동 등록 5건 / 회수 1건");
    expect(message).not.toContain("low 큐");
  });

  it("Task 9 — low 큐 ≥1 + 자동 등록 ≥1 — low 큐 표기 포함", () => {
    const message = formatDigestMessage({
      ...ZERO,
      autoConfirm24h: 5,
      autoRevoke24h: 1,
      pressLowTierBacklog: 12,
    });
    expect(message).toContain("AI 자동 등록 5건 / 회수 1건 / low 큐 12");
  });

  it("Task 9 — low 큐 ≥1 만 있고 등록·회수 0 — 라인 자체 미포함 (low 큐 단독으로는 SMS 노출 X)", () => {
    // low 큐 임계 점검은 health-alert 책임 — daily-digest 는 자동 등록·회수 트리거에만 부착.
    const message = formatDigestMessage({
      ...ZERO,
      pressLowTierBacklog: 50,
    });
    expect(message).not.toContain("AI 자동 등록");
    expect(message).not.toContain("low 큐");
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
