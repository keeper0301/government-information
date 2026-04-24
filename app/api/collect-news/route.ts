// ============================================================
// /api/collect-news — korea.kr 정책 뉴스 수집 (cron)
// ============================================================
// 하루 1회 Vercel Cron 에서 호출. 두 단계 순차 실행:
//   1) RSS 6개 피드 → news_posts upsert (신규 뉴스 등록)
//   2) 키워드 뉴스 15개 카테고리 → topic_categories 병합 (기존 뉴스에 주제 라벨 부착)
//
// 1) 이 먼저 돌아야 2) 에서 매칭할 source_id 가 DB 에 있으므로 순차 실행.
//
// 응답 예: { timestamp, rss: {total, upserted, errors}, topics: {categories, matched, updated} }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { collectKoreaKr } from "@/lib/news-collectors/korea-kr";
import { collectKoreaKrTopics } from "@/lib/news-collectors/korea-kr-topics";
import { notifyCronFailure } from "@/lib/email";

export const maxDuration = 60;

async function run(jobLabel: string) {
  try {
    const rss = await collectKoreaKr();

    // 전건 실패만 알림 (에러 일부는 정상 범주 — 특정 feed 일시 장애 가능)
    if (rss.errors >= 3 || (rss.total === 0 && rss.errors > 0)) {
      await notifyCronFailure(
        `${jobLabel} - korea.kr RSS 수집 이슈`,
        `errors=${rss.errors} / total=${rss.total}`,
      );
    }

    // 키워드 뉴스 주제 분류 — RSS 수집 후 순차 실행. 실패해도 RSS 결과는 보존.
    let topics: Awaited<ReturnType<typeof collectKoreaKrTopics>> | { error: string } = {
      error: "not-run",
    };
    try {
      topics = await collectKoreaKrTopics();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      topics = { error: msg };
      await notifyCronFailure(`${jobLabel} - topic 분류 수집 실패`, msg);
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      rss,
      topics,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    await notifyCronFailure(jobLabel, msg);
    return NextResponse.json({ error: "수집 실패", detail: msg }, { status: 500 });
  }
}

function checkAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const fail = checkAuth(request);
  if (fail) return fail;
  return run("collect-news (POST)");
}

export async function GET(request: NextRequest) {
  const fail = checkAuth(request);
  if (fail) return fail;
  return run("collect-news (cron)");
}
