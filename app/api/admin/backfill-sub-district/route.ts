// ============================================================
// /api/admin/backfill-sub-district — welfare + loan + news sub_district 백필
// ============================================================
// District Phase B 2단계 (5/20) — 읍·면·동·리 단위 자동 추출.
// 조건: district 이미 채워진 row + sub_district NULL.
// extractSubDistrict (district-extractor.ts) 의 SUB_DISTRICT_DATA inline 활용.
//
// 호출:
//   POST /api/admin/backfill-sub-district
//   body: { limit?: number } (기본 5000)
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import {
  detectProvince,
  extractSubDistrict,
  type DistrictMatch,
} from "@/lib/region/district-extractor";
import { PROVINCES, type ProvinceCode } from "@/lib/regions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) return null;
  return user;
}

type Row = {
  id: string;
  title: string | null;
  description?: string | null;
  body?: string | null;
  region: string | null;
  district: string | null;
};

// region 문자열 ("전라남도", "전남" 등) 에서 ProvinceCode 추출.
// detectProvince (district-extractor) 의 PROVINCE_ALIASES 재사용 — 모든 별칭 호환.
function regionToProvinceCode(region: string | null): ProvinceCode | null {
  if (!region) return null;
  return detectProvince(region);
}

async function backfillTable(
  table: "welfare_programs" | "loan_programs" | "news_posts",
  limit: number,
) {
  const admin = createAdminClient();
  // news_posts 는 body 컬럼, welfare/loan 은 description 컬럼
  const selectCols =
    table === "news_posts"
      ? "id, title, body, region, district"
      : "id, title, description, region, district";

  const { data, error } = await admin
    .from(table)
    .select(selectCols)
    .not("district", "is", null)
    .is("sub_district", null)
    .limit(limit);

  if (error) return { error: error.message, processed: 0, matched: 0 };
  const rows = ((data ?? []) as unknown) as Row[];
  if (rows.length === 0) return { processed: 0, matched: 0, hasMore: false };

  let matched = 0;

  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    await Promise.all(
      chunk.map(async (row) => {
        const provinceCode = regionToProvinceCode(row.region);
        if (!provinceCode || !row.district) return;

        const districtMatch: DistrictMatch = {
          province: provinceCode,
          provinceName: PROVINCES.find((p) => p.code === provinceCode)!.name,
          district: row.district,
        };

        // title + description/body 에서 sub_district 추출
        const text = [row.title, row.description ?? row.body ?? null]
          .filter(Boolean)
          .join(" ");
        const subMatch = extractSubDistrict(text, districtMatch);
        if (!subMatch) return;

        const { error: updErr } = await admin
          .from(table)
          .update({ sub_district: subMatch.subDistrict })
          .eq("id", row.id);
        if (!updErr) matched += 1;
      }),
    );
  }

  return {
    processed: rows.length,
    matched,
    hasMore: rows.length === limit,
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
  const news = await backfillTable("news_posts", limit);

  return NextResponse.json({
    ok: true,
    welfare,
    loan,
    news,
    summary: {
      total_processed:
        (welfare.processed ?? 0) + (loan.processed ?? 0) + (news.processed ?? 0),
      total_matched:
        (welfare.matched ?? 0) + (loan.matched ?? 0) + (news.matched ?? 0),
      has_more: !!(welfare.hasMore || loan.hasMore || news.hasMore),
    },
  });
}
