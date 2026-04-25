// ============================================================
// /admin/news — 정책 뉴스 수집 운영 대시보드
// ============================================================
// 매일 cron (KST 11:00) 이 자동 수집하지만 즉시 수집·상태 점검 필요 시 사용.
//
// 동작:
//   - 상단 카드 4개: 전체 뉴스 / 정책뉴스 / 보도자료 / 정책자료 (각 누적 수)
//   - 최근 24h 수집 카운트 + 마지막 pub_date
//   - [지금 수집 실행] 버튼 → /api/collect-news self-POST
//   - admin_actions 에 collect_news_manual 감사 로그
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-actions";
import {
  searchNewsForAdmin,
  getRecentlyHiddenNews,
  toggleNewsHidden,
} from "./actions";
import {
  HIDE_REASON_CATEGORIES,
  type NewsSearchRow,
} from "./moderation-types";

export const metadata: Metadata = {
  title: "정책 뉴스 운영 | 어드민",
  robots: { index: false, follow: false },
};

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/news");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

async function getStats() {
  const admin = createAdminClient();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [total, news, press, doc, last24h, latest] = await Promise.all([
    admin.from("news_posts").select("id", { count: "exact", head: true }),
    admin.from("news_posts").select("id", { count: "exact", head: true }).eq("category", "news"),
    admin.from("news_posts").select("id", { count: "exact", head: true }).eq("category", "press"),
    admin.from("news_posts").select("id", { count: "exact", head: true }).eq("category", "policy-doc"),
    admin.from("news_posts").select("id", { count: "exact", head: true }).gte("created_at", oneDayAgo),
    admin
      .from("news_posts")
      .select("published_at, title")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    total: total.count ?? 0,
    news: news.count ?? 0,
    press: press.count ?? 0,
    doc: doc.count ?? 0,
    last24h: last24h.count ?? 0,
    latestPublishedAt: latest.data?.published_at ?? null,
    latestTitle: latest.data?.title ?? null,
  };
}

// 수동 수집 트리거 — self-POST 로 /api/collect-news 호출
async function triggerCollect(): Promise<void> {
  "use server";
  const user = await requireAdmin();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    redirect("/admin/news?error=" + encodeURIComponent("CRON_SECRET 환경변수 누락"));
  }

  let result: Record<string, unknown> = {};
  let ok = false;
  try {
    const res = await fetch(`${siteUrl}/api/collect-news`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
      cache: "no-store",
    });
    result = await res.json();
    ok = res.ok;
  } catch (err) {
    result = { error: err instanceof Error ? err.message : "알 수 없는 오류" };
  }

  try {
    await logAdminAction({
      actorId: user.id,
      action: "collect_news_manual",
      details: { ok, ...result },
    });
  } catch {
    // 감사 로그 실패해도 결과 노출
  }

  const qs = `ok=${ok ? "1" : "0"}&result=${encodeURIComponent(JSON.stringify(result))}`;
  redirect(`/admin/news?${qs}`);
}

export default async function AdminNewsPage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string;
    result?: string;
    error?: string;
    msg?: string;
    q?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  // 검색·최근 숨김 데이터를 통계와 함께 병렬 조회 — 모더레이션 즉시성 우선
  const query = (params.q ?? "").trim();
  const [stats, searchResults, recentlyHidden] = await Promise.all([
    getStats(),
    query ? searchNewsForAdmin(query) : Promise.resolve([] as NewsSearchRow[]),
    getRecentlyHiddenNews(),
  ]);

  let resultObj: Record<string, unknown> | null = null;
  if (params.result) {
    try {
      resultObj = JSON.parse(decodeURIComponent(params.result));
    } catch {
      resultObj = { raw: params.result };
    }
  }
  const resultOk = params.ok === "1";

  const latestLabel = stats.latestPublishedAt
    ? new Date(stats.latestPublishedAt).toLocaleString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[720px] mx-auto px-5">
        <div className="mb-8">
          <p className="text-[12px] text-blue-500 font-semibold tracking-[0.2em] mb-3">ADMIN</p>
          <h1 className="text-[26px] font-extrabold tracking-[-0.6px] text-grey-900 mb-2">
            정책 뉴스 운영
          </h1>
          <p className="text-[14px] text-grey-700 leading-[1.65]">
            매일 KST 11:00 cron 이 korea.kr RSS 3개 피드를 자동 수집해요.
            수집 문제를 확인하거나 즉시 반영이 필요할 때 수동 실행할 수 있어요.
          </p>
        </div>

        {/* 상태 카드 4개 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label="전체" value={stats.total.toLocaleString()} />
          <StatCard label="정책뉴스" value={stats.news.toLocaleString()} />
          <StatCard label="보도자료" value={stats.press.toLocaleString()} />
          <StatCard label="정책자료" value={stats.doc.toLocaleString()} />
        </div>

        {/* 최근 24h · 마지막 발행 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          <StatCard label="최근 24h 수집" value={`+${stats.last24h.toLocaleString()}건`} />
          <div className="bg-white rounded-lg border border-grey-200 p-4">
            <div className="text-[12px] font-semibold tracking-[0.08em] text-grey-700 uppercase mb-1">
              최신 발행
            </div>
            <div className="text-[14px] font-semibold text-grey-900 truncate">
              {stats.latestTitle ?? "—"}
            </div>
            <div className="text-[12px] text-grey-600 mt-0.5">{latestLabel}</div>
          </div>
        </div>

        {/* 에러 메시지 */}
        {params.error && (
          <div role="alert" className="bg-red/10 border border-red/30 rounded-lg p-3 text-sm text-red mb-4">
            {params.error}
          </div>
        )}

        {/* 결과 배너 */}
        {resultObj && (
          <div
            role="status"
            className={`rounded-lg p-4 mb-4 border ${
              resultOk
                ? "bg-blue-50 border-blue-100 text-grey-900"
                : "bg-red/10 border-red/30 text-red"
            }`}
          >
            <div className="text-[14px] font-bold mb-1">
              {resultOk ? "✅ 수집 완료" : "❌ 수집 실패"}
            </div>
            <pre className="text-[12px] leading-[1.5] whitespace-pre-wrap break-words">
              {JSON.stringify(resultObj, null, 2)}
            </pre>
          </div>
        )}

        {/* 트리거 폼 */}
        <form action={triggerCollect}>
          <button
            type="submit"
            className="w-full py-3 bg-blue-500 text-white rounded-lg text-[15px] font-bold hover:bg-blue-600 transition-colors cursor-pointer"
          >
            지금 수집 실행
          </button>
        </form>
        <p className="mt-3 text-[13px] text-grey-600 leading-[1.65]">
          * 3개 RSS 피드 합쳐 한 번 실행에 5~10초 소요. 중복은 source_id 기준 자동 병합돼요.
          <br />
          * 수집된 뉴스는 /news 에서 바로 확인할 수 있어요.
        </p>

        {/* ─── 모더레이션 섹션 ─── */}
        <div className="mt-12 pt-8 border-t border-grey-200">
          <h2 className="text-[18px] font-bold text-grey-900 mb-1 tracking-[-0.3px]">콘텐츠 모더레이션</h2>
          <p className="text-[13px] text-grey-600 leading-[1.65] mb-5">
            저작권 요청·오보·오해소지 등으로 단건 비공개가 필요할 때 사용해요.
            숨겨진 뉴스는 즉시 /news 목록·홈·sitemap 모두에서 사라지고, 직접 URL 로 들어오면 410 Gone 페이지를 보여줘요.
          </p>

          {/* 토글 결과 배너 */}
          {params.msg === "hidden" && (
            <div role="status" className="bg-green/10 border border-green/30 rounded-lg p-3 text-[13px] text-green mb-4">
              ✅ 뉴스를 비공개로 전환했어요.
            </div>
          )}
          {params.msg === "restored" && (
            <div role="status" className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-[13px] text-grey-900 mb-4">
              ✅ 뉴스를 다시 공개 상태로 복원했어요.
            </div>
          )}

          {/* 검색 폼 — 제목·slug·source_id 중 하나로 찾기 */}
          <form method="GET" action="/admin/news" className="flex gap-2 mb-4">
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="제목 / slug / source_id"
              className="flex-1 min-w-0 px-3 py-2.5 text-[14px] border border-grey-300 rounded-lg focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              className="px-5 py-2.5 bg-grey-900 text-white text-[14px] font-semibold rounded-lg hover:bg-grey-800 transition-colors"
            >
              검색
            </button>
          </form>

          {/* 검색 결과 */}
          {query && (
            <div className="mb-8">
              <p className="text-[13px] text-grey-600 mb-2">
                검색어 <span className="font-semibold text-grey-900">{query}</span> — 결과 {searchResults.length}건
              </p>
              {searchResults.length === 0 ? (
                <p className="text-[14px] text-grey-700 bg-grey-50 rounded-lg px-3 py-3">
                  일치하는 뉴스가 없어요.
                </p>
              ) : (
                <ul className="space-y-2">
                  {searchResults.map((row) => (
                    <NewsModerationRow key={row.id} row={row} returnTo={`/admin/news?q=${encodeURIComponent(query)}`} />
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* 최근 숨긴 10건 — 실수 복구 fast path */}
          <div>
            <h3 className="text-[15px] font-bold text-grey-900 mb-2 tracking-[-0.2px]">최근 숨긴 뉴스 10건</h3>
            {recentlyHidden.length === 0 ? (
              <p className="text-[14px] text-grey-700 bg-grey-50 rounded-lg px-3 py-3">
                숨김 처리된 뉴스가 아직 없어요.
              </p>
            ) : (
              <ul className="space-y-2">
                {recentlyHidden.map((row) => (
                  <NewsModerationRow key={row.id} row={row} returnTo="/admin/news" compact />
                ))}
              </ul>
            )}
          </div>
        </div>

        <p className="mt-8 text-[13px] flex items-center gap-4 flex-wrap">
          <Link href="/admin" className="text-blue-500 font-medium underline">← 어드민 홈</Link>
          <span className="text-grey-300">·</span>
          <Link href="/news" className="text-blue-500 font-medium underline">정책 소식 페이지 보기 ↗</Link>
        </p>
      </div>
    </main>
  );
}

// ─── 검색 결과 / 최근 숨김 1행 ───
// hidden 상태면 "복원" 버튼만, 공개 상태면 사유 select + "숨김" 버튼.
function NewsModerationRow({
  row,
  returnTo,
  compact,
}: {
  row: NewsSearchRow;
  returnTo: string;
  compact?: boolean;
}) {
  const dateLabel = new Date(row.published_at).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const hiddenAtLabel = row.hidden_at
    ? new Date(row.hidden_at).toLocaleString("ko-KR", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <li className="bg-white border border-grey-200 rounded-lg p-3">
      <div className="flex items-start gap-2 mb-1.5">
        <span
          className={`shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded ${
            row.is_hidden
              ? "bg-red/10 text-red"
              : "bg-green/10 text-green"
          }`}
        >
          {row.is_hidden ? "숨김" : "공개"}
        </span>
        <Link
          href={`/news/${row.slug}`}
          className="flex-1 min-w-0 text-[14px] font-semibold text-grey-900 hover:text-blue-500 line-clamp-2 leading-snug no-underline"
        >
          {row.title}
        </Link>
      </div>
      <div className="text-[12px] text-grey-600 mb-2 leading-[1.5]">
        {row.ministry ?? "—"} · {dateLabel}
        {row.is_hidden && hiddenAtLabel && (
          <>
            <br />
            <span className="text-grey-700">
              숨긴 시각 {hiddenAtLabel}
              {row.hidden_reason && ` — ${row.hidden_reason}`}
            </span>
          </>
        )}
      </div>

      {row.is_hidden ? (
        // 복원 폼 — 사유 입력 없이 한 클릭
        <form action={toggleNewsHidden} className="flex justify-end">
          <input type="hidden" name="slug" value={row.slug} />
          <input type="hidden" name="hide" value="false" />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button
            type="submit"
            className="px-3 py-1.5 bg-grey-100 text-grey-900 text-[12px] font-semibold rounded-md hover:bg-grey-200"
          >
            복원
          </button>
        </form>
      ) : (
        // 공개 상태 → 사유 선택 + 메모 + 숨김 버튼
        <form action={toggleNewsHidden} className="flex flex-wrap gap-2 items-stretch">
          <input type="hidden" name="slug" value={row.slug} />
          <input type="hidden" name="hide" value="true" />
          <input type="hidden" name="returnTo" value={returnTo} />
          <select
            name="reasonCategory"
            required
            defaultValue={HIDE_REASON_CATEGORIES[0]}
            className="px-2 py-1.5 text-[12px] border border-grey-300 rounded-md bg-white"
          >
            {HIDE_REASON_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {!compact && (
            <input
              type="text"
              name="note"
              placeholder="메모 (요청자·일시 등)"
              maxLength={200}
              className="flex-1 min-w-0 px-2 py-1.5 text-[12px] border border-grey-300 rounded-md"
            />
          )}
          <button
            type="submit"
            className="px-3 py-1.5 bg-red text-white text-[12px] font-semibold rounded-md hover:bg-red/90"
          >
            숨김
          </button>
        </form>
      )}
    </li>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-grey-200 p-4">
      <div className="text-[12px] font-semibold tracking-[0.08em] text-grey-700 uppercase mb-1">
        {label}
      </div>
      <div className="text-[20px] font-extrabold text-grey-900">{value}</div>
      {hint && <div className="text-[12px] text-grey-600 mt-0.5">{hint}</div>}
    </div>
  );
}
