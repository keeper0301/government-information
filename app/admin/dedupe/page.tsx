// ============================================================
// /admin/dedupe — 중복 정책 후보 목록 + 수동 confirm/reject UI
// ============================================================
// cron(/api/dedupe-detect) 가 매일 02:00 KST 에 score ≥ 0.7 페어를
// duplicate_of_id 에 임시 저장. 이 페이지는 그 후보를 사장님이 검토.
//
// 표시 항목:
//   1. 상단 알림 메시지 (?ok=, ?error=)
//   2. 안내 카드 — 동작 방식 한 줄 설명 + 임계값 (DEDUPE_THRESHOLD)
//   3. welfare 후보 / loan 후보 별도 섹션
//   4. 각 후보 카드: base row | candidate row | confirm/reject 버튼
//
// 권한: ADMIN_EMAILS 가드. robots noindex.
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DEDUPE_THRESHOLD } from "@/lib/dedupe/welfare-loan";
import { confirmDuplicate, rejectDuplicate } from "./actions";

export const metadata: Metadata = {
  title: "중복 정책 dedupe | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/dedupe");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

// ─── DB 조회 — base + candidate row 묶어서 반환 ─────────────
type CandidateRow = {
  table: "welfare_programs" | "loan_programs";
  base: ProgramSummary;
  candidate: ProgramSummary | null;
};

type ProgramSummary = {
  id: string;
  source_code: string | null;
  title: string | null;
  region: string | null;
  apply_end: string | null;
};

// duplicate_of_id IS NOT NULL row 를 한 번에 200건까지 (운영 인박스 cap).
// candidate row 는 IN 쿼리로 한 번 더 조회 (Supabase 자기참조 nested select 가
// 권한·정합성 측면에서 까다로워, 단순 두 단계 조회가 더 안전).
async function loadCandidates(
  table: "welfare_programs" | "loan_programs",
): Promise<CandidateRow[]> {
  const admin = createAdminClient();
  const { data: bases, error: baseErr } = await admin
    .from(table)
    .select("id, source_code, title, region, apply_end, duplicate_of_id")
    .not("duplicate_of_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (baseErr) {
    console.warn(`[admin/dedupe] ${table} base 조회 실패:`, baseErr.message);
    return [];
  }
  if (!bases || bases.length === 0) return [];

  const candidateIds = Array.from(
    new Set(bases.map((b) => b.duplicate_of_id).filter(Boolean)),
  ) as string[];

  const { data: candidates, error: candErr } = await admin
    .from(table)
    .select("id, source_code, title, region, apply_end")
    .in("id", candidateIds);

  if (candErr) {
    console.warn(`[admin/dedupe] ${table} candidate 조회 실패:`, candErr.message);
  }

  const candidateMap = new Map<string, ProgramSummary>();
  for (const c of candidates ?? []) {
    candidateMap.set(c.id, c as ProgramSummary);
  }

  return bases.map((b) => ({
    table,
    base: {
      id: b.id,
      source_code: b.source_code,
      title: b.title,
      region: b.region,
      apply_end: b.apply_end,
    },
    candidate: b.duplicate_of_id ? candidateMap.get(b.duplicate_of_id) ?? null : null,
  }));
}

export default async function AdminDedupePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const okMsg = params.ok ? decodeURIComponent(params.ok) : null;
  const errMsg = params.error ? decodeURIComponent(params.error) : null;

  const [welfareRows, loanRows] = await Promise.all([
    loadCandidates("welfare_programs"),
    loadCandidates("loan_programs"),
  ]);

  const totalCount = welfareRows.length + loanRows.length;
  // 200건 cap 도달 인지 — loadCandidates 의 .limit(200) 로 잘렸을 가능성 알림.
  // 둘 중 하나라도 200 이면 추가 후보가 인지되지 않은 채 묻힐 위험이 있음.
  const capReached = welfareRows.length === 200 || loanRows.length === 200;

  return (
    <div className="max-w-[980px]">
      <AdminPageHeader
        kicker="ADMIN · 운영 상태"
        title="중복 정책 후보 검토"
        description={`매일 02:00 KST 자동 탐지 — 같은 정책이 여러 출처에서 들어오면 자동으로 후보를 잡아줘요. 사장님이 검토 후 확정/해제. 임계값 ${(DEDUPE_THRESHOLD * 100).toFixed(0)}% 이상만 후보로 잡습니다.`}
      />

      {/* 200건 cap 도달 배너 — 추가 후보 누락 인지 (Phase 3 B3 hot-fix) */}
      {capReached && (
        <div className="mb-6 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900">
          ⚠️ 200건 표시 한도 도달. 추가 후보가 누락됐을 수 있어요. 일부 confirm/reject 후 다시 새로고침해주세요.
        </div>
      )}

      {/* 알림 메시지 */}
      {okMsg && (
        <div className="rounded-lg border bg-green/10 border-green/30 p-3 text-sm text-grey-900 mb-5">
          ✅ {okMsg}
        </div>
      )}
      {errMsg && (
        <div className="rounded-lg border bg-red/10 border-red/30 p-3 text-sm text-red mb-5">
          ⚠️ {errMsg}
        </div>
      )}

      {/* 안내 + 통계 */}
      <section className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6 text-sm text-grey-800 leading-[1.7]">
        <p className="font-bold mb-1.5">검토 가이드</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            왼쪽이 <strong>신규</strong> row, 오른쪽이 <strong>기존 활성</strong> row.
            제목·지역·마감일·태그 4종 가중 합으로 후보를 잡았어요.
          </li>
          <li>
            <strong>중복이 맞으면 [확정]</strong> — 감사 로그에 남고 duplicate_of_id 가 그대로 유지돼요.
          </li>
          <li>
            <strong>잘못 잡힌 거면 [해제]</strong> — duplicate_of_id 를 비워서 다시 노출되게 합니다.
          </li>
          <li>
            현재 후보 총 <strong>{totalCount}건</strong> (welfare {welfareRows.length}, loan {loanRows.length}).
          </li>
        </ul>
      </section>

      {/* welfare 섹션 */}
      <CandidateSection
        title="📦 복지 정책 후보"
        rows={welfareRows}
        emptyText="복지 후보 없음. 평온한 상태 ✅"
      />

      {/* loan 섹션 */}
      <CandidateSection
        title="💰 대출 정책 후보"
        rows={loanRows}
        emptyText="대출 후보 없음. 평온한 상태 ✅"
      />

      <p className="text-sm flex items-center gap-4 flex-wrap mt-8">
        <Link href="/admin" className="text-blue-500 font-medium underline">
          ← 어드민 홈
        </Link>
        <Link href="/admin/health" className="text-blue-500 font-medium underline">
          헬스 대시보드 →
        </Link>
      </p>
    </div>
  );
}

// ─── 후보 섹션 (welfare/loan 공용) ────────────────────────
function CandidateSection({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: CandidateRow[];
  emptyText: string;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold text-grey-900 mb-3 tracking-[-0.3px]">
        {title} ({rows.length}건)
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-grey-600 py-4">{emptyText}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <CandidateCard key={r.base.id} row={r} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── 후보 카드 — 좌(신규) / 우(기존) + 액션 버튼 ─────────
function CandidateCard({ row }: { row: CandidateRow }) {
  const cand = row.candidate;
  return (
    <div className="bg-white rounded-lg border border-grey-200 p-4">
      <div className="grid md:grid-cols-2 gap-3 mb-3">
        <ProgramSide label="신규 (확인 대상)" data={row.base} highlight />
        {cand ? (
          <ProgramSide label="기존 활성 (참조 대상)" data={cand} />
        ) : (
          <div className="rounded border border-grey-200 bg-grey-50 p-3 text-sm text-grey-600">
            기존 row 를 찾을 수 없어요 (삭제됐을 수 있음). [해제] 권장.
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-3 border-t border-grey-100">
        <form action={confirmDuplicate} className="inline">
          <input type="hidden" name="table" value={row.table} />
          <input type="hidden" name="baseId" value={row.base.id} />
          <input type="hidden" name="candidateId" value={cand?.id ?? ""} />
          <button
            type="submit"
            disabled={!cand}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-grey-300 text-white text-sm font-bold px-4 py-2 rounded transition-colors"
          >
            ✅ 중복 확정
          </button>
        </form>
        <form action={rejectDuplicate} className="inline">
          <input type="hidden" name="table" value={row.table} />
          <input type="hidden" name="baseId" value={row.base.id} />
          <input type="hidden" name="candidateId" value={cand?.id ?? ""} />
          <button
            type="submit"
            className="bg-white hover:bg-grey-50 border border-grey-300 text-grey-900 text-sm font-bold px-4 py-2 rounded transition-colors"
          >
            ↩️ 후보 해제
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── 단일 정책 요약 칸 ─────────────────────────────────
function ProgramSide({
  label,
  data,
  highlight = false,
}: {
  label: string;
  data: ProgramSummary;
  highlight?: boolean;
}) {
  const border = highlight ? "border-blue-300 bg-blue-50/40" : "border-grey-200 bg-grey-50";
  return (
    <div className={`rounded border ${border} p-3`}>
      <div className="text-xs font-semibold tracking-[0.06em] text-grey-700 uppercase mb-1.5">
        {label}
      </div>
      <div className="text-sm font-bold text-grey-900 leading-[1.4] mb-1.5 break-words">
        {data.title || "(제목 없음)"}
      </div>
      <dl className="text-xs text-grey-700 leading-[1.6] space-y-0.5">
        <div className="flex gap-1.5">
          <dt className="text-grey-500 shrink-0">출처</dt>
          <dd className="font-mono">{data.source_code || "—"}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-grey-500 shrink-0">지역</dt>
          <dd>{data.region || "—"}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-grey-500 shrink-0">마감</dt>
          <dd>{data.apply_end || "—"}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-grey-500 shrink-0">id</dt>
          <dd className="font-mono text-[10px] text-grey-500">{data.id}</dd>
        </div>
      </dl>
    </div>
  );
}
