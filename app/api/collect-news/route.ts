// ============================================================
// /api/collect-news — korea.kr 정책 뉴스 수집 (cron)
// ============================================================
// 하루 1회 Vercel Cron 에서 호출. 두 단계 순차 실행:
//   1) korea.kr RSS 10개 피드 → news_posts upsert (중앙부처 뉴스)
//   2) 키워드 뉴스 → topic_categories 병합 (기존 뉴스에 주제 라벨 부착)
//
// 2026-07-01 부터 정책브리핑 RSS 는 공식 중단됨. 1) 은 중단 상태를 응답에
// 표시하는 no-op 이며, 실제 신규 korea.kr 수집은 2) HTML 기반 topic 경로가 담당.
//
// 1) 이 활성일 때는 2) 에서 매칭할 source_id 가 DB 에 먼저 들어가야 하므로
// 순차 실행한다. RSS 중단 이후에도 응답 shape 유지용으로 순서는 유지.
//
// 2026-04-24 네이버 뉴스 분리: 네이버는 광역별 cron 17개로 분리됨
// (/api/collect-news/[province]). 단일 cron 으로 245 단위 × 18 키워드 =
// 4,410회 = ~22분 은 maxDuration 5분 한참 초과라 분할 불가피.
//
// 응답 예: { timestamp, rss, topics }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { collectKoreaKr } from "@/lib/news-collectors/korea-kr";
import { collectKoreaKrTopics } from "@/lib/news-collectors/korea-kr-topics";
import { notifyCronFailure } from "@/lib/email";
import { authorizeCronRequest } from "@/lib/cron-auth";

// RSS(25s) + topics(10s) + 상세 본문 보강(신규 payload 전문 스크래핑, 병렬 3).
// 2026-06-02 — 상세 fetch 추가로 60s 초과 가능 → 300s 상향(Vercel Pro fluid).
export const maxDuration = 300;

async function run(jobLabel: string) {
  try {
    const rss = await collectKoreaKr();

    // 실패율 기반 임계치 — 외부 RSS feed 일과성 장애 (3% 정도) 는 노이즈로
    // 매일 알림 시 사장님 짜증 + 진짜 사고 알아채기 어려움.
    // 기준: (a) 전건 실패 (total=0 + errors>0) 또는 (b) 실패율 50% 이상.
    // 8/267 (3%) 같은 부분 실패는 무시 — 정상 수집 충분.
    const totalAttempts = rss.total + rss.errors;
    const failureRate = totalAttempts > 0 ? rss.errors / totalAttempts : 0;
    const isCriticalFailure =
      (rss.total === 0 && rss.errors > 0) || failureRate >= 0.5;
    if (isCriticalFailure) {
      await notifyCronFailure(
        `${jobLabel} - korea.kr RSS 수집 이슈`,
        `errors=${rss.errors} / total=${rss.total} (실패율 ${(failureRate * 100).toFixed(0)}%)`,
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

export async function POST(request: NextRequest) {
  const fail = authorizeCronRequest(request);
  if (fail) return fail;
  return run("collect-news (POST)");
}

export async function GET(request: NextRequest) {
  const fail = authorizeCronRequest(request);
  if (fail) return fail;
  return run("collect-news (cron)");
}
