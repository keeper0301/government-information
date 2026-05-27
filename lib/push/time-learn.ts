// ============================================================
// PWA 푸시 시점 학습 (Spec 3-B 자가 진화 학습)
// ============================================================
// 매주 월 03:00 KST cron 이 사용자별로:
//   1. push_notification_log 30일 fetch (sent_hour_kst × clicked_at)
//   2. 시간대별 click_rate 계산
//   3. 상위 3개 시간대 → preferred_hours update
//   4. push_user_preferences.last_learned_at + total_sent_for_learn 갱신
//
// 학습 가드:
//   - 누적 발송 < 14건: 학습 skip (default [9,12,18] 유지)
//   - click 0 인 사용자: default 유지 (선호 불명)
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type HourClickStat = {
  hour: number;
  sent: number;
  clicked: number;
  clickRate: number; // 0~1
};

export type UserLearnResult = {
  userId: string;
  totalSent: number;
  totalClicked: number;
  oldPreferredHours: number[];
  newPreferredHours: number[];
  perHour: HourClickStat[];
  changed: boolean;
  skipped: boolean;
  skipReason?: string;
};

const MIN_SENT_FOR_LEARN = 14;
const DEFAULT_HOURS = [9, 12, 18];
const TOP_N = 3;

// 사용자 1명의 30일 데이터 학습
export async function learnUserPreferredHours(
  userId: string,
): Promise<UserLearnResult> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();

  const { data, error } = await admin
    .from("push_notification_log")
    .select("sent_hour_kst, clicked_at")
    .eq("user_id", userId)
    .eq("send_status", "success") // 실패는 학습 데이터 X
    .gte("sent_at", since)
    .limit(5000);

  if (error || !data) {
    return {
      userId,
      totalSent: 0,
      totalClicked: 0,
      oldPreferredHours: DEFAULT_HOURS,
      newPreferredHours: DEFAULT_HOURS,
      perHour: [],
      changed: false,
      skipped: true,
      skipReason: `db_error: ${error?.message ?? "no_data"}`,
    };
  }

  // 현재 preferred 조회 (이전 학습 결과 또는 default)
  const { data: prefRow } = await admin
    .from("push_user_preferences")
    .select("preferred_hours")
    .eq("user_id", userId)
    .maybeSingle();
  const oldPreferredHours: number[] =
    (prefRow?.preferred_hours as number[] | undefined) ?? DEFAULT_HOURS;

  // 누적 발송 부족 → 학습 skip
  if (data.length < MIN_SENT_FOR_LEARN) {
    return {
      userId,
      totalSent: data.length,
      totalClicked: data.filter((r) => r.clicked_at).length,
      oldPreferredHours,
      newPreferredHours: oldPreferredHours,
      perHour: [],
      changed: false,
      skipped: true,
      skipReason: `insufficient_data: ${data.length} < ${MIN_SENT_FOR_LEARN}`,
    };
  }

  // 시간대별 집계
  const perHourMap = new Map<number, { sent: number; clicked: number }>();
  for (let h = 0; h < 24; h++) perHourMap.set(h, { sent: 0, clicked: 0 });
  for (const row of data as Array<{ sent_hour_kst: number; clicked_at: string | null }>) {
    const entry = perHourMap.get(row.sent_hour_kst);
    if (!entry) continue;
    entry.sent += 1;
    if (row.clicked_at) entry.clicked += 1;
  }
  const perHour: HourClickStat[] = Array.from(perHourMap.entries()).map(
    ([hour, { sent, clicked }]) => ({
      hour,
      sent,
      clicked,
      clickRate: sent > 0 ? clicked / sent : 0,
    }),
  );

  const totalClicked = perHour.reduce((s, e) => s + e.clicked, 0);

  // 클릭 0 → default 유지 (선호 불명)
  if (totalClicked === 0) {
    return {
      userId,
      totalSent: data.length,
      totalClicked: 0,
      oldPreferredHours,
      newPreferredHours: oldPreferredHours,
      perHour,
      changed: false,
      skipped: true,
      skipReason: "no_clicks_yet",
    };
  }

  // 상위 N 시간대 (click_rate 내림차순, 동률이면 발송량 적은 시간 우선 — 신호 강도 우선)
  const ranked = perHour
    .filter((e) => e.sent > 0)
    .sort((a, b) => {
      if (b.clickRate !== a.clickRate) return b.clickRate - a.clickRate;
      return b.clicked - a.clicked; // 동률이면 click 수 많은 시간 우선
    })
    .slice(0, TOP_N)
    .map((e) => e.hour)
    .sort((a, b) => a - b); // 시간 오름차순으로 저장

  const newPreferredHours = ranked.length > 0 ? ranked : DEFAULT_HOURS;
  const changed =
    newPreferredHours.length !== oldPreferredHours.length ||
    newPreferredHours.some((h, i) => h !== oldPreferredHours[i]);

  return {
    userId,
    totalSent: data.length,
    totalClicked,
    oldPreferredHours,
    newPreferredHours,
    perHour,
    changed,
    skipped: false,
  };
}

// learn 결과를 push_user_preferences 에 upsert
export async function persistUserLearnResult(
  result: UserLearnResult,
): Promise<void> {
  if (result.skipped) {
    // 학습 데이터 부족 → row 만 보장 (preferred_hours default 유지)
    const admin = createAdminClient();
    await admin
      .from("push_user_preferences")
      .upsert(
        {
          user_id: result.userId,
          total_sent_for_learn: result.totalSent,
          last_learned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    return;
  }

  const admin = createAdminClient();
  const clickRateMap: Record<string, number> = {};
  for (const h of result.perHour) {
    if (h.sent > 0) {
      // 소수점 4자리로 반올림 (JSONB 크기 절약)
      clickRateMap[String(h.hour)] = Math.round(h.clickRate * 10000) / 10000;
    }
  }

  await admin.from("push_user_preferences").upsert(
    {
      user_id: result.userId,
      preferred_hours: result.newPreferredHours,
      click_rate_per_hour: clickRateMap,
      total_sent_for_learn: result.totalSent,
      last_learned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

// 활성 subscriber 의 user_id 목록 — push-time-learn cron 의 학습 대상
export async function listActiveLearnUsers(): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("push_subscriptions")
    .select("user_id")
    .not("user_id", "is", null);
  if (!data) return [];
  const set = new Set<string>();
  for (const row of data as { user_id: string | null }[]) {
    if (row.user_id) set.add(row.user_id);
  }
  return [...set];
}

// shouldSendForUserAtHour 는 push-send cron 의 prefByUser map 으로 대체 (N+1 차단) — dead export 제거
