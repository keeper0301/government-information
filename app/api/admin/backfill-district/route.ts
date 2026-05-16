// ============================================================
// /api/admin/backfill-district — welfare + loan district 백필
// ============================================================
// migration 090 으로 추가된 district 컬럼을 title/content/source 에서 자동
// 추출 (lib/region/district-extractor) 후 채움.
//
// 사장님 거주지 (전남 순천) 매칭 정확도 향상 — 광역 region (478건) →
// 시·군 district (예: 순천시 47건) 자동 분류.
//
// 호출 방식:
//   POST /api/admin/backfill-district
//   body: { limit?: number } (기본 5000, 한 번에 5000건씩 안전)
//
// 멱등: district NULL 인 row 만 처리. 매치 안 되면 NULL 유지 (다음 호출 시
// 또 시도되지만 같은 결과 — 부담 미미).
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { extractDistrictFromFields } from "@/lib/region/district-extractor";

export const dynamic = "force-dynamic";
// Vercel Pro 한도 안에서 안전 — 5000 row × 0.02s = 100s 예상.
export const maxDuration = 300;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) {
    return null;
  }
  return user;
}

type WelfareRow = {
  id: string;
  title: string | null;
  source: string | null;
  target: string | null;
  description: string | null;
  region: string | null;
};

type LoanRow = {
  id: string;
  title: string | null;
  source: string | null;
  description: string | null;
};

// district NULL 인 row 들에 extractor 적용 + 50 병렬 chunk 로 UPDATE.
async function backfillTable(
  table: "welfare_programs" | "loan_programs",
  limit: number,
) {
  const admin = createAdminClient();

  // welfare 만 region 컬럼 있음. loan 은 region 도 같이 채움.
  const isWelfare = table === "welfare_programs";
  const selectCols = isWelfare
    ? "id, title, source, target, description, region"
    : "id, title, source, description";

  const { data, error } = await admin
    .from(table)
    .select(selectCols)
    .is("district", null)
    .limit(limit);

  if (error) {
    return { error: error.message, processed: 0, matched: 0 };
  }

  // select string 이 dynamic 이라 TS 자동 추론 안 됨 — unknown 경유.
  const rows = ((data ?? []) as unknown) as Array<WelfareRow | LoanRow>;
  if (rows.length === 0) return { processed: 0, matched: 0, hasMore: false };

  let matched = 0;

  // 50 병렬 chunk — Vercel 함수 안에서 안전 + 빠름.
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    await Promise.all(
      chunk.map(async (row) => {
        const fields: Array<string | null> = [
          row.title ?? null,
          row.source ?? null,
          (row as WelfareRow).target ?? null,
          row.description ?? null,
          (row as WelfareRow).region ?? null,
        ];
        const match = extractDistrictFromFields(...fields);
        if (!match) return; // 매치 없음 — district NULL 유지

        const update: Record<string, string> = { district: match.district };
        // loan 만 region 도 비어있으면 같이 채움 (welfare 의 region 은 광역 단위라 안 건드림).
        if (!isWelfare && !row.source) {
          // loan 은 source 가 NULL 일 수 있음. region 만 채우는 안전한 조건.
        }
        if (!isWelfare) {
          // loan 의 region 은 어차피 NULL 인 row 만 (백필 첫 호출) — 무조건 채움.
          update.region = match.provinceName;
        }

        const { error: updErr } = await admin
          .from(table)
          .update(update)
          .eq("id", row.id);
        if (!updErr) matched += 1;
      }),
    );
  }

  return {
    processed: rows.length,
    matched,
    hasMore: rows.length === limit, // limit 까지 채웠으면 더 있을 가능성
  };
}

export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit ?? 5000), 100), 10000);

  const welfare = await backfillTable("welfare_programs", limit);
  const loan = await backfillTable("loan_programs", limit);

  return NextResponse.json({
    ok: true,
    welfare,
    loan,
    summary: {
      total_processed:
        (welfare.processed ?? 0) + (loan.processed ?? 0),
      total_matched: (welfare.matched ?? 0) + (loan.matched ?? 0),
      has_more: !!(welfare.hasMore || loan.hasMore),
    },
  });
}
