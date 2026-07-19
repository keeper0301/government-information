import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/admin-auth";
import { getSignedInUser } from "@/lib/admin-auth-server";
import { logAdminAction } from "@/lib/admin-actions";
import {
  buildPaidUsersCsv,
  filterPaidUserRows,
  getPaidUsersDashboard,
  type PaidUsersFilter,
} from "@/lib/admin/paid-users-dashboard";

export const dynamic = "force-dynamic";

function readFilter(searchParams: URLSearchParams): PaidUsersFilter {
  return {
    tier: searchParams.get("tier") ?? "",
    status: searchParams.get("status") ?? "",
    segment: searchParams.get("segment") ?? "",
    query: searchParams.get("q") ?? "",
  };
}

export async function GET(request: NextRequest) {
  const user = await getSignedInUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const filters = readFilter(url.searchParams);
  const dashboard = await getPaidUsersDashboard();
  const rows = filterPaidUserRows(dashboard.rows, filters);
  const baseUrl = `${url.protocol}//${url.host}`;
  const csv = buildPaidUsersCsv(rows, { baseUrl });

  try {
    await logAdminAction({
      actorId: user.id,
      action: "csv_export",
      details: {
        kind: "paid_users",
        count: rows.length,
        filters,
      },
    });
  } catch {
    // 감사 로그 실패가 운영 CSV 다운로드를 막지는 않음.
  }

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="keepioo-paid-users-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
