// ============================================================
// 1주 시·군 보도자료 수집 모니터링 — Phase D-1
// ============================================================
// 사장님 spec: "1주 모니터링 자동화로 클로드가 하고 학습하며 고친다".
//
// 매주 월 KST 09:30 cron 으로 7일 metric 수집 → 사고 패턴 분석 →
// 텔레그램 알림 (이상 시) + audit 기록.
//
// 진단 영역:
//   1) scrape-local-press cron 가동 (지난 7일 success/fail 횟수)
//   2) 도시별 inserted/skipped (사이트 차단·parse 실패 감지)
//   3) press_ingest 자동 분류 결과 (district NULL 잔여 추이)
//   4) 사장님 거주지 매칭 갯수 (47건 → N건 증감)
//
// 자동 fix 영역 (D-2 후속):
//   - skipped 비율 > 50% → parser 사고 의심 신호
//   - 연속 fail 3일 → 사이트 차단 의심
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type WeeklyMonitorReport = {
  rangeStart: string; // ISO 7일 전
  rangeEnd: string; // ISO 현재
  scrapeCronRuns: number; // 7일 가동 횟수 (정상 7회)
  scrapeMissingDays: number; // 정상 7회 대비 누락일
  cities: Array<{
    city: string;
    ministry: string;
    cronInserted: number;
    cronSkipped: number;
    cronErrors: number;
    skippedRate: number; // skipped/fetched 비율 0~1
    siteBlockedSuspect: boolean; // 연속 fail 또는 0 inserted 의심
  }>;
  pressIngestRuns: number; // 21회/주 (3회/일) 정상
  districtMatching: {
    welfareWithDistrict: number;
    welfareNullDistrict: number;
    loanWithDistrict: number;
    loanNullDistrict: number;
    sajangSuncheonWelfare: number; // 사장님 거주지 매칭 추이
  };
  alerts: string[]; // 사장님께 알릴 사고 list
};

const SCRAPE_ACTION = "local_press_scrape";
const SCRAPE_CRON_ACTION = "local_press_scrape_run";
const PRESS_INGEST_ACTION = "press_ingest_run";

// metric 수집 — 직전 7일 admin_actions + DB count.
export async function collectWeeklyMonitor(): Promise<WeeklyMonitorReport> {
  const admin = createAdminClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600_000);
  const rangeStart = sevenDaysAgo.toISOString();
  const rangeEnd = now.toISOString();

  // 1) cron 가동 횟수 (정상 7회/주)
  const { count: scrapeCronRuns } = await admin
    .from("admin_actions")
    .select("id", { count: "exact", head: true })
    .eq("action", SCRAPE_CRON_ACTION)
    .gte("created_at", rangeStart);
  const cronRuns = scrapeCronRuns ?? 0;
  const scrapeMissingDays = Math.max(0, 7 - cronRuns);

  // 2) 도시별 cron audit 분석 (trigger="cron" 만)
  const { data: cronRows } = await admin
    .from("admin_actions")
    .select("details")
    .eq("action", SCRAPE_ACTION)
    .gte("created_at", rangeStart)
    .limit(200);
  const cityStats = new Map<
    string,
    { fetched: number; inserted: number; skipped: number; errors: number; runs: number }
  >();
  for (const row of cronRows ?? []) {
    const d = (row.details ?? {}) as Record<string, unknown>;
    if (d.trigger !== "cron") continue;
    const ministry = String(d.ministry ?? "");
    if (!ministry) continue;
    const stat = cityStats.get(ministry) ?? {
      fetched: 0,
      inserted: 0,
      skipped: 0,
      errors: 0,
      runs: 0,
    };
    stat.fetched += Number(d.fetched ?? 0);
    stat.inserted += Number(d.inserted ?? 0);
    stat.skipped += Number(d.skipped ?? 0);
    stat.errors += Array.isArray(d.errors) ? (d.errors as unknown[]).length : 0;
    stat.runs += 1;
    cityStats.set(ministry, stat);
  }

  const cities = Array.from(cityStats.entries()).map(([ministry, stat]) => {
    const skippedRate = stat.fetched > 0 ? stat.skipped / stat.fetched : 0;
    const blocked =
      stat.runs > 0 && stat.inserted === 0 && stat.fetched === 0;
    return {
      city: ministry.includes("순천") ? "순천시" : ministry.includes("광주") ? "광주광역시" : ministry,
      ministry,
      cronInserted: stat.inserted,
      cronSkipped: stat.skipped,
      cronErrors: stat.errors,
      skippedRate,
      siteBlockedSuspect: blocked,
    };
  });

  // 3) press_ingest cron 가동 (정상 21회/주 = 3회/일 × 7일)
  const { count: pressIngestRuns } = await admin
    .from("admin_actions")
    .select("id", { count: "exact", head: true })
    .eq("action", PRESS_INGEST_ACTION)
    .gte("created_at", rangeStart);

  // 4) district 매칭 추이
  const [
    { count: welfareWithDistrict },
    { count: welfareNullDistrict },
    { count: loanWithDistrict },
    { count: loanNullDistrict },
    { count: sajangSuncheonWelfare },
  ] = await Promise.all([
    admin
      .from("welfare_programs")
      .select("id", { count: "exact", head: true })
      .not("district", "is", null),
    admin
      .from("welfare_programs")
      .select("id", { count: "exact", head: true })
      .is("district", null),
    admin
      .from("loan_programs")
      .select("id", { count: "exact", head: true })
      .not("district", "is", null),
    admin
      .from("loan_programs")
      .select("id", { count: "exact", head: true })
      .is("district", null),
    admin
      .from("welfare_programs")
      .select("id", { count: "exact", head: true })
      .eq("district", "순천시"),
  ]);

  // 5) 사고 패턴 분석 — alerts 생성
  const alerts: string[] = [];
  if (scrapeMissingDays >= 2) {
    alerts.push(
      `⚠️ scrape-local-press cron ${scrapeMissingDays}일 누락 (정상 7일 / 실제 ${cronRuns}일)`,
    );
  }
  for (const city of cities) {
    if (city.siteBlockedSuspect) {
      alerts.push(
        `🚫 ${city.city} 사이트 차단 의심 — 7일 동안 inserted 0건, fetched 0건. parser 또는 사이트 점검 필요`,
      );
    } else if (city.skippedRate > 0.5 && city.cronInserted + city.cronSkipped >= 10) {
      alerts.push(
        `⚠️ ${city.city} skipped 비율 ${Math.round(city.skippedRate * 100)}% (body parse 실패 의심). parser regex 검증 필요`,
      );
    }
  }
  if ((pressIngestRuns ?? 0) < 15) {
    alerts.push(
      `⚠️ press_ingest cron 가동 ${pressIngestRuns}회 (정상 21회/주). cron 노쇼 가능`,
    );
  }

  return {
    rangeStart,
    rangeEnd,
    scrapeCronRuns: cronRuns,
    scrapeMissingDays,
    cities,
    pressIngestRuns: pressIngestRuns ?? 0,
    districtMatching: {
      welfareWithDistrict: welfareWithDistrict ?? 0,
      welfareNullDistrict: welfareNullDistrict ?? 0,
      loanWithDistrict: loanWithDistrict ?? 0,
      loanNullDistrict: loanNullDistrict ?? 0,
      sajangSuncheonWelfare: sajangSuncheonWelfare ?? 0,
    },
    alerts,
  };
}

// 텔레그램 메시지 포맷
export function formatWeeklyReport(report: WeeklyMonitorReport): string {
  const rangeStartDate = report.rangeStart.slice(0, 10);
  const rangeEndDate = report.rangeEnd.slice(0, 10);
  const lines: string[] = [];

  lines.push(`📊 시·군 보도자료 1주 모니터링 (${rangeStartDate} ~ ${rangeEndDate})`);
  lines.push("");

  // 사고 우선
  if (report.alerts.length > 0) {
    lines.push("🚨 사고 신호:");
    for (const a of report.alerts) lines.push(`  ${a}`);
    lines.push("");
  } else {
    lines.push("✓ 사고 신호 없음 (안정 운영)");
    lines.push("");
  }

  lines.push(`📅 scrape cron: ${report.scrapeCronRuns}/7일 가동`);
  lines.push(`📅 press_ingest cron: ${report.pressIngestRuns}회 (정상 21회/주)`);
  lines.push("");

  lines.push("🏛️ 도시별 수집 (cron):");
  for (const c of report.cities) {
    lines.push(
      `  ${c.city}: inserted ${c.cronInserted} / skipped ${c.cronSkipped} / errors ${c.cronErrors}`,
    );
  }
  lines.push("");

  const dm = report.districtMatching;
  lines.push("🎯 district 매칭 누적:");
  lines.push(
    `  welfare: ${dm.welfareWithDistrict}건 분류 / ${dm.welfareNullDistrict}건 NULL`,
  );
  lines.push(
    `  loan: ${dm.loanWithDistrict}건 분류 / ${dm.loanNullDistrict}건 NULL`,
  );
  lines.push(`  사장님 거주지 (순천시 welfare): ${dm.sajangSuncheonWelfare}건`);

  return lines.join("\n");
}
