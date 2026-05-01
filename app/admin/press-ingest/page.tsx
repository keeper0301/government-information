// ============================================================
// /admin/press-ingest — 광역 보도자료 정책 후보 + L2 confirm 큐
// ============================================================
// news_posts L1 후보와 LLM 이 자동 분류해 둔 L2 confirm 후보를 함께 노출.
// L2 는 confirm 전까지 welfare/loan 에 INSERT 되지 않는다.
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import {
  getPressIngestCandidates,
  getPressIngestKpi,
  getAutoIngestTrend,
  getRecentAutoIngestRows,
  type PressIngestCandidate,
} from "@/lib/press-ingest/filter";
import {
  listPressCandidates,
  type PressCandidateListRow,
} from "@/lib/press-ingest/candidates";
import { PressClassifyAction } from "./classify-action";
import {
  confirmPressCandidateAction,
  rejectPressCandidateAction,
} from "./actions";
// admin sub page 표준 헤더 — kicker · title · description 슬롯 통일
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const metadata: Metadata = {
  title: "광역 보도자료 정책 후보 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// 광역 ministry 풀네임 → 사람 읽기 source 값 (등록 폼 prefill 용)
// 예: '전라남도' → '전라남도청', '경기도' → '경기도청'
function ministryToSource(ministry: string | null): string {
  if (!ministry) return "";
  // 특별시·광역시·자치시·도 → "...청" 으로 통일
  if (ministry.endsWith("시") || ministry.endsWith("도"))
    return `${ministry}청`;
  return ministry;
}

// ministry → region 자유 텍스트 prefill (welfare 만 사용)
function ministryToRegion(ministry: string | null): string {
  return ministry ?? "";
}

// 등록 폼 prefill URL 생성 — title/source/source_url/description 자동 채움
// news_id 도 포함해 추후 추적 가능. URLSearchParams 가 자동 encode.
function buildPrefillUrl(
  base: string,
  c: PressIngestCandidate,
  withRegion: boolean,
): string {
  const qs = new URLSearchParams();
  qs.set("title", c.title);
  qs.set("source", ministryToSource(c.ministry));
  // source_url 은 보도자료 자체 페이지 (/news/{slug}) 또는 외부 출처
  qs.set(
    "source_url",
    `https://www.keepioo.com/news/${encodeURIComponent(c.slug)}`,
  );
  if (c.summary) qs.set("description", c.summary);
  if (withRegion) qs.set("region", ministryToRegion(c.ministry));
  qs.set("news_id", c.id);
  return `${base}?${qs.toString()}`;
}

// ministry 풀네임 → 짧은 라벨 (테이블 가독성)
const PROVINCE_SHORT: Record<string, string> = {
  서울특별시: "서울",
  부산광역시: "부산",
  대구광역시: "대구",
  인천광역시: "인천",
  광주광역시: "광주",
  대전광역시: "대전",
  울산광역시: "울산",
  세종특별자치시: "세종",
  경기도: "경기",
  강원도: "강원",
  강원특별자치도: "강원",
  충청북도: "충북",
  충청남도: "충남",
  전라북도: "전북",
  전북특별자치도: "전북",
  전라남도: "전남",
  경상북도: "경북",
  경상남도: "경남",
  제주특별자치도: "제주",
};

// ministry='전라남도' 또는 '전라남도 순천시' → 광역 짧은 라벨 + 시군명 분리
function shortenMinistry(ministry: string | null): {
  province: string;
  district: string | null;
} {
  if (!ministry) return { province: "—", district: null };
  // 가장 긴 광역명 prefix 매칭
  for (const [full, short] of Object.entries(PROVINCE_SHORT)) {
    if (ministry === full) return { province: short, district: null };
    if (ministry.startsWith(full + " ")) {
      return { province: short, district: ministry.slice(full.length + 1) };
    }
  }
  return { province: ministry, district: null };
}

// KPI 카드 — 4 카드 grid, tone 별 색상
function KpiCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "ok" | "muted" | "warn";
  hint?: string;
}) {
  const cls =
    tone === "ok"
      ? "border-blue-200 bg-blue-50 text-blue-900"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-grey-200 bg-grey-50 text-grey-700";
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <p className="text-xs font-semibold mb-0.5 tracking-[0.04em] uppercase">
        {label}
      </p>
      <p className="text-lg font-extrabold tracking-[-0.3px] leading-tight">
        {value}
      </p>
      {hint && <p className="text-xs mt-1 leading-[1.4]">{hint}</p>}
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function PressIngestPage({
  searchParams,
}: {
  searchParams: Promise<{ hours?: string; ok?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/press-ingest");
  if (!isAdminUser(user.email)) redirect("/");

  const params = await searchParams;
  // 24h / 48h / 7d 토글
  const hours = (() => {
    const n = parseInt(params.hours || "24", 10);
    return [24, 48, 168].includes(n) ? n : 24;
  })();

  const [candidates, l2Candidates, kpi, autoTrend, recentAuto] = await Promise.all([
    getPressIngestCandidates(hours, 100),
    listPressCandidates(100),
    getPressIngestKpi(),
    getAutoIngestTrend(7),
    getRecentAutoIngestRows(5),
  ]);
  // 7일 추세 max — 막대 길이 정규화 용
  const trendMax = Math.max(1, ...autoTrend.map((d) => d.count));
  // ANTHROPIC_API_KEY 설정 여부 — server side 검증 (값 노출 X)
  const llmEnabled = !!process.env.ANTHROPIC_API_KEY;

  return (
    <div className="max-w-[980px]">
      {/* 표준 헤더 슬롯 — F4 마이그레이션 */}
      <AdminPageHeader
        kicker="ADMIN · 컨텐츠 발행"
        title={`${hours === 168 ? "최근 7일" : `최근 ${hours}시간`} 광역 보도자료`}
        description="17개 광역도청 보도자료를 L1 키워드로 찾고, L2 LLM 분류 결과는 confirm 큐에서 승인 후에만 정책으로 등록합니다."
      />

      {params.ok && (
        <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm font-semibold text-blue-900">
          {params.ok}
        </div>
      )}

      {/* KPI 카드 (Step 3 가시화 + 자동 ingest) */}
      <section className="mb-5 grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          label="24h 후보"
          value={`${kpi.candidates_24h}건`}
          tone={kpi.candidates_24h > 0 ? "ok" : "muted"}
          hint="광역도청 보도자료 매칭"
        />
        <KpiCard
          label="L2 승인 대기"
          value={`${kpi.l2_pending}건`}
          tone={kpi.l2_pending > 0 ? "warn" : "muted"}
          hint="confirm 필요"
        />
        <KpiCard
          label="24h 등록 (manual)"
          value={`${kpi.manual_registered_24h}건`}
          tone={kpi.manual_registered_24h > 0 ? "ok" : "muted"}
          hint="사장님 수동 등록"
        />
        <KpiCard
          label="24h LLM 호출"
          value={`${kpi.llm_classify_24h}건`}
          tone={kpi.llm_classify_24h > 0 ? "ok" : "muted"}
          hint={`수동+cron · ~$${(kpi.llm_classify_24h * 0.003).toFixed(2)}`}
        />
        <KpiCard
          label="LLM 활성"
          value={llmEnabled ? "✓ 켜짐" : "✗ 미설정"}
          tone={llmEnabled ? "ok" : "warn"}
          hint={
            llmEnabled
              ? "ANTHROPIC_API_KEY OK"
              : "Vercel env 등록 필요"
          }
        />
      </section>

      {/* 7일 L2 승인 등록 추세 — 일별 막대 7개. 정책 발굴 페이스 한눈에. */}
      <section className="mb-5 bg-white border border-grey-200 rounded-lg p-4">
        <h2 className="text-sm font-bold text-grey-900 mb-3 tracking-[-0.2px]">
          7일 L2 승인 등록 추세
        </h2>
        <div className="flex items-end gap-2 h-[72px]">
          {autoTrend.map((d) => {
            const heightPct = d.count === 0 ? 4 : Math.max(8, Math.round((d.count / trendMax) * 100));
            const isToday = d.day === autoTrend[autoTrend.length - 1]?.day;
            return (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-xs font-semibold text-grey-700 tabular-nums">
                  {d.count}
                </div>
                <div
                  className={`w-full rounded-t ${
                    d.count > 0 ? (isToday ? "bg-blue-500" : "bg-blue-300") : "bg-grey-200"
                  }`}
                  style={{ height: `${heightPct}%` }}
                  aria-label={`${d.day} ${d.count}건`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-1.5">
          {autoTrend.map((d) => (
            <div
              key={d.day}
              className="flex-1 text-center text-xs text-grey-600 tabular-nums"
            >
              {d.day.replace(/^\d{4}\.\s*/, "").replace(/\.$/, "")}
            </div>
          ))}
        </div>
      </section>

      {/* 최근 L2 승인 등록 5건 */}
      <section className="mb-5 bg-white border border-grey-200 rounded-lg p-4">
        <h2 className="text-sm font-bold text-grey-900 mb-3 tracking-[-0.2px]">
          최근 L2 승인 정책 5건
        </h2>
        {recentAuto.length === 0 ? (
          <p className="text-xs text-grey-600 leading-[1.5]">
            아직 L2 승인으로 등록된 정책이 없어요. confirm 큐에서 승인하면
            여기 노출됩니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {recentAuto.map((r) => (
              <li
                key={`${r.table}-${r.id}`}
                className="flex items-center gap-2 text-xs"
              >
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-bold ${
                    r.table === "welfare"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-orange-50 text-orange-700"
                  }`}
                >
                  {r.table === "welfare" ? "복지" : "대출"}
                </span>
                {r.category && (
                  <span className="shrink-0 text-grey-600 text-xs">
                    {r.category}
                  </span>
                )}
                <Link
                  href={
                    r.table === "welfare"
                      ? `/welfare/${r.id}`
                      : `/loan/${r.id}`
                  }
                  target="_blank"
                  className="flex-1 truncate text-grey-900 font-medium hover:text-blue-600 hover:underline"
                >
                  {r.title}
                </Link>
                <span className="shrink-0 text-grey-500 text-xs">
                  {fmtDate(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 안내 + 기간 토글 */}
      <div className="mb-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900 leading-[1.55] flex-1 min-w-[280px]">
          💡 자동 ingest cron 매일 01:30 KST 실행 (LLM 분류 + confirm 후보 저장,
          cap 30 후보). L2 후보를 승인하면 정책으로 등록됩니다. 누락된 정책은 직접 &apos;🤖 AI 분류&apos; 또는
          &apos;복지/대출 →&apos; 버튼으로 수동 등록 가능.
        </div>
        <div className="inline-flex rounded-lg border border-grey-200 bg-white overflow-hidden">
          {[
            { value: 24, label: "24h" },
            { value: 48, label: "48h" },
            { value: 168, label: "7일" },
          ].map((opt) => (
            <Link
              key={opt.value}
              href={
                opt.value === 24
                  ? "/admin/press-ingest"
                  : `/admin/press-ingest?hours=${opt.value}`
              }
              className={`px-4 py-2 text-xs font-semibold no-underline transition-colors ${
                hours === opt.value
                  ? "bg-blue-500 text-white"
                  : "text-grey-700 hover:bg-grey-50"
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      <section className="mb-7">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="text-base font-bold text-grey-900 tracking-[-0.2px]">
            L2 confirm 후보 ({l2Candidates.length}건)
          </h2>
          <span className="text-xs text-grey-600">
            LLM 분류 완료 · 승인 전 사용자 노출 없음
          </span>
        </div>
        {l2Candidates.length === 0 ? (
          <div className="rounded-lg border border-grey-200 bg-white p-5 text-sm text-grey-600">
            confirm 대기 후보가 없습니다. cron 실행 후 정책성 있는 보도자료가
            있으면 여기에 쌓입니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {l2Candidates.map((candidate) => (
              <L2CandidateCard key={candidate.id} candidate={candidate} />
            ))}
          </div>
        )}
      </section>

      {/* 후보 테이블 */}
      {candidates.length === 0 ? (
        <div className="rounded-lg border border-grey-200 bg-white p-10 text-center text-sm text-grey-600">
          후보 없음 — 광역도청 신청 신호 키워드 매칭 보도자료가 이 기간에
          없습니다.
        </div>
      ) : (
        <div className="rounded-lg border border-grey-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-grey-600 border-b border-grey-200 bg-grey-50">
                <th className="py-2 px-3 font-medium whitespace-nowrap">
                  발표
                </th>
                <th className="py-2 px-3 font-medium whitespace-nowrap">
                  광역
                </th>
                <th className="py-2 px-3 font-medium">제목</th>
                <th className="py-2 px-3 font-medium whitespace-nowrap">
                  출처
                </th>
                <th className="py-2 px-3 font-medium whitespace-nowrap">
                  등록
                </th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-grey-100 last:border-b-0 align-top"
                >
                  <td className="py-2 px-3 text-grey-600 text-xs whitespace-nowrap">
                    {fmtDate(c.published_at)}
                  </td>
                  <td className="py-2 px-3 text-xs whitespace-nowrap">
                    {(() => {
                      const m = shortenMinistry(c.ministry);
                      return (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold w-fit">
                            {m.province}
                          </span>
                          {m.district && (
                            <span className="text-xs text-grey-700 font-medium">
                              {m.district}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="py-2 px-3">
                    <Link
                      href={`/news/${c.slug}`}
                      target="_blank"
                      className="text-grey-900 font-medium hover:text-blue-600 hover:underline"
                    >
                      {c.title}
                    </Link>
                    {c.summary && (
                      <p className="text-xs text-grey-600 mt-0.5 line-clamp-2 leading-[1.4]">
                        {c.summary}
                      </p>
                    )}
                  </td>
                  <td className="py-2 px-3 text-grey-600 text-xs whitespace-nowrap">
                    {c.source_outlet ?? "—"}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap align-top">
                    <div className="flex flex-col gap-1">
                      <Link
                        href={buildPrefillUrl("/admin/welfare/new", c, true)}
                        className="text-xs text-blue-500 hover:text-blue-700 font-semibold no-underline whitespace-nowrap"
                      >
                        복지 →
                      </Link>
                      <Link
                        href={buildPrefillUrl("/admin/loan/new", c, false)}
                        className="text-xs text-orange-500 hover:text-orange-700 font-semibold no-underline whitespace-nowrap"
                      >
                        대출 →
                      </Link>
                      <PressClassifyAction
                        newsId={c.id}
                        fallbackWelfareUrl={buildPrefillUrl(
                          "/admin/welfare/new",
                          c,
                          true,
                        )}
                        fallbackLoanUrl={buildPrefillUrl(
                          "/admin/loan/new",
                          c,
                          false,
                        )}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-grey-600">
        L1 전체 {candidates.length}건 (최대 100건). L2 cron 이 자동 분류한
        정책 후보는 위 confirm 큐에 먼저 쌓이고, 승인 후에만 등록됩니다.
      </p>

      <p className="mt-8 text-sm flex items-center gap-4">
        <Link href="/admin" className="text-blue-500 font-medium underline">
          ← 어드민 홈
        </Link>
        <Link
          href="/admin/my-actions?q=정책%20수동%20등록"
          className="text-blue-500 font-medium underline"
        >
          등록 내역 →
        </Link>
        <Link
          href="/admin/welfare/new"
          className="text-blue-500 font-medium underline"
        >
          복지 정책 등록
        </Link>
        <Link
          href="/admin/loan/new"
          className="text-blue-500 font-medium underline"
        >
          대출 정책 등록
        </Link>
      </p>
    </div>
  );
}

function L2CandidateCard({ candidate }: { candidate: PressCandidateListRow }) {
  const payload = candidate.classified_payload;
  const isLoan = candidate.program_type === "loan";
  return (
    <article className="rounded-lg border border-grey-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className={`px-2 py-0.5 rounded text-xs font-bold ${
                isLoan ? "bg-orange-50 text-orange-700" : "bg-blue-50 text-blue-700"
              }`}
            >
              {isLoan ? "대출 후보" : "복지 후보"}
            </span>
            {candidate.category && (
              <span className="text-xs text-grey-600 font-semibold">
                {candidate.category}
              </span>
            )}
            <span className="text-xs text-grey-500">
              {fmtDate(candidate.classified_at)}
            </span>
          </div>
          <Link
            href={`/news/${candidate.news.slug || candidate.news_id}`}
            target="_blank"
            className="block text-base font-bold text-grey-900 hover:text-blue-600 hover:underline"
          >
            {candidate.title}
          </Link>
          <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-xs leading-[1.45]">
            <div>
              <dt className="font-semibold text-grey-700">대상</dt>
              <dd className="text-grey-600 line-clamp-2">{payload.target || "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-grey-700">혜택</dt>
              <dd className="text-grey-600 line-clamp-2">{payload.benefits || "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-grey-700">신청</dt>
              <dd className="text-grey-600 line-clamp-2">{payload.apply_method || "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-grey-700">마감</dt>
              <dd className="text-grey-600">{payload.apply_end || "상시/미상"}</dd>
            </div>
          </dl>
          {!payload.apply_url && (
            <p className="mt-3 text-xs font-semibold text-amber-700">
              신청 URL 이 없어 승인 전 원문 확인이 필요합니다.
            </p>
          )}
        </div>
        <div className="shrink-0 flex flex-col gap-2">
          <form action={confirmPressCandidateAction}>
            <input type="hidden" name="candidate_id" value={candidate.id} />
            <button
              type="submit"
              disabled={!payload.apply_url}
              className="w-full rounded-md bg-blue-500 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-grey-300"
            >
              승인 등록
            </button>
          </form>
          <form action={rejectPressCandidateAction}>
            <input type="hidden" name="candidate_id" value={candidate.id} />
            <button
              type="submit"
              className="w-full rounded-md border border-grey-200 px-3 py-2 text-xs font-bold text-grey-700 hover:bg-grey-50"
            >
              후보 해제
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}
