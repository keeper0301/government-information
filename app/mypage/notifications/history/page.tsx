// ============================================================
// /mypage/notifications/history — 알림 수신 이력
// ============================================================
// Phase 4 C2: URL 기반 필터 (?status, ?period, ?q) + 페이지네이션 (?page).
// 발송 상태별 배지 색상으로 한눈에 성공·실패·대기를 구분.
//
// 필터 정책:
//   ?status = sent | failed | pending(=queued) | all (default: all)
//   ?period = 7d | 30d | all                          (default: 30d)
//   ?q      = 정책 제목 LIKE 검색                      (default: 비어있음)
//   ?page   = 1..N (30건/페이지)                       (default: 1)
//
// "pending" 라벨은 사용자 친화 표현 — DB 의 status 는 'queued'.
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
// 공통 페이지네이션 — admin/welfare/loan 등에서 동일 시그니처로 사용 중
import { Pagination } from "@/components/pagination";

export const metadata: Metadata = {
  title: "알림 수신 이력 — keepioo",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// 페이지당 표시 건수 — 모바일 스크롤 2~3회 분량
const PER_PAGE = 30;

// 사용자가 URL 로 선택한 status 값 → DB 컬럼 값으로 변환.
// "pending" 은 사용자 친화 라벨이라 DB 의 'queued' 로 매핑.
function statusToDb(s: string): "sent" | "failed" | "queued" | null {
  if (s === "sent") return "sent";
  if (s === "failed") return "failed";
  if (s === "pending") return "queued";
  return null; // all 또는 알 수 없는 값
}

// period 옵션 → 시작 시각 (ISO). "all" 이면 null 반환.
function periodToStartIso(p: string): string | null {
  if (p === "7d") {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }
  if (p === "30d") {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString();
  }
  return null; // all
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    status?: string;
    period?: string;
    q?: string;
  }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/notifications/history");

  const params = await searchParams;
  // 페이지 번호 — 1 미만은 1로 보정
  const page = Math.max(1, parseInt(params.page || "1", 10));
  const offset = (page - 1) * PER_PAGE;
  // status / period 는 화이트리스트 검증
  const statusParam = params.status === "sent" || params.status === "failed" || params.status === "pending"
    ? params.status
    : "all";
  const periodParam = params.period === "7d" || params.period === "all" ? params.period : "30d";
  // 검색어 — 100자 cap. SQL injection 은 .ilike 이스케이프가 처리.
  const q =
    params.q && params.q.trim().length > 0
      ? params.q.trim().slice(0, 100)
      : undefined;

  // Supabase 쿼리 빌더 — 조건 분기 적용
  let query = supabase
    .from("alert_deliveries")
    .select("*", { count: "exact" })
    .eq("user_id", user.id);

  const dbStatus = statusToDb(statusParam);
  if (dbStatus) query = query.eq("status", dbStatus);

  const startIso = periodToStartIso(periodParam);
  if (startIso) query = query.gte("created_at", startIso);

  if (q) {
    // ilike 의 %는 와일드카드. 사용자가 입력한 % 는 그대로 통과해도
    // 검색 기능 강화로 보일 뿐 보안 영향 없음.
    query = query.ilike("program_title", `%${q}%`);
  }

  const { data: deliveries, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + PER_PAGE - 1);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // 페이지네이션 URL — 현재 필터를 유지하면서 page 만 교체
  function buildUrl(overrides: Record<string, string>) {
    const next: Record<string, string> = {
      page: String(page),
      ...(statusParam !== "all" ? { status: statusParam } : {}),
      ...(periodParam !== "30d" ? { period: periodParam } : {}),
      ...(q ? { q } : {}),
      ...overrides,
    };
    if (next.page === "1") delete next.page;
    const qs = new URLSearchParams(next).toString();
    return qs ? `/mypage/notifications/history?${qs}` : "/mypage/notifications/history";
  }

  // 빈 상태 — 필터 적용 결과 0건과 "처음부터 0건" 두 케이스
  const isFiltered = statusParam !== "all" || periodParam !== "30d" || !!q;
  const isEmpty = !deliveries || deliveries.length === 0;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <div className="mb-4">
        <Link href="/mypage/notifications" className="text-sm text-blue-600 underline">
          ← 맞춤 알림 설정
        </Link>
      </div>
      <h1 className="text-2xl font-bold mb-2">알림 수신 이력</h1>
      <p className="text-sm text-grey-600 mb-6">
        전체 {total.toLocaleString()}건
        {totalPages > 1 && <> · {page} / {totalPages} 페이지</>}
      </p>

      {/* 필터 폼 — GET 방식 → URL 파라미터로 새 페이지 SSR */}
      <form
        method="get"
        action="/mypage/notifications/history"
        className="mb-5 bg-white border border-grey-200 rounded-xl p-4 flex flex-wrap items-end gap-3"
      >
        <label className="text-sm font-medium text-grey-700">
          <span className="block mb-1">발송 상태</span>
          <select
            name="status"
            defaultValue={statusParam}
            className="px-3 py-2 border border-grey-200 rounded-lg text-sm text-grey-900 focus:border-blue-500 outline-none"
          >
            <option value="all">전체</option>
            <option value="sent">발송완료</option>
            <option value="failed">실패</option>
            <option value="pending">대기중</option>
          </select>
        </label>
        <label className="text-sm font-medium text-grey-700">
          <span className="block mb-1">기간</span>
          <select
            name="period"
            defaultValue={periodParam}
            className="px-3 py-2 border border-grey-200 rounded-lg text-sm text-grey-900 focus:border-blue-500 outline-none"
          >
            <option value="7d">최근 7일</option>
            <option value="30d">최근 30일</option>
            <option value="all">전체</option>
          </select>
        </label>
        <label className="text-sm font-medium text-grey-700 flex-1 min-w-[180px]">
          <span className="block mb-1">정책 제목 검색</span>
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="예: 청년월세"
            maxLength={100}
            className="w-full px-3 py-2 border border-grey-200 rounded-lg text-sm text-grey-900 focus:border-blue-500 outline-none"
          />
        </label>
        <button
          type="submit"
          className="min-h-[44px] px-4 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          적용
        </button>
        {isFiltered && (
          <Link
            href="/mypage/notifications/history"
            className="min-h-[44px] px-4 inline-flex items-center text-sm font-semibold rounded-lg border border-grey-200 text-grey-700 hover:bg-grey-50 no-underline"
          >
            초기화
          </Link>
        )}
      </form>

      {isEmpty ? (
        <div className="rounded-xl bg-grey-50 p-8 text-center text-[14px] text-grey-700 leading-[1.7]">
          {isFiltered ? (
            <>
              조건에 맞는 알림이 없어요.
              <br />
              <Link href="/mypage/notifications/history" className="text-blue-600 underline">
                필터를 초기화
              </Link>
              해서 전체 이력을 확인해 보세요.
            </>
          ) : (
            <>
              최근 알림이 없어요.
              <br />
              <Link href="/mypage/notifications" className="text-blue-600 underline">
                맞춤 알림 규칙
              </Link>
              을 추가하면 매일 오후 4시에 새 정책이 도착하면 알려드려요.
            </>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {deliveries.map((d) => {
              // 발송 상태별 배지 색상 — emerald / red / amber 톤으로 구분
              const statusLabel =
                d.status === "sent"
                  ? "발송완료"
                  : d.status === "failed"
                  ? "실패"
                  : d.status === "queued"
                  ? "대기중"
                  : "제외";
              const statusBadge =
                d.status === "sent"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                  : d.status === "failed"
                  ? "bg-red-50 text-red-700 border-red-100"
                  : d.status === "queued"
                  ? "bg-amber-50 text-amber-700 border-amber-100"
                  : "bg-grey-50 text-grey-600 border-grey-100";
              const channelLabel = d.channel === "email" ? "이메일" : "알림톡";
              const typePath = d.program_table === "welfare_programs" ? "welfare" : "loan";
              return (
                <Link
                  key={d.id}
                  href={`/${typePath}/${d.program_id}`}
                  className="block border border-grey-200 rounded-xl p-4 hover:bg-grey-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-grey-900 flex-1 min-w-0">
                      {d.program_title || "(제목 없음)"}
                    </div>
                    <span
                      className={`text-[12px] font-bold px-2 py-0.5 rounded border ${statusBadge}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <div className="text-[13px] text-grey-600 mt-1">
                    {channelLabel} · {new Date(d.created_at).toLocaleString("ko-KR")}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* 페이지네이션 — 1페이지뿐이면 자동 숨김 */}
          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              buildUrl={buildUrl}
            />
          )}
        </>
      )}
    </main>
  );
}
