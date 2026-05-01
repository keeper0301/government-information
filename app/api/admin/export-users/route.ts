// ============================================================
// /api/admin/export-users — 사용자 CSV 내보내기 (PII 마스킹) (Phase 6 #9)
// ============================================================
// /admin/users CSV 다운로드. 마스킹 적용:
//   - email: u***@d***.com (앞 1글자·뒷자리 1글자)
//   - id: 풀 UUID (운영 식별 필요)
// 그 외: region, occupation, age_group, income_level, created_at, last_sign_in_at
//
// admin 권한 가드 + admin_actions.csv_export 감사 로그.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-actions";

// 이메일 마스킹 — local 1글자 + 별표 + 도메인 1글자 + 별표
function maskEmail(email: string | null | undefined): string {
  if (!email) return "";
  const at = email.indexOf("@");
  if (at < 1) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const localMasked = local[0] + "***";
  const dot = domain.indexOf(".");
  const domainMasked =
    dot > 0 ? domain[0] + "***" + domain.slice(dot) : domain[0] + "***";
  return `${localMasked}@${domainMasked}`;
}

// CSV 셀 escape — 콤마·따옴표·줄바꿈 안전
function csvCell(v: string | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  // 권한 가드
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // auth.users + user_profiles 통합
  const [authResult, profilesResult] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin
      .from("user_profiles")
      .select("id, region, occupation, age_group, income_level, created_at"),
  ]);

  const profiles = new Map(
    (profilesResult.data ?? []).map(
      (p: {
        id: string;
        region: string | null;
        occupation: string | null;
        age_group: string | null;
        income_level: string | null;
        created_at: string;
      }) => [p.id, p],
    ),
  );

  // CSV 헤더
  const header = [
    "id",
    "email_masked",
    "auth_created_at",
    "last_sign_in_at",
    "profile_created_at",
    "region",
    "occupation",
    "age_group",
    "income_level",
  ];
  const rows: string[] = [header.map(csvCell).join(",")];

  for (const u of authResult.data?.users ?? []) {
    const p = profiles.get(u.id);
    rows.push(
      [
        u.id,
        maskEmail(u.email),
        u.created_at,
        u.last_sign_in_at ?? "",
        p?.created_at ?? "",
        p?.region ?? "",
        p?.occupation ?? "",
        p?.age_group ?? "",
        p?.income_level ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  // BOM + UTF-8 — 엑셀 한글 깨짐 방지
  const csv = "﻿" + rows.join("\r\n");

  // 감사 로그 (best-effort, 실패해도 다운로드 응답).
  // logAdminAction 헬퍼 사용 — append-only trigger·타입 안전·다른 admin 액션과 일관.
  try {
    await logAdminAction({
      actorId: user.id,
      action: "csv_export",
      details: { kind: "users", count: rows.length - 1 },
    });
  } catch {
    // 무시
  }

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="keepioo-users-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
