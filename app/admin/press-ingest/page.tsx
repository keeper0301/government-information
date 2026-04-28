// ============================================================
// /admin/press-ingest — 광역 보도자료 정책 후보 (L1 필터, LLM 미사용)
// ============================================================
// news_posts 24h 광역도 ministry 보도자료 중 신청 신호 매칭 row 노출.
// 사장님이 본인 판단으로 정책 → /admin/welfare/new 또는 /admin/loan/new
// 등록.
//
// L2 (LLM 자동 분류) 도입은 운영 패턴 본 후 진행 (spec 참조).
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import {
  getPressIngestCandidates,
  type PressIngestCandidate,
} from "@/lib/press-ingest/filter";

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
const MINISTRY_SHORT: Record<string, string> = {
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
  searchParams: Promise<{ hours?: string }>;
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

  const candidates = await getPressIngestCandidates(hours, 100);

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[980px] mx-auto px-5">
        <div className="mb-8">
          <p className="text-[12px] text-blue-500 font-semibold tracking-[0.2em] mb-3">
            ADMIN · 광역 보도자료 정책 후보
          </p>
          <h1 className="text-[26px] font-extrabold tracking-[-0.6px] text-grey-900 mb-2">
            {hours === 168 ? "최근 7일" : `최근 ${hours}시간`} 광역 보도자료
          </h1>
          <p className="text-[14px] text-grey-700 leading-[1.6]">
            17개 광역도청 발표 보도자료 중 신청 신호 키워드 (지원금·보조금·
            바우처·수당·환급·모집·신청·접수) 매칭 row. 본인 판단으로 정책이면
            우측 버튼 → 수동 등록 폼으로 이동.
          </p>
        </div>

        {/* 안내 + 기간 토글 */}
        <div className="mb-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-[12px] text-blue-900 leading-[1.55] flex-1 min-w-[280px]">
            💡 자동 분류 (LLM) 도입 전 단계. 사장님이 직접 보면서 정책 발견 →
            수동 등록. /admin/welfare/new 또는 /admin/loan/new 로 이동 후
            본문 복사 + 추가 정보 입력.
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
                className={`px-4 py-2 text-[12px] font-semibold no-underline transition-colors ${
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

        {/* 후보 테이블 */}
        {candidates.length === 0 ? (
          <div className="rounded-lg border border-grey-200 bg-white p-10 text-center text-[14px] text-grey-600">
            후보 없음 — 광역도청 신청 신호 키워드 매칭 보도자료가 이 기간에
            없습니다.
          </div>
        ) : (
          <div className="rounded-lg border border-grey-200 bg-white overflow-x-auto">
            <table className="w-full text-[13px]">
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
                    <td className="py-2 px-3 text-grey-600 text-[12px] whitespace-nowrap">
                      {fmtDate(c.published_at)}
                    </td>
                    <td className="py-2 px-3 text-[12px] whitespace-nowrap">
                      <span className="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                        {MINISTRY_SHORT[c.ministry ?? ""] ?? c.ministry ?? "—"}
                      </span>
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
                        <p className="text-[11px] text-grey-600 mt-0.5 line-clamp-2 leading-[1.4]">
                          {c.summary}
                        </p>
                      )}
                    </td>
                    <td className="py-2 px-3 text-grey-600 text-[11px] whitespace-nowrap">
                      {c.source_outlet ?? "—"}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <Link
                          href={buildPrefillUrl("/admin/welfare/new", c, true)}
                          className="text-[11px] text-blue-500 hover:text-blue-700 font-semibold no-underline whitespace-nowrap"
                        >
                          복지 →
                        </Link>
                        <Link
                          href={buildPrefillUrl("/admin/loan/new", c, false)}
                          className="text-[11px] text-orange-500 hover:text-orange-700 font-semibold no-underline whitespace-nowrap"
                        >
                          대출 →
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-6 text-[12px] text-grey-600">
          전체 {candidates.length}건 (최대 100건). L2 (LLM 자동 분류) 도입 시
          이 페이지에서 후보가 자동 등록 후 confirm 단계로 변경 예정.
        </p>

        <p className="mt-8 text-[13px] flex items-center gap-4">
          <Link href="/admin" className="text-blue-500 font-medium underline">
            ← 어드민 홈
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
    </main>
  );
}
