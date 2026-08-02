import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth-server";
import { logAdminAction } from "@/lib/admin-actions";
import {
  publishApprovedThreadsCandidates,
  type ThreadsCandidateInput,
} from "@/lib/sns/threads-candidate-publisher";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RequestBody = {
  candidates?: ThreadsCandidateInput[];
  dryRun?: boolean;
  approved?: boolean;
};

function normalizeCandidates(value: unknown): ThreadsCandidateInput[] {
  if (!Array.isArray(value)) return [];
  const candidates: ThreadsCandidateInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.title !== "string" || !row.title.trim()) continue;
    candidates.push({
      title: row.title.trim(),
      url: typeof row.url === "string" ? row.url : null,
      region: typeof row.region === "string" ? row.region : null,
      applyEnd: typeof row.applyEnd === "string" ? row.applyEnd : null,
    });
    if (candidates.length >= 5) break;
  }
  return candidates;
}

export async function POST(request: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const candidates = normalizeCandidates(body.candidates);
  if (candidates.length === 0) {
    return NextResponse.json({ error: "candidates_required" }, { status: 400 });
  }

  const dryRun = body.dryRun !== false;
  const approved = body.approved === true;
  const results = await publishApprovedThreadsCandidates(candidates, { dryRun, approved });
  const published = results.filter((item) => item.published).length;

  try {
    await logAdminAction({
      actorId: user.id,
      action: "threads_candidate_publish_run",
      details: {
        dryRun,
        approved,
        candidateCount: candidates.length,
        published,
        titles: candidates.map((candidate) => candidate.title.slice(0, 80)),
        results: results.map((item) => ({
          title: item.title.slice(0, 80),
          source: item.source,
          published: item.published,
          ok: item.result?.ok ?? null,
          reason: item.result && !item.result.ok ? item.result.reason : undefined,
          validation: item.validation,
        })),
      },
    });
  } catch (e) {
    console.warn("[threads-candidate-publish] audit 실패:", e);
  }

  return NextResponse.json({
    success: true,
    dryRun,
    approved,
    publishGateEnabled: process.env.THREADS_CANDIDATE_PUBLISH_ENABLED === "true",
    published,
    results,
  });
}
