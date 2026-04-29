// ============================================================
// /admin/alert-simulator — 정책 등록 시 발송 대상 시뮬레이션
// ============================================================
// "이 정책이 등록되면 누가 알림 받지?" 사전 가시화.
// 발송 안 함 — 순수 가시화. /admin/alert-rules 정책 매칭 디버깅 + /admin/alimtalk
// 카드 미리보기와 함께 카카오 v2 통과 후 운영 도구로 활용.
//
// 입력: ?simTable=welfare|loan & ?simProgramId=<uuid> (URL 쿼리)
// 출력:
//   1. 정책 정보 (title + region/benefit/age/occupation tags)
//   2. 매칭 결과: rule N개 / unique user M명
//   3. 샘플 5명 (이메일 마스킹 + rule 이름 + 매칭 차원)
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import {
  findMatchingRulesForProgram,
  type ProgramTagsForMatch,
  type RuleMatch,
} from "@/lib/alerts/reverse-match";
import { getAuthUserEmailMap } from "@/lib/admin-stats";
// admin sub page 표준 헤더 — kicker · title · description 슬롯 통일
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const metadata: Metadata = {
  title: "알림 발송 시뮬레이션 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SimTable = "welfare" | "loan";
const VALID_TABLES: SimTable[] = ["welfare", "loan"];
// UUID 형식 — 정책 ID 가드 (SQL injection 방지)
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 이메일 마스킹 — admin/users CSV 와 동일 정책 (a***@b***.com)
function maskEmail(email: string | undefined): string {
  if (!email) return "(이메일 없음)";
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.indexOf(".");
  const domainHead = dot > 0 ? domain.slice(0, dot) : domain;
  const domainTail = dot > 0 ? domain.slice(dot) : "";
  const head = (s: string) => (s.length <= 1 ? s : `${s[0]}***`);
  return `${head(local)}@${head(domainHead)}${domainTail}`;
}

// 매칭 정책 fetch — welfare/loan 분기. ProgramTagsForMatch 로 정규화.
async function fetchProgram(
  table: SimTable,
  id: string,
): Promise<(ProgramTagsForMatch & { id: string }) | null> {
  const admin = createAdminClient();
  const tableName = table === "welfare" ? "welfare_programs" : "loan_programs";
  const { data, error } = await admin
    .from(tableName)
    .select(
      "id, title, description, region_tags, age_tags, occupation_tags, benefit_tags, household_target_tags, income_target_level",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data as ProgramTagsForMatch & { id: string };
}

export default async function AlertSimulatorPage({
  searchParams,
}: {
  searchParams: Promise<{ simTable?: string; simProgramId?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/alert-simulator");
  if (!isAdminUser(user.email)) redirect("/");

  const params = await searchParams;
  // 입력 가드 — 화이트리스트 + UUID 형식
  const simTable = VALID_TABLES.includes(params.simTable as SimTable)
    ? (params.simTable as SimTable)
    : null;
  const simProgramId =
    params.simProgramId && UUID_RE.test(params.simProgramId)
      ? params.simProgramId
      : null;

  // 매칭 결과 — 입력 둘 다 있을 때만 fetch
  let program: (ProgramTagsForMatch & { id: string }) | null = null;
  let matches: RuleMatch[] = [];
  let uniqueUserCount = 0;
  let userEmailMap: Map<string, string> = new Map();

  if (simTable && simProgramId) {
    program = await fetchProgram(simTable, simProgramId);
    if (program) {
      const admin = createAdminClient();
      [matches, userEmailMap] = await Promise.all([
        findMatchingRulesForProgram(admin, program),
        getAuthUserEmailMap(),
      ]);
      uniqueUserCount = new Set(matches.map((m) => m.rule.user_id)).size;
    }
  }

  // 샘플 5명 — rule 이름·이메일·매칭 차원 라벨
  const samples = matches.slice(0, 5);

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[820px] mx-auto px-5">
        {/* 표준 헤더 슬롯 — F4 마이그레이션 */}
        <AdminPageHeader
          kicker="ADMIN · 알림 발송"
          title="정책 → 발송 대상 미리보기"
          description="정책 ID 입력 → 등록 시 알림 받을 사용자 수·샘플 가시화. 발송 안 함."
        />

        {/* 입력 폼 — GET method 로 URL 쿼리 주입 */}
        <form
          method="get"
          action="/admin/alert-simulator"
          className="mb-6 bg-white border border-grey-200 rounded-xl p-4 flex flex-wrap items-end gap-3"
        >
          <label className="text-[13px] font-medium text-grey-700">
            <span className="block mb-1">대상 테이블</span>
            <select
              name="simTable"
              defaultValue={simTable ?? "welfare"}
              className="px-3 py-2 border border-grey-200 rounded-lg text-[13px] text-grey-900 focus:border-blue-500 outline-none min-h-[40px]"
            >
              <option value="welfare">welfare_programs</option>
              <option value="loan">loan_programs</option>
            </select>
          </label>
          <label className="text-[13px] font-medium text-grey-700 flex-1 min-w-[280px]">
            <span className="block mb-1">정책 ID (UUID)</span>
            <input
              type="text"
              name="simProgramId"
              defaultValue={simProgramId ?? ""}
              placeholder="00000000-0000-0000-0000-000000000000"
              maxLength={36}
              className="w-full px-3 py-2 border border-grey-200 rounded-lg text-[13px] text-grey-900 focus:border-blue-500 outline-none font-mono"
            />
          </label>
          <button
            type="submit"
            className="min-h-[44px] px-4 text-[13px] font-semibold rounded-lg bg-blue-500 text-white hover:bg-blue-600"
          >
            시뮬레이션
          </button>
        </form>

        {/* 입력 안내 — 둘 다 비어있을 때 */}
        {(!simTable || !simProgramId) && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-[13px] text-blue-900 leading-[1.6]">
            정책 ID 를 입력하고 <strong>시뮬레이션</strong> 을 누르면 매칭되는
            사용자 수·샘플이 노출됩니다. ID 는 정책 상세 페이지 URL 의 UUID 부분
            (<code className="text-[12px] bg-white px-1 rounded">/welfare/{`{id}`}</code> 또는
            <code className="text-[12px] bg-white px-1 rounded ml-1">/loan/{`{id}`}</code>) 입니다.
          </div>
        )}

        {/* 정책 못 찾음 */}
        {simTable && simProgramId && !program && (
          <div className="rounded-lg border border-red/30 bg-red/5 p-4 text-[13px] text-red leading-[1.6]">
            ❌ 해당 ID 의 정책을 찾을 수 없습니다. UUID 형식 + 테이블 (
            {simTable}) 을 다시 확인해 주세요.
          </div>
        )}

        {/* 매칭 결과 */}
        {program && (
          <>
            {/* 정책 정보 카드 */}
            <section className="mb-6 rounded-xl border border-grey-200 bg-white p-5">
              <h2 className="text-[16px] font-bold text-grey-900 mb-2">
                대상 정책
              </h2>
              <p className="text-[15px] font-semibold text-grey-900 mb-3 break-all">
                {program.title}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[12px]">
                <TagRow label="region" tags={program.region_tags} />
                <TagRow label="age" tags={program.age_tags} />
                <TagRow label="occupation" tags={program.occupation_tags} />
                <TagRow label="benefit" tags={program.benefit_tags} />
                <TagRow
                  label="household_target"
                  tags={program.household_target_tags ?? []}
                  emptyHint="(제한 없음)"
                />
                <TagRow
                  label="income_target"
                  tags={program.income_target_level ? [program.income_target_level] : []}
                  emptyHint="(제한 없음)"
                />
              </div>
            </section>

            {/* KPI 카드 */}
            <section className="mb-6 grid grid-cols-2 gap-3">
              <Kpi
                label="매칭 rule"
                value={`${matches.length}건`}
                tone={matches.length > 0 ? "ok" : "muted"}
              />
              <Kpi
                label="발송 대상 사용자 (unique)"
                value={`${uniqueUserCount}명`}
                tone={uniqueUserCount > 0 ? "ok" : "muted"}
              />
            </section>

            {/* 샘플 5명 */}
            <section className="mb-8">
              <h2 className="text-[16px] font-bold text-grey-900 mb-3">
                샘플 (최대 5명)
              </h2>
              {samples.length === 0 ? (
                <div className="rounded-lg border border-grey-200 bg-white p-4 text-[13px] text-grey-600">
                  매칭되는 active rule 없음.
                </div>
              ) : (
                <div className="rounded-lg border border-grey-200 bg-white overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-left text-grey-600 border-b border-grey-200 bg-grey-50">
                        <th className="py-2 px-3 font-medium whitespace-nowrap">
                          사용자
                        </th>
                        <th className="py-2 px-3 font-medium">rule 이름</th>
                        <th className="py-2 px-3 font-medium whitespace-nowrap">
                          매칭 차원
                        </th>
                        <th className="py-2 px-3 font-medium whitespace-nowrap">
                          채널
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {samples.map((m) => (
                        <tr
                          key={m.rule.id}
                          className="border-b border-grey-100 last:border-b-0 align-top"
                        >
                          <td className="py-2 px-3 text-grey-800 break-all">
                            {maskEmail(userEmailMap.get(m.rule.user_id))}
                            <Link
                              href={`/admin/users/${m.rule.user_id}`}
                              className="ml-2 text-blue-500 hover:underline font-mono text-[11px]"
                              title={m.rule.user_id}
                            >
                              {m.rule.user_id.slice(0, 8)}…
                            </Link>
                          </td>
                          <td className="py-2 px-3 text-grey-900 font-semibold break-all">
                            {m.rule.name}
                          </td>
                          <td className="py-2 px-3 text-grey-700 whitespace-nowrap">
                            {m.reasons.length === 0 ? "(전체 허용)" : m.reasons.join(" · ")}
                          </td>
                          <td className="py-2 px-3 text-grey-700 whitespace-nowrap">
                            {m.rule.channels.join(", ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {matches.length > samples.length && (
                <p className="mt-2 text-[12px] text-grey-600">
                  · 외 {matches.length - samples.length}건 추가 매칭 (전체 발송 대상은 위
                  KPI 참조).
                </p>
              )}
            </section>

            {/* 안내 */}
            <div className="rounded-lg border border-grey-200 bg-grey-50 p-4 text-[12px] text-grey-700 leading-[1.6]">
              ※ 시뮬레이션 결과는 <strong>현재 active rule 기준</strong> 입니다.
              실제 발송 시점에는 alert-dispatch 의 cohort gate (income/household
              매칭) 가 한 번 더 적용되어 매칭 사용자 수가 줄어들 수 있습니다.
              kakao_messaging 동의 미설정 사용자는 카톡 발송에서 제외됩니다.
            </div>
          </>
        )}

        <p className="mt-10 text-[13px] flex items-center gap-4">
          <Link href="/admin" className="text-blue-500 font-medium underline">
            ← 어드민 홈
          </Link>
          <Link href="/admin/alimtalk" className="text-blue-500 font-medium underline">
            카카오 알림톡 운영 →
          </Link>
        </p>
      </div>
    </main>
  );
}

// 정책 tags 한 줄 — 빈 배열은 "(없음)" 또는 emptyHint
function TagRow({
  label,
  tags,
  emptyHint,
}: {
  label: string;
  tags: string[];
  emptyHint?: string;
}) {
  return (
    <div className="bg-grey-50 rounded p-2">
      <p className="text-[10px] text-grey-600 font-mono mb-0.5">{label}</p>
      <p className="text-grey-900 break-all leading-[1.4]">
        {tags.length === 0 ? (
          <span className="text-grey-500">{emptyHint ?? "(없음)"}</span>
        ) : (
          tags.join(", ")
        )}
      </p>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "muted";
}) {
  const cls =
    tone === "ok"
      ? "border-blue-200 bg-blue-50 text-blue-900"
      : "border-grey-200 bg-grey-50 text-grey-700";
  return (
    <div className={`rounded-lg border p-4 ${cls}`}>
      <p className="text-[12px] font-semibold mb-1">{label}</p>
      <p className="text-[22px] font-extrabold tracking-[-0.5px]">{value}</p>
    </div>
  );
}
