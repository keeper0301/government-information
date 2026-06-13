// ============================================================
// /api/indexnow-bulk-submit — 색인 대상 정책 대량 IndexNow 제출
// ============================================================
// 네이버 서치어드바이저 UI 수집요청(하루 50건 수동)을 우회하는 자동 경로.
// 네이버 IndexNow 는 한 번에 최대 10,000 URL → 색인 대상 복지·대출 정책을
// 인기순으로 한 번에 push 색인 알림. (submit-recent 는 블로그·뉴스만 다뤄
// 복지·대출이 빠져 있던 갭 보완.)
//
// 색인 대상 필터(상세 페이지·sitemap 과 동일):
//   - unique_insight 있음(80자+ noindex 면제) — thin/noindex URL 제외
//   - source_code 제외(stale/404 source 제외)
// 우선순위: view_count DESC (인기 정책 먼저).
//
// 사용: CRON_SECRET Bearer 로 수동 호출. ?limit=N (기본 9000=view 상위, 최대 9000). 2,000개씩 청크 제출.
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     "https://www.keepioo.com/api/indexnow-bulk-submit"
//
// ⚠️ 1회성/저빈도(수주 간격) 수동 운영 전용 — vercel.json cron 등록 금지. 변경 없는 URL 을
//    매일 반복 ping 하면 네이버가 가치 절하. (신규는 indexnow-submit-recent 가 매일 증분 처리.)
// 안정성: INDEXNOW_KEY 미설정 시 submitToIndexNow 가 skip(운영 영향 0).
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitToIndexNow } from "@/lib/indexnow";
import { authorizeCronRequest } from "@/lib/cron-auth";
import {
  WELFARE_EXCLUDED_FILTER,
  LOAN_EXCLUDED_FILTER,
} from "@/lib/listing-sources";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.keepioo.com";
// 2026-06-13 — 6/11 insight 백필로 색인 대상 복지가 ~10,200(+대출 ~1,100)=~11,300 으로
// 커짐. 전체(11,300) > 네이버 IndexNow 일일 한도 10,000 이라 한 번에 다 못 보냄.
// view_count DESC 라 상위(가치 높은) 정책 먼저 커버, 나머지 꼬리는 sitemap 으로 크롤.
// 기본을 안전 한도 안 최대치(9000)로 둬 1회 실행 커버 극대화(이전 8000=복지 1,000개 누락).
const DEFAULT_LIMIT = 9000; // view 상위 9,000 커버 (네이버 10,000 한도 안전 마진)
const MAX_LIMIT = 9000; // IndexNow 10,000 한도 안전 마진 (허브·여유 포함)
const PAGE = 1000; // PostgREST 한 번에 max 1000행 → range 페이지네이션 필수

export const maxDuration = 60;

type Tbl = "welfare_programs" | "loan_programs";

// 색인 대상 id 를 view_count DESC 로 limit 개까지 수집 (1000행 한계 우회).
// id tie-break 안정 정렬 — view_count 동률 시 range 경계가 흔들려 중복·누락되는 것 방지.
async function fetchIds(
  admin: ReturnType<typeof createAdminClient>,
  table: Tbl,
  excluded: string,
  limit: number,
): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; offset < limit; offset += PAGE) {
    const end = Math.min(offset + PAGE, limit) - 1;
    const { data, error } = await admin
      .from(table)
      .select("id")
      .not("source_code", "in", excluded)
      // sitemap 과 동일 기준 — unique_insight_at(백필이 80자+ 응답만 기록)으로 색인 대상 판정.
      // unique_insight is null 만 보면 80자 미만(상세 페이지 noindex)도 통과하는 불일치 방지.
      .not("unique_insight_at", "is", null)
      .not("is_hidden", "is", true) // 회수(숨김=404) 정책 미제출 — 검색엔진 404 push 방지
      .is("duplicate_of_id", null) // 중복 정책 미제출 — 중복 콘텐츠 색인 방지
      .order("view_count", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, end);
    if (error || !data || data.length === 0) break;
    ids.push(...(data as { id: string }[]).map((r) => r.id));
    if (data.length < PAGE) break; // 마지막 페이지
  }
  return ids;
}

async function run(limit: number) {
  const admin = createAdminClient();
  // 대출(색인 대상 ~1,100 으로 적음)을 먼저 전부, 나머지 공간을 복지에 — limit 낭비 없이
  // 색인 대상 전체 커버. (절반 배분 시 대출 공간이 남아 복지를 다 못 보내던 문제 회피.)
  const lnIds = await fetchIds(
    admin,
    "loan_programs",
    LOAN_EXCLUDED_FILTER,
    Math.min(limit, 2000),
  );
  const wfIds = await fetchIds(
    admin,
    "welfare_programs",
    WELFARE_EXCLUDED_FILTER,
    Math.max(0, limit - lnIds.length),
  );

  // 허브(최우선) + 색인 대상 복지·대출 상세
  const urls: string[] = [
    `${SITE}/`,
    `${SITE}/welfare`,
    `${SITE}/loan`,
    `${SITE}/news`,
    `${SITE}/blog`,
    ...wfIds.map((id) => `${SITE}/welfare/${id}`),
    ...lnIds.map((id) => `${SITE}/loan/${id}`),
  ];

  // 2,000개씩 청크 제출 — 한 번에 7,400개(약 370KB JSON)면 IndexNow 5초 timeout 빠듯.
  // 청크별 순차(각 timeout 5s, 4청크 최대 20s < maxDuration 60). 일부 실패해도 다음 청크 진행.
  const CHUNK = 2000;
  const results: Awaited<ReturnType<typeof submitToIndexNow>> = [];
  for (let i = 0; i < urls.length; i += CHUNK) {
    const part = await submitToIndexNow(urls.slice(i, i + CHUNK));
    results.push(...part);
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    limit,
    total_urls: urls.length,
    welfare_count: wfIds.length,
    loan_count: lnIds.length,
    results,
  });
}

function parseLimit(req: NextRequest): number {
  const raw = Number(new URL(req.url).searchParams.get("limit"));
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(raw), MAX_LIMIT);
}

export async function GET(req: NextRequest) {
  const denied = authorizeCronRequest(req);
  if (denied) return denied;
  return run(parseLimit(req));
}

export async function POST(req: NextRequest) {
  const denied = authorizeCronRequest(req);
  if (denied) return denied;
  return run(parseLimit(req));
}
