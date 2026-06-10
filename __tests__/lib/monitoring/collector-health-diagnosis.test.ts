// 자가치유 감지 확장 — collector 진단 분류 회귀 방어.
// 5가지 상태(healthy/healthy_no_new/list_broken/body_fail/no_audit) 분기 검증.

import { describe, it, expect } from "vitest";
import {
  diagnoseCollectors,
  isProblemStatus,
  formatCollectorProblems,
  expectedCollectorsFromRegistry,
  flagInsertStops,
  formatInsertStops,
  triageFlags,
  flagCadenceRegressions,
  formatCadenceRegressions,
  type ScrapeAuditRow,
  type ExpectedCollector,
  type CityInsertStat,
  type InsertStopFlag,
  type CityCadence,
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

describe("flagInsertStops — 회귀형 silent insert-stop", () => {
  const stats: CityInsertStat[] = [
    // 강화군: 최근 0 + 활동 5일 + 이전 70 → 회귀(flag)
    { city: "강화군", recentActiveDays: 5, recentInserted: 0, baselineInserted: 70, latestFetched: "2026-06-08" },
    // 동작구: 최근에도 insert 4 → transient/정상(제외)
    { city: "동작구", recentActiveDays: 5, recentInserted: 4, baselineInserted: 30, latestFetched: "2026-06-08" },
    // 금정구: 최근 0 + 활동 5일 + 이전 0 → 원래 저발행/이관불가(제외, baseline 0)
    { city: "금정구", recentActiveDays: 5, recentInserted: 0, baselineInserted: 0, latestFetched: null },
    // 짧은활동: 최근 0 + 활동 2일(<3) → 휴재 가능성, 미flag(목록 충분히 안 돔)
    { city: "짧은시", recentActiveDays: 2, recentInserted: 0, baselineInserted: 50, latestFetched: "2026-06-08" },
  ];
  const flags = flagInsertStops(stats);

  it("이전엔 작동·최근 0·활동≥3 = 회귀만 flag (강화군)", () => {
    expect(flags.map((f) => f.city)).toEqual(["강화군"]);
  });
  it("최근에도 insert 있으면 제외 (동작구 transient)", () => {
    expect(flags.find((f) => f.city === "동작구")).toBeUndefined();
  });
  it("baseline 0(원래 저발행/이관불가)은 제외 (금정구)", () => {
    expect(flags.find((f) => f.city === "금정구")).toBeUndefined();
  });
  it("활동일 < minActiveDays 제외 (목록 안정성 부족)", () => {
    expect(flags.find((f) => f.city === "짧은시")).toBeUndefined();
  });
  it("flag detail(이전 건수) 보존", () => {
    expect(flags[0].baselineInserted).toBe(70);
    expect(flags[0].recentActiveDays).toBe(5);
  });

  it("formatInsertStops: 0건 → 빈 문자열, 있으면 city 포함", () => {
    expect(formatInsertStops([])).toBe("");
    const msg = formatInsertStops(flags);
    expect(msg).toContain("강화군");
    expect(msg).toContain("회귀");
  });
});

describe("triageFlags — auto-triage(사이트 최신 vs DB 최신)", () => {
  const F = (city: string, latestFetched: string | null): InsertStopFlag => ({
    city,
    recentActiveDays: 5,
    baselineInserted: 10,
    latestFetched,
  });

  it("사이트 최신 > DB 최신 = 진짜 버그 → keep", () => {
    const r = triageFlags([F("강화군", "2026-06-08")], { 강화군: "2026-06-02" });
    expect(r.map((f) => f.city)).toEqual(["강화군"]); // 06-08 글이 DB(06-02)에 없음 = 수집실패
  });

  it("사이트 최신 ≤ DB 최신 = 새 글 없음 → suppress(오탐 제거)", () => {
    const r = triageFlags([F("성북구", "2026-05-29")], { 성북구: "2026-05-29" });
    expect(r).toHaveLength(0); // 가져온 게 다 DB에 있음 = 무발행 정상
  });

  it("latestFetched null(구 audit) → 보수적 keep", () => {
    const r = triageFlags([F("금정구", null)], { 금정구: "2026-06-01" });
    expect(r).toHaveLength(1);
  });

  it("dbLatest null(매핑 없는 정적 collector) → 보수적 keep", () => {
    const r = triageFlags([F("동작구", "2026-06-08")], {});
    expect(r).toHaveLength(1);
  });
});

describe("flagCadenceRegressions — cron 완주 저하", () => {
  const stats: CityCadence[] = [
    // 의정부: 이전 2회/일 → 최근 0.67회/일(2/3) = 절반 이하 급락 → flag (timeout 누락)
    { city: "의정부", recentRuns: 2, recentDays: 3, baselineRuns: 22, baselineDays: 11 },
    // 정상GHA: 이전 2 → 최근 2 = 유지(제외)
    { city: "정상시", recentRuns: 6, recentDays: 3, baselineRuns: 22, baselineDays: 11 },
    // 죽은정적: 이전 1회/일 → 최근 0 = 급락(제외 X, flag — 정적 collector 死도 잡음)
    { city: "죽은구", recentRuns: 0, recentDays: 3, baselineRuns: 11, baselineDays: 11 },
    // 신규/저빈도: baseline < 1회/일 → 제외(아직 안정 아님)
    { city: "신규시", recentRuns: 0, recentDays: 3, baselineRuns: 5, baselineDays: 11 },
  ];
  const flags = flagCadenceRegressions(stats);
  const cities = flags.map((f) => f.city);

  it("이전 ≥1회/일 + 최근 절반이하 급락 = flag (의정부 timeout 누락)", () => {
    expect(cities).toContain("의정부");
  });
  it("정상 유지 collector 제외", () => {
    expect(cities).not.toContain("정상시");
  });
  it("이전 잘 돌던 정적 collector 死(최근 0) 도 flag", () => {
    expect(cities).toContain("죽은구");
  });
  it("baseline < minBaselinePerDay(저빈도/신규) 제외", () => {
    expect(cities).not.toContain("신규시");
  });
  it("recent/baseline 빈도 보존 + formatCadenceRegressions", () => {
    const f = flags.find((x) => x.city === "의정부");
    expect(f?.baselinePerDay).toBe(2);
    expect(f?.recentPerDay).toBeCloseTo(0.67, 1);
    expect(formatCadenceRegressions([])).toBe("");
    expect(formatCadenceRegressions(flags)).toContain("의정부");
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
