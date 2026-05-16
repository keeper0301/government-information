// ============================================================
// /admin/instagram/preview-categories — 8 카테고리 시각 검증 페이지
// ============================================================
// 사장님 5/17 contrast fix 검수 시 8 카테고리 × 3 카드 = 24 카드 한 페이지
// 그리드로 표시. 모바일 인스타 앱 검수 보조 도구.
//
// 사용처:
//   - 5/17 contrast fix 후 시각 변경 한 번에 확인 (커밋 fe75e13 docs 가이드 짝)
//   - 미래 인스타 카드 디자인 변경 후 회귀 검수
//   - AdSense 검수자 관점에서 카테고리별 시각 일관성 점검
//
// 카드 PNG 는 /api/instagram-card/{slug}/{1·2·3} 가 즉시 생성 (24h 캐시).
// ============================================================

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { loadCategoryPreviewRows } from "@/lib/instagram/category-preview";

export const metadata: Metadata = {
  title: "인스타 카테고리 시각 검증 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/instagram/preview-categories");
  if (!isAdminUser(user.email)) redirect("/");
}

export default async function Page() {
  await requireAdmin();
  const rows = await loadCategoryPreviewRows();
  const withPosts = rows.filter((r) => r.slug !== null).length;
  const missing = rows.filter((r) => r.slug === null);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <a
        href="/admin/instagram"
        className="mb-2 inline-block text-xs text-slate-500 hover:text-slate-700"
      >
        ← 인스타 카드뉴스
      </a>
      <AdminPageHeader
        title="인스타 카테고리 시각 검증"
        description="8 카테고리 × 카드 3장 = 24 카드 한 화면 비교. 5/16 contrast fix 후 시각 변경 검수용."
      />

      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-relaxed text-slate-700">
        <p>
          <strong>{withPosts}/8</strong> 카테고리 발행 글 존재.
          {missing.length > 0 && (
            <>
              {" "}
              발행 글 없는 카테고리:{" "}
              <span className="text-slate-500">
                {missing.map((m) => m.category).join(" · ")}
              </span>
            </>
          )}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          카드 클릭 시 새 탭에서 1080×1350 원본 크기 표시. 시각 사고 발견 시
          색 hex 알려주시면 즉시 fix.
        </p>
      </div>

      <div className="space-y-8">
        {rows.map((row) => (
          <CategoryRow key={row.category} row={row} />
        ))}
      </div>
    </div>
  );
}

function CategoryRow({ row }: { row: Awaited<ReturnType<typeof loadCategoryPreviewRows>>[number] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <header className="mb-4 flex items-center gap-3">
        <div
          className="h-5 w-5 rounded-full"
          style={{ background: row.color }}
          aria-hidden
        />
        <h2 className="text-lg font-bold text-slate-900">{row.category}</h2>
        <code className="text-xs text-slate-500">{row.color}</code>
        {row.slug ? (
          <span className="ml-auto truncate text-xs text-slate-500">
            {row.title}
          </span>
        ) : (
          <span className="ml-auto text-xs text-slate-400">
            발행 글 없음 (검수 skip)
          </span>
        )}
      </header>

      {row.slug ? (
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((idx) => (
            <a
              key={idx}
              href={`/api/instagram-card/${encodeURIComponent(row.slug!)}/${idx}`}
              target="_blank"
              rel="noopener"
              className="block overflow-hidden rounded-lg border border-slate-200 transition hover:border-slate-400"
            >
              {/* 1080×1350 PNG → 4:5 비율 축소 (CSS aspect-ratio). 카드 한 장당
                  데스크톱 약 216×270, 모바일 자동 축소. */}
              <img
                src={`/api/instagram-card/${encodeURIComponent(row.slug!)}/${idx}`}
                alt={`${row.category} 카드 ${idx}`}
                className="block w-full"
                style={{ aspectRatio: "4 / 5" }}
                loading="lazy"
                decoding="async"
              />
              <div className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-center text-xs text-slate-600">
                카드 {idx} ·{" "}
                {idx === 1 ? "표지" : idx === 2 ? "핵심정보" : "CTA"}
              </div>
            </a>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          이 카테고리 발행 글이 아직 없습니다. 첫 발행 후 자동으로 카드
          미리보기가 표시됩니다.
        </p>
      )}
    </section>
  );
}
