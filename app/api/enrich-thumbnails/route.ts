// ============================================================
// /api/enrich-thumbnails — 네이버 검색 수집 뉴스 og:image 백필 cron
// ============================================================
// naver-news-* 의 thumbnail_url=NULL row 를 batch 로 처리:
//   1) 후보 N건 select (최신순)
//   2) 각 source_url 에 대해 fetchOgImage 병렬 호출
//   3) 추출 성공 → thumbnail_url 갱신, 실패 → 표식 컬럼 update (재시도 안 함)
//
// 운영 안정 원칙:
//   - BATCH = 50 — fetchOgImage 5초 병렬(Promise.allSettled) + DB update 병렬
//                  최대 ~10초 내 완료. Vercel 60초 maxDuration 충분 마진
//   - Promise.allSettled — 1건 실패해도 나머지 진행 (fetch + DB update 양쪽)
//   - 영구 skip 컬럼 (thumbnail_fetch_failed_at) — bokjiro 058 패턴 유지
//   - 7d cooldown 후 재시도 (외부 사이트 일시 장애 회복 가능성)
//
// cron 등록 (vercel.json): "*/5 * * * *" 매 5분 (한 시간 600건 백필)
//   광역 17개 collect-news cron 추가 후 신규 ~9,120건/일 유입 가속 대응:
//   - 처리 속도 14,400건/일 (잉여 5,280건/일)
//   - pending 22K → 약 4~5일 백필 완료 예상
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchOgImage } from "@/lib/og-image";

const BATCH = 50; // 한 cron 당 처리 row 수 (5분 cron + 9,120/일 유입 대응)
const PROCESS_TIMEOUT_MS = 40_000; // fetch 단계 상한 (DB update 병렬 ~5s + 마진 → 60s 안전)

export const maxDuration = 60;

async function runEnrichThumbnails() {
  const supabase = createAdminClient();
  const startedAt = Date.now();

  // 후보 select — naver-news-* + thumbnail NULL + 최근 영구 실패 안 한 것
  // 조건: thumbnail_fetch_failed_at IS NULL OR < now() - 7d
  const { data: rows, error } = await supabase
    .from("news_posts")
    .select("id, source_url, source_code")
    .like("source_code", "naver-news-%")
    .is("thumbnail_url", null)
    .or(
      `thumbnail_fetch_failed_at.is.null,thumbnail_fetch_failed_at.lt.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}`,
    )
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(BATCH);

  if (error) {
    return NextResponse.json(
      { error: `select 실패: ${error.message}` },
      { status: 500 },
    );
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ processed: 0, note: "후보 없음" });
  }

  // og:image 병렬 fetch — 5초 timeout 내장
  // Promise.allSettled 라 일부 실패해도 나머지 결과 반영
  const results = await Promise.allSettled(
    rows.map(async (row) => {
      if (Date.now() - startedAt > PROCESS_TIMEOUT_MS) {
        // 전체 timeout 임박 — 남은 row 는 다음 cron 으로 미룸
        return { id: row.id, ogImage: null, skipReason: "process_timeout" as const };
      }
      const ogImage = await fetchOgImage(row.source_url);
      return { id: row.id, ogImage, skipReason: null };
    }),
  );

  let upserted = 0;
  let failed = 0;
  let skipped = 0;
  const nowIso = new Date().toISOString();

  // 결과별 update 를 병렬 처리 — sequential N×100ms → 병렬로 단축
  // BATCH=50 기준 sequential 5~10초 → 병렬 200~500ms 수준
  const updateOps = results.map(async (r, i) => {
    const row = rows[i];
    if (r.status === "rejected") {
      // 절대 발생하지 않아야 함 (fetchOgImage 가 throw 안 함). 방어용.
      return { kind: "failed" as const };
    }
    const { ogImage, skipReason } = r.value;
    if (skipReason === "process_timeout") {
      return { kind: "skipped" as const };
    }
    if (ogImage) {
      const { error: updateErr } = await supabase
        .from("news_posts")
        .update({
          thumbnail_url: ogImage,
          thumbnail_fetch_failed_at: null, // 성공 시 reset
        })
        .eq("id", row.id);
      return updateErr ? { kind: "failed" as const } : { kind: "upserted" as const };
    }
    // 추출 실패 — 영구 표식 (7일 후 재시도)
    await supabase
      .from("news_posts")
      .update({ thumbnail_fetch_failed_at: nowIso })
      .eq("id", row.id);
    return { kind: "failed" as const };
  });

  const updateResults = await Promise.allSettled(updateOps);
  for (const ur of updateResults) {
    if (ur.status === "rejected") {
      // DB update reject 는 fetch 단계와 별개 — 안전 카운트
      failed++;
      continue;
    }
    if (ur.value.kind === "upserted") upserted++;
    else if (ur.value.kind === "skipped") skipped++;
    else failed++;
  }

  return NextResponse.json({
    processed: rows.length,
    upserted,
    failed,
    skipped,
    elapsed_ms: Date.now() - startedAt,
  });
}

// CRON_SECRET 가드 — Vercel cron 만 호출 가능
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runEnrichThumbnails();
}

// POST 도 같은 권한 (admin 수동 trigger 용)
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runEnrichThumbnails();
}
