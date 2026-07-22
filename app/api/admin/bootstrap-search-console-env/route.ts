import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth-server";
import {
  triggerProductionRedeploy,
  upsertProjectEnvByKey,
} from "@/lib/vercel/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const EXPECTED_KEYS = [
  "SC_SITE_URL",
  "SC_CLIENT_ID",
  "SC_CLIENT_SECRET",
  "SC_REFRESH_TOKEN",
] as const;

type Key = (typeof EXPECTED_KEYS)[number];

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function assertSameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return null;
  try {
    if (new URL(origin).host !== host) {
      return jsonError("CSRF: cross-origin POST 차단", 403);
    }
  } catch {
    return jsonError("invalid origin", 400);
  }
  return null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = assertSameOrigin(request);
  if (csrfError) return csrfError;

  const user = await requireAdminUser();
  if (!user) return jsonError("unauthorized", 401);

  let body: Partial<Record<Key, string>>;
  try {
    body = (await request.json()) as Partial<Record<Key, string>>;
  } catch {
    return jsonError("invalid json", 400);
  }

  for (const key of EXPECTED_KEYS) {
    if (!body[key] || typeof body[key] !== "string") {
      return jsonError(`missing ${key}`, 400);
    }
  }

  const results: Array<{ id: string; key: string; action: "created" | "updated" }> = [];
  try {
    for (const key of EXPECTED_KEYS) {
      const result = await upsertProjectEnvByKey({
        key,
        value: body[key]!,
        target: ["production", "preview"],
        type: "encrypted",
      });
      results.push(result);
    }

    const deployment = await triggerProductionRedeploy();
    return NextResponse.json({
      ok: true,
      results: results.map((r) => ({ key: r.key, action: r.action })),
      deployment: { id: deployment.id, url: deployment.url },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        stage: results.length === EXPECTED_KEYS.length ? "redeploy" : "env_upsert",
        completed: results.map((r) => ({ key: r.key, action: r.action })),
        error: err instanceof Error ? err.message.slice(0, 500) : "unknown error",
      },
      { status: 500 },
    );
  }
}
