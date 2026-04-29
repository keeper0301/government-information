// ============================================================
// /api/collect-news/[province] — 광역별 네이버 정책정보 수집 (cron)
// ============================================================
// vercel.json 의 17개 cron 이 각자 다른 province 코드로 호출.
// 광역 1개 + 그 광역의 시군구 모두 처리.
//
// 2026-04-25 저장 대상 변경: news_posts 로 일원화 (이전 welfare/loan 저장
// 설계는 enrich cron 후보 오염 + /welfare·/loan 에 뉴스 혼입 문제로 폐기).
//
// 응답: { province, total, news_upserted, searchUnits, errors }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import {
  type ProvinceCode,
  PROVINCES,
  getProvinceByCode,
} from "@/lib/regions";
import { collectNaverNewsByProvince } from "@/lib/news-collectors/naver-news";
import { notifyCronFailure } from "@/lib/email";

export const maxDuration = 300;

const VALID_CODES: Set<string> = new Set(PROVINCES.map((p) => p.code));

// 광역 1회 cron 실행에서 INSERT 가 이 임계를 초과하면 폭주 의심으로 알림.
// 평소 페이스 ~80건/광역/일 (4-25~4-27 데이터 기준). 500 = 평소의 6배+.
// 2026-04-29 14k 폭주 사고 trigger: fd8f21b 시군 검색 추가 → 1광역당 1935건 INSERT.
// 자동 감지 못 해 24h 후 사장님 헬스체크에서 발견. 본 임계는 같은 사고 재발 시
// 첫 cron 직후 1분 내 감지 + cron_failure_log + 사장님 inbox.
const SURGE_THRESHOLD_PER_PROVINCE = 500;

async function run(provinceCode: string, jobLabel: string) {
  if (!VALID_CODES.has(provinceCode)) {
    return NextResponse.json(
      { error: "unknown province", code: provinceCode },
      { status: 404 },
    );
  }

  try {
    const result = await collectNaverNewsByProvince(provinceCode as ProvinceCode);

    // 에러가 있고 한 건도 못 가져왔으면 알림 (네이버 API 장애·키 문제 의심).
    if (result.errors.length > 0 && result.total === 0) {
      const provinceName = getProvinceByCode(provinceCode)?.name ?? provinceCode;
      await notifyCronFailure(
        `${jobLabel} - ${provinceName} 네이버 수집 0건`,
        result.errors.join(" / "),
      );
    }

    // 폭주 감지 — INSERT 가 임계 초과 시 사장님에게 즉시 알림.
    // 같은 광역+같은 임계는 cron_failure_log 의 signature 기반 cooldown 으로
    // 24h 내 중복 발송 차단됨 (lib/email).
    if (result.news_upserted > SURGE_THRESHOLD_PER_PROVINCE) {
      const provinceName = getProvinceByCode(provinceCode)?.name ?? provinceCode;
      await notifyCronFailure(
        `${jobLabel} - ${provinceName} 폭주 감지 (${result.news_upserted}건)`,
        `평소 ~80건/광역/일 페이스 의 ${Math.round(result.news_upserted / 80)}배. ` +
          `INSERT cap·키워드 필터·신선도 컷오프 우회됐는지 점검 필요. ` +
          `total=${result.total} skippedDup=${result.skippedDup} skippedBatchDup=${result.skippedBatchDup}`,
      );
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...result,
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ province: string }> },
) {
  const fail = checkAuth(request);
  if (fail) return fail;
  const { province } = await params;
  return run(province, `collect-news/${province} (cron)`);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ province: string }> },
) {
  const fail = checkAuth(request);
  if (fail) return fail;
  const { province } = await params;
  return run(province, `collect-news/${province} (POST)`);
}
