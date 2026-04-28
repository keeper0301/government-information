// ============================================================
// /admin/welfare/new — 복지 정책 수동 등록 폼
// ============================================================
// 자동 수집 (보조금24·복지로·youth-v2·bokjiro) 가 못 잡는 광역 자체 사업
// (예: 전남도 고유가 피해지원금) 을 사장님이 직접 추가. 매칭 태그
// (region/age/occupation/benefit/household) 는 actions.ts 에서 텍스트 자동
// 분류 → 사장님 입력 부담 ↓.
//
// 등록 후 자동 redirect → /welfare/{id} 로 이동 → 즉시 확인 가능.
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { createWelfareProgram } from "./actions";

export const metadata: Metadata = {
  title: "복지 정책 수동 등록 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// 카테고리 옵션 — 기존 welfare_programs.category 옵션과 일관 (페이지 필터용)
const CATEGORIES = [
  "생계",
  "의료",
  "양육",
  "교육",
  "취업",
  "주거",
  "문화",
  "창업",
] as const;

export default async function NewWelfareProgramPage({
  searchParams,
}: {
  searchParams: Promise<{
    title?: string;
    source?: string;
    source_url?: string;
    description?: string;
    region?: string;
    news_id?: string;
  }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/welfare/new");
  if (!isAdminUser(user.email)) redirect("/");

  // URL 쿼리 prefill — /admin/press-ingest 에서 '복지 →' 버튼 클릭 시 자동 채움
  // 길이 cap 으로 비정상 prefill 차단 (server action 에서도 동일 cap 적용)
  const params = await searchParams;
  const prefill = {
    title: (params.title ?? "").slice(0, 500),
    source: (params.source ?? "").slice(0, 200),
    source_url: (params.source_url ?? "").slice(0, 1000),
    description: (params.description ?? "").slice(0, 10000),
    region: (params.region ?? "").slice(0, 200),
  };
  const hasPrefill = Object.values(prefill).some((v) => v.length > 0);

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[820px] mx-auto px-5">
        <div className="mb-8">
          <p className="text-[12px] text-blue-500 font-semibold tracking-[0.2em] mb-3">
            ADMIN · 정책 수동 등록
          </p>
          <h1 className="text-[26px] font-extrabold tracking-[-0.6px] text-grey-900 mb-2">
            복지 정책 직접 추가
          </h1>
          <p className="text-[14px] text-grey-700 leading-[1.6]">
            자동 수집이 못 잡는 광역 자체 사업 (예: 전남도 고유가 피해지원금) 을
            여기서 직접 추가합니다. 매칭 태그 (지역·연령·혜택·가구) 는 본문
            텍스트에서 자동 추출됩니다.
          </p>
        </div>

        {/* 안내 박스 */}
        <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 p-4 text-[13px] text-blue-900 leading-[1.6]">
          💡 <strong>팁</strong>: title · description · target · eligibility
          텍스트에서 지역명 (전남·서울 등) · 연령 (청년·노년 등) · 혜택 (주거·
          에너지·교통 등) 키워드를 자동 인식합니다. 매칭이 잘 안 되면 description
          에 해당 키워드를 명시적으로 포함시키세요.
        </div>

        {/* Prefill 안내 — press-ingest 에서 자동 채워온 경우 */}
        {hasPrefill && (
          <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-[13px] text-emerald-900 leading-[1.6]">
            ✓ <strong>광역 보도자료 자동 채움</strong> — 출처 보도자료에서
            제목·기관·출처 URL·요약을 가져왔습니다. 검토 후 자격·신청 방법·
            마감일을 보강하고 등록하세요.
          </div>
        )}

        <form action={createWelfareProgram} className="space-y-6">
          {/* ━━━ 필수 카드 ━━━ */}
          <section className="bg-white rounded-xl border border-grey-200 p-5">
            <h2 className="text-[15px] font-bold text-grey-900 mb-4">
              필수 정보
            </h2>
            <div className="space-y-4">
              <Field label="정책명 (title) *" name="title" required maxLength={500} placeholder="예: 전남도 고유가 피해지원금" defaultValue={prefill.title} />
              <Field label="출처 기관 (source) *" name="source" required maxLength={200} placeholder="예: 전라남도청" defaultValue={prefill.source} />
              <Field label="신청 URL (apply_url) *" name="apply_url" required type="url" placeholder="https://www.jeonnam.go.kr/..." />

              <label className="block">
                <span className="block text-[13px] font-medium text-grey-700 mb-1">
                  카테고리 (category) *
                </span>
                <select
                  name="category"
                  required
                  defaultValue=""
                  className="w-full px-3 py-2 border border-grey-200 rounded-lg text-[13px] text-grey-900 focus:border-blue-500 outline-none"
                >
                  <option value="" disabled>
                    선택…
                  </option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <Textarea
                label="정책 설명 (description) *"
                name="description"
                required
                maxLength={10000}
                rows={6}
                placeholder="정책 내용을 자세히 작성. 자동 분류는 이 텍스트에서 키워드를 인식하므로 지역명·연령대·혜택 종류를 자연스럽게 포함시키세요."
                defaultValue={prefill.description}
              />
            </div>
          </section>

          {/* ━━━ 본문·자격 카드 ━━━ */}
          <section className="bg-white rounded-xl border border-grey-200 p-5">
            <h2 className="text-[15px] font-bold text-grey-900 mb-4">
              본문 (선택)
            </h2>
            <div className="space-y-4">
              <Textarea
                label="대상 (target)"
                name="target"
                maxLength={1000}
                rows={2}
                placeholder="예: 전남도 거주 자영업자·소상공인"
              />
              <Textarea
                label="지원 자격 (eligibility)"
                name="eligibility"
                maxLength={5000}
                rows={3}
                placeholder="자격 조건 상세"
              />
              <Textarea
                label="혜택 내용 (benefits)"
                name="benefits"
                maxLength={2000}
                rows={2}
                placeholder="예: 1인 최대 50만원"
              />
              <Textarea
                label="신청 방법 (apply_method)"
                name="apply_method"
                maxLength={2000}
                rows={2}
                placeholder="예: 주민센터 방문 신청 또는 정부24"
              />
            </div>
          </section>

          {/* ━━━ 기간·출처 카드 ━━━ */}
          <section className="bg-white rounded-xl border border-grey-200 p-5">
            <h2 className="text-[15px] font-bold text-grey-900 mb-4">
              기간·출처 (선택)
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="신청 시작 (YYYY-MM-DD)" name="apply_start" type="date" />
              <Field label="신청 마감 (YYYY-MM-DD)" name="apply_end" type="date" />
            </div>
            <div className="mt-4 space-y-4">
              <Field label="출처 URL (source_url)" name="source_url" type="url" placeholder="원문 또는 보도자료 URL" defaultValue={prefill.source_url} />
              <Field label="지역 (region, 자유 텍스트)" name="region" maxLength={200} placeholder="예: 전라남도" defaultValue={prefill.region} />
            </div>
          </section>

          {/* ━━━ 액션 ━━━ */}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="min-h-[48px] px-6 text-[14px] font-bold rounded-lg bg-blue-500 text-white hover:bg-blue-600"
            >
              등록 + 자동 분류
            </button>
            <Link
              href="/admin"
              className="min-h-[48px] px-6 inline-flex items-center text-[14px] font-semibold rounded-lg border border-grey-200 text-grey-700 hover:bg-grey-50 no-underline"
            >
              취소
            </Link>
            <span className="ml-auto text-[12px] text-grey-600">
              source_code=<code>manual_admin</code> 으로 저장 + 감사 로그 기록
            </span>
          </div>
        </form>
      </div>
    </main>
  );
}

// ━━━ 폼 필드 헬퍼 ━━━
function Field({
  label,
  name,
  type = "text",
  required,
  maxLength,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-grey-700 mb-1">
        {label}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        defaultValue={defaultValue || undefined}
        className="w-full px-3 py-2 border border-grey-200 rounded-lg text-[13px] text-grey-900 focus:border-blue-500 outline-none"
      />
    </label>
  );
}

function Textarea({
  label,
  name,
  required,
  maxLength,
  rows = 3,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  maxLength?: number;
  rows?: number;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-grey-700 mb-1">
        {label}
      </span>
      <textarea
        name={name}
        required={required}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
        defaultValue={defaultValue || undefined}
        className="w-full px-3 py-2 border border-grey-200 rounded-lg text-[13px] text-grey-900 focus:border-blue-500 outline-none leading-[1.6] resize-y"
      />
    </label>
  );
}
