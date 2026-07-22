import { NextResponse } from "next/server";
import {
  triggerProductionRedeploy,
  upsertProjectEnvByKey,
} from "@/lib/vercel/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const BOOTSTRAP_TOKEN = "LXs7Tdi_qRUzjnOYVXt0-gaSr6XM_9kTkSkStya6p20";
const EXPECTED_KEYS = [
  "SC_SITE_URL",
  "SC_CLIENT_ID",
  "SC_CLIENT_SECRET",
  "SC_REFRESH_TOKEN",
] as const;

type Key = (typeof EXPECTED_KEYS)[number];

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${BOOTSTRAP_TOKEN}`) return unauthorized();

  let body: Partial<Record<Key, string>>;
  try {
    body = (await request.json()) as Partial<Record<Key, string>>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  for (const key of EXPECTED_KEYS) {
    if (!body[key] || typeof body[key] !== "string") {
      return NextResponse.json({ error: `missing ${key}` }, { status: 400 });
    }
  }

  const results = [];
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
    return NextResponse.json({ ok: true, results, deployment });
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
