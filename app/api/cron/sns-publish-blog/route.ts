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
import { logAdminAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_LIMIT = 10; // 매일 10건 cap. blog 발행량 더 많으면 다음 day 점진 처리.

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

  // 이미 SNS 게시한 글 제외 (admin_actions.sns_publish_run 의 details.id 매칭)
  const { data: alreadyRun } = await admin
    .from("admin_actions")
    .select("details")
    .eq("action", "sns_publish_run")
    .gte("created_at", since24h);
  const alreadyIds = new Set<string>(
    ((alreadyRun ?? []) as Array<{ details?: { id?: string } | null }>)
      .map((r) => r.details?.id)
      .filter((v): v is string => !!v),
  );

  const processedResults: Array<{ id: string; results: unknown[] }> = [];
  for (const p of list) {
    if (alreadyIds.has(p.id)) continue;

    const results = await dispatchBlogToSns({
      title: p.title,
      slug: p.slug,
      // 5/18 fix — blog_posts.description column 부재. meta_description (150~160자) 으로 대체.
      // dispatch.ts:37 이 100자 truncate 하므로 자연스럽게 호환.
      description: p.meta_description,
    });
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

  return NextResponse.json({
    ok: true,
    processed: processedResults.length,
    results: processedResults,
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
