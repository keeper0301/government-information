// ============================================================
// /api/collect-news — 정책 뉴스 통합 수집 (cron)
// ============================================================
// 하루 1회 Vercel Cron 에서 호출. 세 단계 순차 실행:
//   1) korea.kr RSS 10개 피드 → news_posts upsert (중앙부처 뉴스)
//   2) 키워드 뉴스 → topic_categories 병합 (기존 뉴스에 주제 라벨 부착)
//   3) 네이버 뉴스 검색 17광역 × 18키워드 → news_posts upsert (지방 정책 뉴스)
//
// 1) 이 먼저 돌아야 2) 에서 매칭할 source_id 가 DB 에 있으므로 순차 실행.
// 3) 은 1·2 와 독립적이지만 한 cron 에 묶어 운영 단순화.
//
// 2026-04-24 네이버 뉴스 추가 배경: data.go.kr LocalGovernmentWelfareInformations
// 가 일회성 보편 지급 (예: 순천시 민생회복지원금 15만원) 을 누락 → 지방지·통신사
// 보도로 보완. 환경변수 NAVER_CLIENT_ID/SECRET 미설정 시 자동 스킵.
//
// 응답 예: { timestamp, rss, topics, naver }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { collectKoreaKr } from "@/lib/news-collectors/korea-kr";
import { collectKoreaKrTopics } from "@/lib/news-collectors/korea-kr-topics";
import { collectNaverNews } from "@/lib/news-collectors/naver-news";
import { notifyCronFailure } from "@/lib/email";

// Vercel Pro 300s — RSS(25s) + topics(10s) + 네이버(100s) 합쳐 ~135s 예상.
// 한도 60s 였던 Hobby 시절 RSS+topics 만 돌릴 때 빠듯했음. 네이버 키워드
// 18개로 확장해도 여유 있음.
export const maxDuration = 300;

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

    // 네이버 뉴스 검색 — 지방 정책 뉴스 보완. 키 미설정·전건 실패 시 알림만.
    let naver: Awaited<ReturnType<typeof collectNaverNews>> | { error: string } = {
      error: "not-run",
    };
    try {
      naver = await collectNaverNews();
      // 절반 이상 광역 실패 시 알림 (네이버 API quota·rate-limit 의심)
      if ("errors" in naver && naver.errors >= 9) {
        await notifyCronFailure(
          `${jobLabel} - 네이버 뉴스 다수 광역 실패`,
          `errors=${naver.errors} / total=${naver.total}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      naver = { error: msg };
      await notifyCronFailure(`${jobLabel} - 네이버 뉴스 수집 실패`, msg);
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      rss,
      topics,
      naver,
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
