// app/api/cron/onboarding-reminder/route.ts
// 매일 11:05 KST cron — 가입 24h~48h 전 + 온보딩 미완 + 미발송 사용자에게
// 환영 이메일 1회 발송 (onboarding_reminders 테이블이 dedup).
// vercel.json crons: { "path": "/api/cron/onboarding-reminder", "schedule": "5 2 * * *" }

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUsersCached } from "@/lib/admin-stats";
import { sendOnboardingReminderEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authorize(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

async function run() {
  const admin = createAdminClient();
  const since48Iso = new Date(
    Date.now() - 48 * 60 * 60 * 1000,
  ).toISOString();
  const since24Iso = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();

  // 24h~48h 전 가입 사용자 후보
  const users = await getAuthUsersCached();
  const candidates = users.filter(
    (u) =>
      u.created_at &&
      u.created_at >= since48Iso &&
      u.created_at < since24Iso &&
      !u.deleted_at &&
      u.email,
  );

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, total: 0 });
  }

  const candidateIds = candidates.map((u) => u.id);

  // user_profiles 미완 + onboarding_reminders 없는 + pending_deletions 없는
  // 사용자만 필터 (30일 유예 탈퇴 사용자에게 환영 메일 가면 안 됨)
  const [profilesData, remindersData, deletionsData] = await Promise.all([
    admin
      .from("user_profiles")
      .select("id, age_group, region, occupation")
      .in("id", candidateIds),
    admin
      .from("onboarding_reminders")
      .select("user_id")
      .in("user_id", candidateIds),
    admin
      .from("pending_deletions")
      .select("user_id")
      .in("user_id", candidateIds),
  ]);

  // user_profiles row 가 있고 1개 필드라도 채워져 있으면 "온보딩 완료" 로 간주
  const filledProfileIds = new Set(
    (profilesData.data ?? [])
      .filter(
        (p: {
          age_group: string | null;
          region: string | null;
          occupation: string | null;
        }) => p.age_group || p.region || p.occupation,
      )
      .map((p: { id: string }) => p.id),
  );
  const remindedIds = new Set(
    (remindersData.data ?? []).map((r: { user_id: string }) => r.user_id),
  );
  const pendingDeletionIds = new Set(
    (deletionsData.data ?? []).map((r: { user_id: string }) => r.user_id),
  );

  const targets = candidates.filter(
    (u) =>
      !filledProfileIds.has(u.id) &&
      !remindedIds.has(u.id) &&
      !pendingDeletionIds.has(u.id),
  );

  // INSERT 먼저 → race condition 안전. INSERT 성공 후에만 발송.
  // 발송 실패 시 INSERT row 를 삭제해 다음 cron 에 재시도 가능하게 보정
  // (이전엔 Resend 1초 장애만 발생해도 그 사용자 환영메일 영영 못 받음).
  let sent = 0;
  let failed = 0;
  for (const u of targets) {
    const { error: insertError } = await admin
      .from("onboarding_reminders")
      .insert({ user_id: u.id });
    if (insertError) {
      failed++;
      continue;
    }
    const result = await sendOnboardingReminderEmail({ to: u.email! });
    if (result.ok) {
      sent++;
    } else {
      failed++;
      // 발송 실패 → INSERT 보정 (best-effort, 보정 자체 실패해도 cron 은 정상)
      const { error: deleteError } = await admin
        .from("onboarding_reminders")
        .delete()
        .eq("user_id", u.id);
      if (deleteError) {
        console.error(
          "[onboarding-reminder] dedup row 보정 실패",
          u.id,
          deleteError.message,
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    total: targets.length,
  });
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}

export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}
