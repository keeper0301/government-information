// ============================================================
// /compare — 정책 비교 페이지
// ============================================================
// 같은 카테고리(welfare 또는 loan) 정책 2~3개를 옆에 두고 핵심 정보를 비교.
// URL: /compare?type=welfare&ids=ID1,ID2,ID3
//
// 사용 흐름:
//   1) 정책 상세에서 "다른 정책과 비교" 클릭 → 비슷한 카테고리 선택 페이지
//   2) 사용자가 2~3개 체크 → /compare?type=...&ids=... 로 이동
//   3) 표 형태로 핵심 필드 (자격·금액·기간·방법) 가로 배치
//
// 현재 단계는 단순 비교 표만 제공. 추후 자동 추천 (찜 + 카테고리 같은 것 자동 비교) 가능.
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calcDday } from "@/lib/programs";

export const metadata: Metadata = {
  title: "정책 비교 — keepioo",
  description: "복지·대출 정책을 옆에 두고 자격·금액·기간을 한눈에 비교하세요.",
};

export const dynamic = "force-dynamic";

type SearchParams = {
  type?: string;
  ids?: string;
};

type WelfareForCompare = {
  id: string;
  title: string;
  category: string;
  target: string | null;
  region: string | null;
  eligibility: string | null;
  benefits: string | null;
  apply_method: string | null;
  apply_start: string | null;
  apply_end: string | null;
  source: string;
};

type LoanForCompare = {
  id: string;
  title: string;
  category: string;
  target: string | null;
  region: string | null;
  eligibility: string | null;
  loan_amount: string | null;
  interest_rate: string | null;
  repayment_period: string | null;
  apply_method: string | null;
  apply_start: string | null;
  apply_end: string | null;
  source: string;
};

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const type = params.type === "loan" ? "loan" : "welfare";

  // ids 파싱 — 쉼표 구분, UUID 형식만 허용 (정확히 2~3개)
  const idsRaw = (params.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = idsRaw.filter((id) => uuidRe.test(id)).slice(0, 3);

  if (ids.length < 2) {
    return <CompareEmpty />;
  }

  const supabase = await createClient();
  let programs: (WelfareForCompare | LoanForCompare)[] = [];

  if (type === "welfare") {
    const { data } = await supabase
      .from("welfare_programs")
      .select(
        "id, title, category, target, region, eligibility, benefits, apply_method, apply_start, apply_end, source",
      )
      .in("id", ids);
    programs = (data ?? []) as WelfareForCompare[];
  } else {
    const { data } = await supabase
      .from("loan_programs")
      .select(
        "id, title, category, target, region, eligibility, loan_amount, interest_rate, repayment_period, apply_method, apply_start, apply_end, source",
      )
      .in("id", ids);
    programs = (data ?? []) as LoanForCompare[];
  }

  if (programs.length === 0) notFound();

  // 사용자가 입력한 순서대로 표시 — DB 결과 순서가 아니라 ids 배열 순서
  const orderedPrograms = ids
    .map((id) => programs.find((p) => p.id === id))
    .filter((p): p is WelfareForCompare | LoanForCompare => p !== undefined);

  return (
    <main className="max-w-content mx-auto px-10 pt-[80px] pb-20 max-md:px-5">
      <Link href={`/${type}`} className="text-sm text-blue-600 hover:underline">
        ← {type === "welfare" ? "복지" : "대출"} 목록
      </Link>

      <h1 className="text-[28px] font-bold tracking-[-0.6px] text-grey-900 mt-4 mb-2">
        정책 비교
      </h1>
      <p className="text-[14px] text-grey-600 mb-8">
        선택한 {orderedPrograms.length}개 정책의 핵심 정보를 한눈에 비교해 보세요.
      </p>

      {type === "welfare" ? (
        <WelfareCompareTable programs={orderedPrograms as WelfareForCompare[]} />
      ) : (
        <LoanCompareTable programs={orderedPrograms as LoanForCompare[]} />
      )}

      <p className="mt-8 text-[12px] text-grey-600 leading-[1.6]">
        ※ 자격 요건은 요약본이며 실제 신청 가능 여부는 각 기관 공식 페이지에서 다시 확인해 주세요.
      </p>
    </main>
  );
}

function CompareEmpty() {
  return (
    <main className="max-w-content mx-auto px-10 pt-[80px] pb-20 max-md:px-5">
      <h1 className="text-[28px] font-bold tracking-[-0.6px] text-grey-900 mb-2">
        정책 비교
      </h1>
      <p className="text-[14px] text-grey-700 mb-6">
        URL 에 비교할 정책 ID 가 부족해요. 정책 상세 페이지의 <strong>비교에 추가</strong> 버튼으로 2~3개를 골라 주세요.
      </p>
      <div className="flex gap-3">
        <Link
          href="/welfare"
          className="rounded-xl bg-blue-600 px-5 py-3 text-white font-semibold no-underline text-[14px]"
        >
          복지 둘러보기
        </Link>
        <Link
          href="/loan"
          className="rounded-xl bg-grey-100 px-5 py-3 text-grey-900 font-semibold no-underline text-[14px]"
        >
          대출 둘러보기
        </Link>
      </div>
    </main>
  );
}

function WelfareCompareTable({ programs }: { programs: WelfareForCompare[] }) {
  const rows: { label: string; key: keyof WelfareForCompare | "period" | "dday" }[] = [
    { label: "분야", key: "category" },
    { label: "대상", key: "target" },
    { label: "지역", key: "region" },
    { label: "혜택", key: "benefits" },
    { label: "자격 요건", key: "eligibility" },
    { label: "신청 기간", key: "period" },
    { label: "마감일", key: "dday" },
    { label: "신청 방법", key: "apply_method" },
    { label: "출처", key: "source" },
  ];

  return (
    <div className="overflow-x-auto rounded-2xl border border-grey-200 bg-white">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-grey-50 border-b border-grey-200">
            <th className="text-left p-4 font-semibold text-grey-700 w-[120px] sticky left-0 bg-grey-50">
              항목
            </th>
            {programs.map((p) => (
              <th
                key={p.id}
                className="text-left p-4 font-bold text-grey-900 min-w-[220px] align-top"
              >
                <Link
                  href={`/welfare/${p.id}`}
                  className="text-blue-600 hover:underline"
                >
                  {p.title}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.key)} className="border-b border-grey-100 last:border-b-0">
              <td className="p-4 font-semibold text-grey-700 align-top sticky left-0 bg-white">
                {row.label}
              </td>
              {programs.map((p) => (
                <td key={p.id} className="p-4 text-grey-900 align-top whitespace-pre-wrap">
                  {renderWelfareCell(p, row.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderWelfareCell(
  p: WelfareForCompare,
  key: keyof WelfareForCompare | "period" | "dday",
): string {
  if (key === "period") {
    if (p.apply_start && p.apply_end) return `${p.apply_start} ~ ${p.apply_end}`;
    if (p.apply_start) return `${p.apply_start} ~`;
    if (p.apply_end) return `~ ${p.apply_end}`;
    return "상시";
  }
  if (key === "dday") {
    const d = calcDday(p.apply_end);
    if (d === null) return "—";
    if (d < 0) return "마감됨";
    return `D-${d}`;
  }
  const v = p[key];
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function LoanCompareTable({ programs }: { programs: LoanForCompare[] }) {
  const rows: { label: string; key: keyof LoanForCompare | "period" | "dday" }[] = [
    { label: "분야", key: "category" },
    { label: "대상", key: "target" },
    { label: "지역", key: "region" },
    { label: "한도", key: "loan_amount" },
    { label: "금리", key: "interest_rate" },
    { label: "상환", key: "repayment_period" },
    { label: "자격 요건", key: "eligibility" },
    { label: "신청 기간", key: "period" },
    { label: "마감일", key: "dday" },
    { label: "신청 방법", key: "apply_method" },
    { label: "출처", key: "source" },
  ];

  return (
    <div className="overflow-x-auto rounded-2xl border border-grey-200 bg-white">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-grey-50 border-b border-grey-200">
            <th className="text-left p-4 font-semibold text-grey-700 w-[120px] sticky left-0 bg-grey-50">
              항목
            </th>
            {programs.map((p) => (
              <th
                key={p.id}
                className="text-left p-4 font-bold text-grey-900 min-w-[220px] align-top"
              >
                <Link
                  href={`/loan/${p.id}`}
                  className="text-blue-600 hover:underline"
                >
                  {p.title}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.key)} className="border-b border-grey-100 last:border-b-0">
              <td className="p-4 font-semibold text-grey-700 align-top sticky left-0 bg-white">
                {row.label}
              </td>
              {programs.map((p) => (
                <td key={p.id} className="p-4 text-grey-900 align-top whitespace-pre-wrap">
                  {renderLoanCell(p, row.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderLoanCell(
  p: LoanForCompare,
  key: keyof LoanForCompare | "period" | "dday",
): string {
  if (key === "period") {
    if (p.apply_start && p.apply_end) return `${p.apply_start} ~ ${p.apply_end}`;
    if (p.apply_start) return `${p.apply_start} ~`;
    if (p.apply_end) return `~ ${p.apply_end}`;
    return "상시";
  }
  if (key === "dday") {
    const d = calcDday(p.apply_end);
    if (d === null) return "—";
    if (d < 0) return "마감됨";
    return `D-${d}`;
  }
  const v = p[key];
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}
