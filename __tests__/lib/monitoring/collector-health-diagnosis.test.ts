// 자가치유 감지 확장 — collector 진단 분류 회귀 방어.
// 5가지 상태(healthy/healthy_no_new/list_broken/body_fail/no_audit) 분기 검증.

import { describe, it, expect } from "vitest";
import {
  diagnoseCollectors,
  isProblemStatus,
  formatCollectorProblems,
  expectedCollectorsFromRegistry,
  type ScrapeAuditRow,
  type ExpectedCollector,
} from "@/lib/monitoring/collector-health-diagnosis";

// 테스트용 고정 expected (registry 전체에 의존하지 않도록).
const EXPECTED: ExpectedCollector[] = [
  { city: "가시", sourceCode: "local-press-healthy" },
  { city: "나시", sourceCode: "local-press-nonew" },
  { city: "다시", sourceCode: "local-press-listbroken" },
  { city: "라시", sourceCode: "local-press-bodyfail" },
  { city: "마시", sourceCode: "local-press-noaudit" },
];

function row(p: Partial<ScrapeAuditRow> & { city: string }): ScrapeAuditRow {
  return {
    fetched: 0,
    inserted: 0,
    errors: 0,
    createdAt: "2026-06-09T00:00:00Z",
    ...p,
  };
}

describe("diagnoseCollectors 상태 분류", () => {
  const audit: ScrapeAuditRow[] = [
    row({ city: "가시", fetched: 10, inserted: 3 }), // healthy
    row({ city: "나시", fetched: 10, inserted: 0 }), // 신규 없음 = healthy_no_new
    row({ city: "다시", fetched: 0, inserted: 0 }), // fetched 0 = list_broken
    row({ city: "라시", fetched: 10, inserted: 0, errors: 2 }), // errors+insert0 = body_fail
    // 마시: audit 행 없음 = no_audit
  ];
  const result = diagnoseCollectors(audit, EXPECTED);
  const byCity = Object.fromEntries(result.map((d) => [d.city, d]));

  it("inserted>0 → healthy", () => {
    expect(byCity["가시"].status).toBe("healthy");
  });
  it("fetched>0·inserted0·errors0 → healthy_no_new (정상)", () => {
    expect(byCity["나시"].status).toBe("healthy_no_new");
    expect(isProblemStatus(byCity["나시"].status)).toBe(false);
  });
  it("fetched0 → list_broken (사이트/selector 변경 의심)", () => {
    expect(byCity["다시"].status).toBe("list_broken");
    expect(isProblemStatus(byCity["다시"].status)).toBe(true);
  });
  it("fetched>0·inserted0·errors>0 → body_fail", () => {
    expect(byCity["라시"].status).toBe("body_fail");
    expect(isProblemStatus(byCity["라시"].status)).toBe(true);
  });
  it("audit 행 없음 → no_audit (cron 노쇼 의심)", () => {
    expect(byCity["마시"].status).toBe("no_audit");
    expect(isProblemStatus(byCity["마시"].status)).toBe(true);
  });

  it("모든 진단에 원인·제안 문자열 존재", () => {
    for (const d of result) {
      expect(d.cause.length).toBeGreaterThan(0);
      expect(d.suggestion.length).toBeGreaterThan(0);
    }
  });
});

describe("같은 city 여러 run 합산", () => {
  it("24h 내 2회 cron run fetched/inserted 누적", () => {
    const audit: ScrapeAuditRow[] = [
      row({ city: "가시", fetched: 10, inserted: 0, createdAt: "2026-06-09T01:00:00Z" }),
      row({ city: "가시", fetched: 10, inserted: 2, createdAt: "2026-06-09T13:00:00Z" }),
    ];
    const [d] = diagnoseCollectors(audit, [
      { city: "가시", sourceCode: "local-press-x" },
    ]);
    expect(d.fetched).toBe(20);
    expect(d.inserted).toBe(2);
    expect(d.status).toBe("healthy"); // 합산 inserted 2 > 0
    expect(d.lastRunAt).toBe("2026-06-09T13:00:00Z"); // 최신 run
  });
});

describe("formatCollectorProblems", () => {
  it("문제 0건 → 빈 문자열(정상 시 noise 0)", () => {
    const audit: ScrapeAuditRow[] = [row({ city: "가시", fetched: 10, inserted: 5 })];
    const result = diagnoseCollectors(audit, [
      { city: "가시", sourceCode: "local-press-x" },
    ]);
    expect(formatCollectorProblems(result)).toBe("");
  });

  it("문제 있으면 city·원인·제안 포함", () => {
    const result = diagnoseCollectors([], [
      { city: "마시", sourceCode: "local-press-noaudit" },
    ]);
    const msg = formatCollectorProblems(result);
    expect(msg).toContain("마시");
    expect(msg).toContain("제안");
  });
});

describe("expectedCollectorsFromRegistry", () => {
  it("registry 파생 — 23 collector·중복 city(사상구) dedupe 후 22", () => {
    const expected = expectedCollectorsFromRegistry();
    // 사상(알림)+사상소식지 = 같은 city '사상구' → dedupe로 1개. 23 → 22.
    expect(expected.length).toBe(22);
    const cities = expected.map((e) => e.city);
    expect(new Set(cities).size).toBe(cities.length); // city 중복 0
    expect(cities).toContain("의정부시");
    expect(cities).toContain("평택시");
  });
});
