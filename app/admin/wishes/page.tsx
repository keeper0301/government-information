// ============================================================
// /admin/wishes — 사용자 의견 (받고 싶은 정책) 모니터링
// ============================================================
// WishForm (홈 페이지) 으로 들어온 의견을 사장님이 직접 읽고 다음
// keepioo 업데이트 우선순위에 반영. anon 도 작성 가능하므로 RLS 가
// SELECT 막아 service_role(어드민)만 조회 가능.
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { formatKoreanDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "사용자 의견 | 어드민",
  robots: { index: false, follow: false },
};

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/wishes");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

type Wish = {
  id: string;
  wish: string;
  email: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  created_at: string;
};

export default async function AdminWishesPage() {
  await requireAdmin();
  const admin = createAdminClient();

  // 최근 200개 + 전체 카운트 (head:true)
  const [{ data: rows }, { count: total }] = await Promise.all([
    admin
      .from("user_wishes")
      .select("id, wish, email, ip_hash, user_agent, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    admin.from("user_wishes").select("id", { count: "exact", head: true }),
  ]);

  const wishes = (rows ?? []) as Wish[];

  // 최근 7일 의견 수 (간이 trend)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentCount = wishes.filter((w) => w.created_at >= weekAgo).length;

  return (
    <main className="max-w-[920px] mx-auto px-5 pt-32 pb-20">
      <div className="mb-8">
        <p className="text-[12px] text-blue-500 font-semibold tracking-[0.2em] mb-3">
          ADMIN · 사용자 의견
        </p>
        <h1 className="text-[26px] font-extrabold tracking-[-0.6px] text-grey-900 mb-2">
          받고 싶은 정책 의견
        </h1>
        <p className="text-[14px] text-grey-600 leading-[1.6]">
          홈 페이지의 의견 수집 폼으로 들어온 글입니다. 사용자 IP 는 sha256
          hash 로만 저장돼 익명성 보장. 같은 ip_hash 가 반복되면 동일 사용자
          여러 번 제출.
        </p>
      </div>

      {/* 통계 띠 */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <Stat label="누적 의견" value={total ?? 0} />
        <Stat label="최근 7일" value={recentCount} />
      </div>

      {wishes.length === 0 ? (
        <div className="bg-white rounded-2xl ring-1 ring-grey-100 p-10 text-center text-grey-600">
          아직 의견이 없어요. 홈 페이지의 의견 폼이 잘 노출되는지 확인해보세요.
          <div className="mt-3">
            <Link href="/" className="text-blue-500 font-semibold no-underline hover:underline">
              홈 가서 보기 →
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {wishes.map((w) => (
            <article
              key={w.id}
              className="bg-white rounded-2xl ring-1 ring-grey-100 p-5 max-md:p-4"
            >
              <p className="text-[15px] text-grey-900 leading-[1.6] whitespace-pre-wrap mb-3">
                {w.wish}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-grey-500">
                <span className="font-medium text-grey-700">
                  {formatKoreanDate(w.created_at)}
                </span>
                {w.email && (
                  <a
                    href={`mailto:${w.email}`}
                    className="text-blue-500 hover:text-blue-600 no-underline"
                  >
                    ✉ {w.email}
                  </a>
                )}
                {w.ip_hash && (
                  <span className="font-mono text-grey-400" title="익명화된 IP 해시">
                    {w.ip_hash.slice(0, 8)}…
                  </span>
                )}
              </div>
            </article>
          ))}
          {wishes.length === 200 && (
            <p className="text-[12px] text-grey-500 text-center pt-4">
              최근 200개만 표시. 더 보려면 Supabase 대시보드에서 직접 조회.
            </p>
          )}
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-grey-100 px-5 py-4">
      <div className="text-[12px] font-medium text-grey-600 mb-1">{label}</div>
      <div className="text-[26px] font-extrabold tabular-nums text-blue-500">
        {value.toLocaleString()}
        <span className="text-[14px] font-medium text-grey-600 ml-1">건</span>
      </div>
    </div>
  );
}
