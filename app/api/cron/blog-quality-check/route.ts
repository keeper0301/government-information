// ============================================================
// A1 — 블로그 발행 자동 품질 검수 cron.
// ============================================================
// 매일 KST 07:00 (UTC 22:00 전날) — GitHub Actions blog publish (06:00 UTC) 후 1시간.
// 24h 안 발행된 admin_reviewed_at IS NULL 인 글에 대해 LLM 평가 + 점수 저장.
// score ≤ 2 → admin_review_required=true + audit log → 사장님 검수 큐 노출.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateBlogQuality } from "@/lib/blog/quality-check";
import { logAdminAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_LIMIT = 50;

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

interface BlogPost {
  id: string;
  title: string;
  content: string;
}

function mergeCandidates(...groups: BlogPost[][]): BlogPost[] {
  const map = new Map<string, BlogPost>();
  for (const group of groups) {
    for (const post of group) {
      if (!map.has(post.id)) map.set(post.id, post);
    }
  }
  return Array.from(map.values()).slice(0, BATCH_LIMIT);
}

async function run() {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 24h 발행 + 미검수 글 fetch
  const { data: recentPosts, error } = await admin
    .from("blog_posts")
    .select("id, title, content")
    .gte("published_at", since24h)
    .is("admin_reviewed_at", null)
    .limit(BATCH_LIMIT);

  if (error) {
    return NextResponse.json(
      { ok: false, error: `query_failed: ${error.message}` },
      { status: 500 },
    );
  }

  // 외부 발행 품질 게이트가 admin_review_required=false 를 요구하므로,
  // 24h 윈도우를 놓친 미검수 대기 글도 함께 평가한다.
  const [instagramPending, naverPending] = await Promise.all([
    admin
      .from("blog_posts")
      .select("id, title, content")
      .not("published_at", "is", null)
      .is("instagram_published_at", null)
      .is("admin_reviewed_at", null)
      .limit(BATCH_LIMIT),
    admin
      .from("naver_blog_queue")
      .select(
        "blog_post:blog_posts!inner(id, title, content, admin_reviewed_at)",
      )
      .eq("status", "pending")
      .is("blog_post.admin_reviewed_at", null)
      .limit(BATCH_LIMIT),
  ]);

  const naverPosts = ((naverPending.data ?? []) as Array<{ blog_post: unknown }>)
    .map((row) => (Array.isArray(row.blog_post) ? row.blog_post[0] : row.blog_post))
    .filter((post): post is BlogPost => {
      return (
        !!post &&
        typeof post === "object" &&
        "id" in post &&
        "title" in post &&
        "content" in post
      );
    });

  const list = mergeCandidates(
    (recentPosts ?? []) as BlogPost[],
    (instagramPending.data ?? []) as BlogPost[],
    naverPosts,
  );
  let evaluated = 0;
  let flagged = 0;
  let scoreSum = 0;

  for (const p of list) {
    const result = await evaluateBlogQuality({
      title: p.title,
      content: p.content ?? "",
    });
    evaluated += 1;
    scoreSum += result.score;

    const { error: updateErr } = await admin
      .from("blog_posts")
      .update({
        admin_review_score: result.score,
        admin_review_required: result.needsReview,
        admin_reviewed_at: new Date().toISOString(),
      })
      .eq("id", p.id);

    if (!updateErr && result.needsReview) {
      flagged += 1;
      try {
        await logAdminAction({
          actorId: null,
          action: "blog_quality_flag",
          details: {
            id: p.id,
            title: p.title.slice(0, 80),
            score: result.score,
            reason: result.reason,
            improvements: result.improvements,
          },
        });
      } catch (auditErr) {
        console.warn("[blog-quality-check] audit 실패:", auditErr);
      }
    }
  }

  const avgScore = evaluated > 0 ? Math.round((scoreSum / evaluated) * 10) / 10 : 0;

  return NextResponse.json({
    ok: true,
    evaluated,
    flagged,
    avgScore,
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
