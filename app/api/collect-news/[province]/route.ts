// ============================================================
// /api/collect-news/[province] — 광역별 네이버 정책정보 수집 (cron)
// ============================================================
// vercel.json 의 17개 cron 이 각자 다른 province 코드로 호출.
// 광역 1개 + 그 광역의 시군구 모두 처리.
//
// 2026-04-24 사장님 결정: 결과를 news_posts 가 아니라 welfare_programs /
// loan_programs 에 직접 저장. 사용자가 /welfare /loan 검색 시 잡히게
// 하기 위함. 분기는 키워드 기반 (대출·보증·융자 → loan, 그 외 → welfare).
//
// 응답: { province, total, welfare_upserted, loan_upserted, searchUnits, errors }
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
