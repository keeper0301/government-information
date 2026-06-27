// ============================================================
// C1 — 매일 KST 11:00 24h 발행 blog 자동 SNS 3종 게시 cron.
// ============================================================
// 24h 안 published_at + admin_actions.sns_publish_run 미실행 글에 대해
// dispatchBlogToSns (Twitter / Facebook / Threads) 호출.
// SNS env 미설정 시 graceful skip (ok:false / reason:'skipped_no_credentials').
//
// 인스타는 별도 cron (/api/cron/instagram-publish) 이 DB-based OAuth + carousel
// 카드 3장 발행으로 처리. 여기 포함 X (2026-05-14 review 정리).

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchBlogToSns } from "@/lib/sns/dispatch";
import { pendingChannelsForPost, type SnsRunRow } from "@/lib/sns/publish-dedupe";
import { applyThreadsCadence, createThreadsCadenceState, type ThreadsCadenceRunRow } from "@/lib/sns/threads-cadence";
import { logAdminAction } from "@/lib/admin-actions";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_LIMIT = 10; // 매일 10건 cap. blog 발행량 더 많으면 다음 day 점진 처리.

interface BlogPostRow {
  id: string;
  title: string;
  slug: string;
  meta_description: string | null;
}

async function run() {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 24h 발행 + admin_review_required=false (낮은 점수 글은 SNS 게시 X — A1 결합)
  const { data: posts, error } = await admin
    .from("blog_posts")
    .select("id, title, slug, meta_description")
    .gte("published_at", since24h)
    .eq("admin_review_required", false)
    .limit(BATCH_LIMIT);

  if (error) {
    return NextResponse.json(
      { ok: false, error: `query_failed: ${error.message}` },
      { status: 500 },
    );
  }

  const list = (posts ?? []) as BlogPostRow[];
  if (list.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  // 이미 성공한 채널만 제외. 실패한 채널은 재시도 대상으로 남긴다.
  const { data: alreadyRun, error: alreadyRunError } = await admin
    .from("admin_actions")
    .select("details, created_at")
    .eq("action", "sns_publish_run")
    .gte("created_at", since24h);
  if (alreadyRunError) {
    return NextResponse.json(
      { ok: false, error: `dedupe_query_failed: ${alreadyRunError.message}` },
      { status: 500 },
    );
  }
  const priorRuns = (alreadyRun ?? []) as SnsRunRow[];
  const threadsCadence = createThreadsCadenceState((alreadyRun ?? []) as ThreadsCadenceRunRow[]);

  const processedResults: Array<{ id: string; results: unknown[] }> = [];
  for (const p of list) {
    const pendingChannels = pendingChannelsForPost(priorRuns, p.id);
    const cadence = applyThreadsCadence(pendingChannels, threadsCadence);
    if (cadence.channels.length === 0) {
      if (cadence.skippedReason) {
        processedResults.push({
          id: p.id,
          results: [{ channel: "threads", ok: false, reason: cadence.skippedReason }],
        });
      }
      continue;
    }

    const results = await dispatchBlogToSns({
      title: p.title,
      slug: p.slug,
      // 5/18 fix — blog_posts.description column 부재. meta_description (150~160자) 으로 대체.
      // dispatch.ts:37 이 100자 truncate 하므로 자연스럽게 호환.
      description: p.meta_description,
    }, { channels: cadence.channels });
    if (cadence.skippedReason) {
      results.push({ channel: "threads", ok: false, reason: cadence.skippedReason });
    }
    processedResults.push({ id: p.id, results });

    try {
      await logAdminAction({
        actorId: null,
        action: "sns_publish_run",
        details: {
          id: p.id,
          title: p.title.slice(0, 80),
          results,
        },
      });
    } catch (e) {
      console.warn("[sns-publish-blog] audit 실패:", e);
    }
  }

  // 5/22: caption AI 티 검출 시 사장님 즉시 알림 (사장님 5/22 명시)
  // validate-caption 이 ok:false reason:caption_violations 반환 → admin 가시 + 즉시 알림
  const violationItems: Array<{ id: string; title: string; channels: string[]; reasons: string[] }> = [];
  for (const proc of processedResults) {
    const violations = (proc.results as Array<{ channel: string; ok: boolean; reason?: string }>)
      .filter((r) => !r.ok && r.reason?.startsWith("caption_violations:"));
    if (violations.length > 0) {
      const post = list.find((p) => p.id === proc.id);
      violationItems.push({
        id: proc.id,
        title: post?.title.slice(0, 60) ?? "(제목 없음)",
        channels: violations.map((v) => v.channel),
        reasons: violations.map((v) => v.reason?.slice(0, 120) ?? "").filter(Boolean),
      });
    }
  }
  if (violationItems.length > 0) {
    try {
      const { sendOpsAlertTelegram } = await import("@/lib/notifications/telegram-ops-alert");
      const msg = violationItems
        .map(
          (v) =>
            `- ${v.title}\n  channels: ${v.channels.join(", ")}\n  ${v.reasons[0] ?? ""}`,
        )
        .join("\n\n");
      await sendOpsAlertTelegram({
        subject: `🚨 SNS 발행 차단 — caption AI 티 ${violationItems.length}건`,
        message: `${msg}\n\nadmin 에서 caption 수정 후 재발행 필요. blog_posts.title/meta_description LLM 결과가 금지 phrase 포함.`,
      });
    } catch (e) {
      console.warn("[sns-publish-blog] caption_violations 알림 실패:", e);
    }
  }

  return NextResponse.json({
    ok: true,
    processed: processedResults.length,
    caption_violations: violationItems.length,
    results: processedResults,
  });
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}

export async function POST(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}
