// ============================================================
// 만료 정책 정리 cron — /api/cleanup-expired-programs
// ============================================================
// welfare_programs / loan_programs 에서 apply_end 가 (오늘 - RETENTION_DAYS)
// 보다 이전인 row 를 DB 에서 실제 삭제. 사이트 화면은 이미 apply_end 필터로
// 만료 건 숨김 — 이 cron 은 Disk IO/디스크 절약 목적의 영구 삭제.
//
// 2026-04-26 Disk IO Budget 사고 후속 — 누적 데이터 정리해야 IO 한도 안전.
//
// 동작:
// 1) GET (dry-run): 삭제 대상 카운트 + 샘플 5건 반환. DB 변경 X.
// 2) POST (실행): user_bookmarks·alarm_subscriptions·alert_deliveries dangling
//    pointer 정리 → blog_posts.source_program_id NULL → welfare/loan DELETE.
//
// 참조 무결성:
//   - welfare/loan 을 가리키는 외부 FK constraint 는 없음 (program_id 컬럼만 보유)
//   - 그래서 dangling pointer 가 자연 정리 안 됨 — 이 route 가 직접 정리
//
// 인증: CRON_SECRET Bearer (다른 cron 과 동일).
// 안전망: BATCH_LIMIT 으로 한 번에 너무 많이 삭제 방지. 한 번에 안 끝나면 다음 호출.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCronFailure } from "@/lib/email";

// Vercel Hobby/Pro 60s 한도 — 단순 DELETE 라 충분
export const maxDuration = 60;

// 만료 후 보존 기간. 사용자가 마감 직후 "어 어제 신청해야 했어!" 메시지 잠깐 보고
// 그 후 정리. 너무 짧으면 누적 못 막고 너무 길면 디스크 절약 효과 약함.
const RETENTION_DAYS = 30;

// 한 번에 처리할 최대 건수. POST 시 dangling pointer 정리까지 5개 테이블
// touch 하므로 보수적. 매일 cron 누적 가정하면 충분.
const BATCH_LIMIT = 200;

type CleanupResult =
  | {
      mode: "dry_run";
      cutoff_date: string;
      retention_days: number;
      welfare_count: number;
      loan_count: number;
      total: number;
      welfare_sample: { title: string; apply_end: string | null }[];
      loan_sample: { title: string; apply_end: string | null }[];
      hit_batch_limit: boolean;
    }
  | {
      mode: "executed";
      cutoff_date: string;
      retention_days: number;
      welfare_deleted: number;
      loan_deleted: number;
      bookmarks_removed: number;
      alarms_removed: number;
      deliveries_removed: number;
      blogs_nullified: number;
      batch_limit: number;
      hit_batch_limit: boolean;
      note: string;
    };

async function runCleanup(dryRun: boolean): Promise<CleanupResult> {
  const admin = createAdminClient();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
  const cutoffStr = cutoffDate.toISOString().split("T")[0];

  // 1) 만료 정책 후보 조회 — 오래된 순으로 (제일 먼저 만료된 것부터 정리)
  const [welfareResult, loanResult] = await Promise.all([
    admin
      .from("welfare_programs")
      .select("id, title, apply_end")
      .lt("apply_end", cutoffStr)
      .order("apply_end", { ascending: true })
      .limit(BATCH_LIMIT),
    admin
      .from("loan_programs")
      .select("id, title, apply_end")
      .lt("apply_end", cutoffStr)
      .order("apply_end", { ascending: true })
      .limit(BATCH_LIMIT),
  ]);

  if (welfareResult.error) {
    throw new Error(`welfare 조회 실패: ${welfareResult.error.message}`);
  }
  if (loanResult.error) {
    throw new Error(`loan 조회 실패: ${loanResult.error.message}`);
  }

  const expiredWelfare = welfareResult.data ?? [];
  const expiredLoan = loanResult.data ?? [];
  const welfareIds = expiredWelfare.map((w) => w.id);
  const loanIds = expiredLoan.map((l) => l.id);
  const allIds = [...welfareIds, ...loanIds];
  const hitBatchLimit =
    welfareIds.length === BATCH_LIMIT || loanIds.length === BATCH_LIMIT;

  if (dryRun) {
    return {
      mode: "dry_run",
      cutoff_date: cutoffStr,
      retention_days: RETENTION_DAYS,
      welfare_count: welfareIds.length,
      loan_count: loanIds.length,
      total: allIds.length,
      welfare_sample: expiredWelfare.slice(0, 5).map((w) => ({
        title: w.title,
        apply_end: w.apply_end,
      })),
      loan_sample: expiredLoan.slice(0, 5).map((l) => ({
        title: l.title,
        apply_end: l.apply_end,
      })),
      hit_batch_limit: hitBatchLimit,
    };
  }

  // 2) Dangling pointer 정리 — program_id 가 곧 dangling 될 4 테이블
  let bookmarksRemoved = 0;
  let alarmsRemoved = 0;
  let deliveriesRemoved = 0;
  let blogsNullified = 0;

  if (allIds.length > 0) {
    // user_bookmarks — composite PK (user_id, program_id, program_type) 라 id 컬럼 X
    const { data: bm, error: bmErr } = await admin
      .from("user_bookmarks")
      .delete()
      .in("program_id", allIds)
      .select("program_id");
    if (bmErr) throw new Error(`user_bookmarks 정리 실패: ${bmErr.message}`);
    bookmarksRemoved = bm?.length ?? 0;

    // alarm_subscriptions — 활성 알림 구독. 만료 정책에 알림 필요 X
    const { data: al, error: alErr } = await admin
      .from("alarm_subscriptions")
      .delete()
      .in("program_id", allIds)
      .select("program_id");
    if (alErr) throw new Error(`alarm_subscriptions 정리 실패: ${alErr.message}`);
    alarmsRemoved = al?.length ?? 0;

    // alert_deliveries — 알림 발송 history. 만료 정책 history 는 의미 약함
    const { data: de, error: deErr } = await admin
      .from("alert_deliveries")
      .delete()
      .in("program_id", allIds)
      .select("program_id");
    if (deErr) throw new Error(`alert_deliveries 정리 실패: ${deErr.message}`);
    deliveriesRemoved = de?.length ?? 0;

    // blog_posts — 글 자체는 보존 (콘텐츠 SEO 가치). source_program_id 만 NULL
    const { data: bg, error: bgErr } = await admin
      .from("blog_posts")
      .update({ source_program_id: null })
      .in("source_program_id", allIds)
      .select("source_program_id");
    if (bgErr) throw new Error(`blog_posts 정리 실패: ${bgErr.message}`);
    blogsNullified = bg?.length ?? 0;
  }

  // 3) 정책 본체 삭제
  let welfareDeleted = 0;
  let loanDeleted = 0;

  if (welfareIds.length > 0) {
    const { data, error } = await admin
      .from("welfare_programs")
      .delete()
      .in("id", welfareIds)
      .select("id");
    if (error) throw new Error(`welfare_programs 삭제 실패: ${error.message}`);
    welfareDeleted = data?.length ?? 0;
  }

  if (loanIds.length > 0) {
    const { data, error } = await admin
      .from("loan_programs")
      .delete()
      .in("id", loanIds)
      .select("id");
    if (error) throw new Error(`loan_programs 삭제 실패: ${error.message}`);
    loanDeleted = data?.length ?? 0;
  }

  return {
    mode: "executed",
    cutoff_date: cutoffStr,
    retention_days: RETENTION_DAYS,
    welfare_deleted: welfareDeleted,
    loan_deleted: loanDeleted,
    bookmarks_removed: bookmarksRemoved,
    alarms_removed: alarmsRemoved,
    deliveries_removed: deliveriesRemoved,
    blogs_nullified: blogsNullified,
    batch_limit: BATCH_LIMIT,
    hit_batch_limit: hitBatchLimit,
    note: hitBatchLimit
      ? "BATCH_LIMIT 도달 — 남은 건이 있을 수 있음. 다시 실행 권장."
      : "처리 완료",
  };
}

function checkAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

// GET — dry-run (DB 변경 X). 카운트 + 샘플 5건 반환.
export async function GET(request: NextRequest) {
  const auth = checkAuth(request);
  if (auth) return auth;
  try {
    const result = await runCleanup(true);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json(
      { error: "dry-run 실패", detail: message },
      { status: 500 },
    );
  }
}

// POST — 실제 삭제. 실패 시 운영자 이메일 알림.
export async function POST(request: NextRequest) {
  const auth = checkAuth(request);
  if (auth) return auth;
  try {
    const result = await runCleanup(false);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    try {
      await notifyCronFailure("cleanup-expired-programs", message);
    } catch (notifyErr) {
      console.error("[cleanup] notifyCronFailure 실패:", notifyErr);
    }
    return NextResponse.json(
      { error: "cleanup 실패", detail: message },
      { status: 500 },
    );
  }
}
