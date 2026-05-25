// app/api/admin/cron-retry/route.ts
// Phase 6 — admin 본인이 실패한 cron 을 즉시 재실행하는 server-side endpoint.
// /admin/cron-failures 의 retry 버튼이 호출.

import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 실행 가능한 cron path 화이트리스트 — 임의 path 호출 차단.
// vercel.json 의 cron 등록 path 와 일치 유지 (새 cron 추가 시 여기도 추가).
const ALLOWED_PATHS = new Set<string>([
  "/api/collect-news",
  "/api/cron/health-alert",
  "/api/alert-dispatch",
  "/api/cleanup-expired-programs",
  "/api/finalize-deletions",
  "/api/enrich",
  "/api/billing/charge",
  // Phase 5/6 신규 cron 4종 — 빠지면 /admin/cron-failures retry 버튼 400 리턴
  "/api/dedupe-detect",
  "/api/cron/press-ingest",
  "/api/cron/onboarding-reminder",
  "/api/cron/weekly-digest",
  // 어드민 자동화 마스터 #1 인벤토리 후 추가 (2026-05-07)
  "/api/cron/daily-digest",
  "/api/cron/news-classify",
  "/api/cron/naver-queue-alert",
  "/api/enrich-targeting",
  "/api/enrich-thumbnails",
  "/api/indexnow-submit-recent",
  "/api/cron/scrape-local-press",
  "/api/cron/weekly-scrape-monitor",
]);

// host header injection 방어를 위한 base URL — request.url 의 host 가
// proxy header 로 spoof 될 수 있어 신뢰할 수 있는 NEXT_PUBLIC_SITE_URL fallback.
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.keepioo.com";

export async function POST(request: Request) {
  const user = await requireAdminUser();
  if (!user) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    cronPath?: string;
  } | null;
  const cronPath = body?.cronPath;
  if (!cronPath || !ALLOWED_PATHS.has(cronPath)) {
    return NextResponse.json(
      { error: `허용되지 않은 크론 주소입니다: ${cronPath ?? "(누락)"}` },
      { status: 400 },
    );
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET 비밀값이 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  // internal fetch — host header injection 방어로 BASE_URL 사용 (request.url 신뢰 X)
  const url = new URL(cronPath, BASE_URL);
  const start = Date.now();
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `크론 호출 실패: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
  const elapsedMs = Date.now() - start;
  const data = await res.json().catch(() => null);

  return NextResponse.json({
    ok: res.ok,
    status: res.status,
    elapsedMs,
    cronPath,
    data,
  });
}
