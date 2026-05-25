// ============================================================
// A1 — 블로그 발행 자동 품질 검수 cron.
// ============================================================
// 매일 KST 07:00 (UTC 22:00 전날) — GitHub Actions blog publish (06:00 UTC) 후 1시간.
// 24h 안 발행된 admin_reviewed_at IS NULL 인 글에 대해 LLM 평가 + 점수 저장.
// score ≤ 2 → admin_review_required=true + audit log → 사장님 검수 큐 노출.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  evaluateBlogQuality,
  isTransientQualityReviewFailure,
} from "@/lib/blog/quality-check";
import { logAdminAction } from "@/lib/admin-actions";
import { enqueueNaverBlog } from "@/lib/naver-blog/queue";
import { publishToWordPress } from "@/lib/wordpress/publisher";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_LIMIT = 50;
// 5/18 parallel batch 도입 — sequential 50 posts × ~10s LLM = ~500s > 300s timeout.
// BATCH_SIZE=4 → 50/4=13 batches × ~10s = ~130s. LLM rate limit (Anthropic/OpenAI)
// 도 동시 4 호출은 안전 (분당 50 req 한계 충분 margin).
const BATCH_SIZE = 4;

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  content: string;
  meta_description: string | null;
  tags: string[] | null;
  category: string | null;
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

type ExternalReleaseResult = {
  naverQueued: boolean;
  wordpressAttempted: boolean;
};

async function releaseApprovedPostToExternalChannels(
  post: BlogPost,
): Promise<ExternalReleaseResult> {
  const result: ExternalReleaseResult = {
    naverQueued: false,
    wordpressAttempted: false,
  };

  try {
    result.naverQueued = await enqueueNaverBlog(post.id);
  } catch (e) {
    console.warn(
      `[blog-quality-check] naver enqueue 실패 (quality pass): ${(e as Error).message}`,
    );
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("wordpress_publish_log")
      .select("status")
      .eq("blog_post_id", post.id)
      .eq("status", "published")
      .maybeSingle();
    if (data) return result;

    result.wordpressAttempted = true;
    await publishToWordPress(post.id, {
      slug: post.slug,
      title: post.title,
      meta_description: post.meta_description,
      content: post.content,
      tags: post.tags,
      category: post.category,
    });
  } catch (e) {
    console.warn(
      `[blog-quality-check] wordpress release 실패 (quality pass): ${(e as Error).message}`,
    );
  }
  return result;
}

async function run() {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 24h 발행 + 미검수 글 fetch
  const { data: recentPosts, error } = await admin
    .from("blog_posts")
    .select("id, slug, title, content, meta_description, tags, category")
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
      .select("id, slug, title, content, meta_description, tags, category")
      .not("published_at", "is", null)
      .is("instagram_published_at", null)
      .is("admin_reviewed_at", null)
      .limit(BATCH_LIMIT),
    admin
      .from("naver_blog_queue")
      .select(
        "blog_post:blog_posts!inner(id, slug, title, content, meta_description, tags, category, admin_reviewed_at)",
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
  // 단일 post 평가 + DB update + 조건부 외부 발행. throw 안 함 (각 단계 try/catch 또는 error return).
  async function evaluateOne(p: BlogPost): Promise<{
    score: number;
    flagged: boolean;
    naverReleased: boolean;
    wordpressReleased: boolean;
  }> {
    const result = await evaluateBlogQuality(
      { title: p.title, content: p.content ?? "" },
      { failClosed: true },
    );
    const isTransientQualityFailure = isTransientQualityReviewFailure(result);

    const { error: updateErr } = await admin
      .from("blog_posts")
      .update({
        admin_review_score: result.score,
        admin_review_required: result.needsReview,
        admin_reviewed_at: isTransientQualityFailure
          ? null
          : new Date().toISOString(),
      })
      .eq("id", p.id);

    if (updateErr) {
      return { score: result.score, flagged: false, naverReleased: false, wordpressReleased: false };
    }

    if (result.needsReview) {
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
      return { score: result.score, flagged: true, naverReleased: false, wordpressReleased: false };
    }

    const release = await releaseApprovedPostToExternalChannels(p);
    return {
      score: result.score,
      flagged: false,
      naverReleased: release.naverQueued,
      wordpressReleased: release.wordpressAttempted,
    };
  }

  let evaluated = 0;
  let flagged = 0;
  let releasedNaver = 0;
  let releasedWordPress = 0;
  let scoreSum = 0;

  // BATCH_SIZE 단위 병렬 처리 — chunk 간 sequential 로 LLM API rate limit 보호.
  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const chunk = list.slice(i, i + BATCH_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async (p) => {
        try {
          return await evaluateOne(p);
        } catch (e) {
          console.warn(`[blog-quality-check] ${p.id} evaluate 실패:`, (e as Error).message);
          return { score: 0, flagged: false, naverReleased: false, wordpressReleased: false };
        }
      }),
    );
    for (const r of chunkResults) {
      evaluated += 1;
      scoreSum += r.score;
      if (r.flagged) flagged += 1;
      if (r.naverReleased) releasedNaver += 1;
      if (r.wordpressReleased) releasedWordPress += 1;
    }
  }

  const avgScore = evaluated > 0 ? Math.round((scoreSum / evaluated) * 10) / 10 : 0;

  return NextResponse.json({
    ok: true,
    evaluated,
    flagged,
    releasedExternal: releasedNaver + releasedWordPress,
    releasedNaver,
    releasedWordPress,
    avgScore,
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
