import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth-server";
import { buildThreadsAuthorizeUrl } from "@/lib/threads/oauth";

export const dynamic = "force-dynamic";
const STATE_COOKIE = "threads_oauth_state";

export async function GET() {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.keepioo.com";
  const redirectUri = `${site}/api/threads/oauth/callback`;
  const state = randomBytes(24).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  try {
    return NextResponse.redirect(buildThreadsAuthorizeUrl(redirectUri, state));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "oauth_env_missing" }, { status: 500 });
  }
}
