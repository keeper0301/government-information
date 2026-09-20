import { NextResponse } from "next/server";
import { authorizeNaverExtensionRequest } from "@/lib/naver-extension-auth";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { reconcileNaverPublishSuccess } from "@/lib/naver-blog/publish-reconciliation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  queueId?: string;
  contentId?: string;
  contentFingerprint?: string;
  naverUrl?: string;
  logNo?: string;
  title?: string;
  corePhrase?: string;
  dryRun?: boolean;
  readbackOnly?: boolean;
};

export async function POST(request: Request) {
  const extensionDenied = authorizeNaverExtensionRequest(request);
  if (extensionDenied) {
    const cronDenied = authorizeCronRequest(request);
    if (cronDenied) return extensionDenied;
  }
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.queueId || !body.contentId || !body.contentFingerprint || !body.naverUrl
    || !body.logNo || !body.title || !body.corePhrase) {
    return NextResponse.json(
      { ok: false, error: "exact queue/content/fingerprint/naverUrl/logNo/title/corePhrase identity required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  // readbackOnly is an explicit alias for dryRun: both perform public + DB reads only.
  const dryRun = body.dryRun === true || body.readbackOnly === true;
  try {
    const result = await reconcileNaverPublishSuccess({
      queueId: body.queueId,
      contentId: body.contentId,
      contentFingerprint: body.contentFingerprint,
      naverUrl: body.naverUrl,
      expectedLogNo: body.logNo,
      title: body.title,
      corePhrase: body.corePhrase,
      dryRun,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "naver_publish_reconciliation_failed";
    const status = /required|invalid/.test(error) ? 400 : /not_found/.test(error) ? 404 : /mismatch|different|duplicate/.test(error) ? 409 : 502;
    return NextResponse.json({ ok: false, error, mutation: "none" }, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
