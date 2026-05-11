// ============================================================
// /admin/instagram — 인스타그램 카드뉴스 자동 생성
// ============================================================
// keepioo 자동 발행 블로그 → 1080×1350 (4:5 portrait) 카드 3장 자동 생성.
// 인스타 자체 게시는 Meta API 복잡도 + 사장님 비즈니스 계정 필요로 반자동.
//
// 사장님 흐름 (5분/글):
//   1) 어드민에서 정책 1편 선택
//   2) 카드 3장 미리보기 확인 (표지 / 핵심정보 / CTA)
//   3) 「캡션 복사」 클릭
//   4) 각 카드 우클릭 → "이미지 저장"
//   5) 인스타 앱에서 멀티이미지 게시 + 캡션 paste
//
// 인스타 게시 후 효과:
//   - 카드뉴스 백링크 (프로필 link in bio = keepioo.com) 효과
//   - 해시태그 검색 노출 (#청년정책 #소상공인지원 등)
//   - 카드 하단의 keepioo 브랜드 시각 노출
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { buildInstagramCaption, getLinkInBioText } from "@/lib/instagram/caption";
import { CopyCaption } from "./copy-caption";

export const metadata: Metadata = {
  title: "인스타 카드뉴스 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/instagram");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

type RecentPost = {
  id: string;
  slug: string;
  title: string;
  meta_description: string | null;
  category: string | null;
  tags: string[] | null;
  published_at: string;
  instagram_published_at: string | null;
  instagram_media_id: string | null;
  instagram_error: string | null;
  instagram_attempt_count: number;
};

async function loadRecentPosts(): Promise<RecentPost[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("blog_posts")
    .select(
      "id, slug, title, meta_description, category, tags, published_at, instagram_published_at, instagram_media_id, instagram_error, instagram_attempt_count",
    )
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(20);
  return (data ?? []) as RecentPost[];
}

type OAuthStatus =
  | { connected: false }
  | {
      connected: true;
      username: string | null;
      expiresAt: string;
      daysLeft: number;
    };

/** Instagram OAuth 연결 상태 — instagram_oauth_tokens 의 가장 최근 row */
async function loadOAuthStatus(): Promise<OAuthStatus> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("instagram_oauth_tokens")
    .select("username, expires_at")
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ username: string | null; expires_at: string }>();

  if (!data) return { connected: false };

  const expiresMs = new Date(data.expires_at).getTime();
  const daysLeft = Math.max(0, Math.floor((expiresMs - Date.now()) / 86400000));

  // 이미 만료 — 미연결로 표시
  if (daysLeft === 0 && expiresMs <= Date.now()) {
    return { connected: false };
  }

  return {
    connected: true,
    username: data.username,
    expiresAt: data.expires_at,
    daysLeft,
  };
}

/** 자동 발행 통계 — 최근 30일 발행 글 기준 */
async function loadInstaStats() {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("blog_posts")
    .select("instagram_published_at, instagram_error, instagram_attempt_count")
    .not("published_at", "is", null)
    .gte("published_at", since);
  const rows = (data ?? []) as Array<{
    instagram_published_at: string | null;
    instagram_error: string | null;
    instagram_attempt_count: number;
  }>;
  return {
    total: rows.length,
    published: rows.filter((r) => r.instagram_published_at !== null).length,
    pending: rows.filter(
      (r) => r.instagram_published_at === null && r.instagram_attempt_count < 3,
    ).length,
    failed: rows.filter(
      (r) => r.instagram_published_at === null && r.instagram_attempt_count >= 3,
    ).length,
  };
}

export default async function AdminInstagramPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const oauthSuccess = params.oauth === "success" ? params.user : null;
  const oauthError = params.oauth_error ?? null;

  const [posts, stats, oauth] = await Promise.all([
    loadRecentPosts(),
    loadInstaStats(),
    loadOAuthStatus(),
  ]);

  return (
    <div className="max-w-[980px]">
      <AdminPageHeader
        kicker="ADMIN · 마케팅"
        title="인스타 카드뉴스"
        description="블로그 발행 시 인스타 carousel 자동 게시 (5분 cron) — 카드 3장 + 캡션 + 해시태그"
      />

      {/* OAuth 연결 결과 inline alert */}
      {oauthSuccess && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          ✅ <strong>@{oauthSuccess}</strong> 계정으로 인스타 연결 완료. 5분 안에 자동 발행 cron 가동.
        </div>
      )}
      {oauthError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          ❌ 인스타 연결 실패: <code className="text-xs bg-white px-1 py-0.5 rounded">{oauthError}</code>
        </div>
      )}

      {/* OAuth 연결 상태 카드 */}
      <div className="mb-6 rounded-xl border border-grey-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-grey-500 tracking-wider uppercase mb-1">
              Instagram OAuth 연결
            </div>
            {oauth.connected ? (
              <div className="text-sm text-grey-900">
                ✅ <strong>@{oauth.username ?? "(unknown)"}</strong> 계정 연결됨
                <span className="ml-2 text-xs text-grey-500">
                  · 토큰 만료까지 {oauth.daysLeft}일 (만료 7일 전 자동 갱신)
                </span>
              </div>
            ) : (
              <div className="text-sm text-grey-700">
                ⚠️ 인스타 계정 미연결 — 아래 버튼 클릭으로 OAuth 시작
              </div>
            )}
          </div>
          <a
            href="/api/instagram/oauth/start"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            {oauth.connected ? "재연결" : "인스타 연결"}
          </a>
        </div>
      </div>

      {/* 자동 발행 상태 — 30일 기준 */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        <StatCard label="최근 30일 블로그" value={stats.total} accent="grey" />
        <StatCard label="✅ 인스타 발행됨" value={stats.published} accent="green" />
        <StatCard label="⏳ 대기 중" value={stats.pending} accent="blue" />
        <StatCard label="❌ 실패 (3회 시도)" value={stats.failed} accent="red" />
      </div>

      {/* 운영 안내 */}
      <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 p-4 text-xs text-blue-900 leading-[1.7]">
        🤖 <strong>자동 발행</strong>: blog_posts 새 글 발행 시 5분 안에 인스타 carousel 자동 게시.
        Meta Graph API 사용 (Long-Lived Token 60일 만료, 매월 1일 cron 자동 refresh).
        <p className="mt-2">
          <strong>📌 인스타 프로필 link in bio 1회 설정</strong>:{" "}
          <code className="text-[11px] bg-white px-1 py-0.5 rounded">{getLinkInBioText()}</code>
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-lg border border-grey-200 bg-grey-50 p-6 text-center text-sm text-grey-600">
          아직 발행된 블로그 글이 없어요.
        </div>
      ) : (
        <ul className="space-y-6">
          {posts.map((post) => {
            const caption = buildInstagramCaption({
              title: post.title,
              meta_description: post.meta_description,
              category: post.category,
              tags: post.tags,
              detailUrl: `https://www.keepioo.com/blog/${post.slug}`,
            });
            return (
              <li
                key={post.id}
                className="rounded-lg border border-grey-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-grey-900">
                      {post.title}
                    </h3>
                    <p className="text-xs text-grey-500 mt-1">
                      {post.category ?? "—"} · {formatDate(post.published_at)}
                      {" · "}
                      <PublishStatusBadge post={post} />
                    </p>
                    {post.instagram_error && (
                      <p className="mt-1 text-[11px] text-red-600 truncate">
                        에러: {post.instagram_error}
                      </p>
                    )}
                  </div>
                  <CopyCaption caption={caption} />
                </div>

                {/* 카드 3장 미리보기 — 그리드 */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[1, 2, 3].map((idx) => (
                    <a
                      key={idx}
                      href={`/api/instagram-card/${encodeURIComponent(post.slug)}/${idx}`}
                      target="_blank"
                      rel="noopener"
                      className="block group"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/instagram-card/${encodeURIComponent(post.slug)}/${idx}`}
                        alt={`카드 ${idx}`}
                        className="w-full aspect-[4/5] rounded border border-grey-200 group-hover:border-blue-400 transition-colors"
                        loading="lazy"
                      />
                      <p className="text-[11px] text-grey-600 mt-1 text-center">
                        {idx === 1 ? "표지" : idx === 2 ? "핵심 정보" : "CTA"}
                      </p>
                    </a>
                  ))}
                </div>

                {/* 캡션 미리보기 (접힘) */}
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-grey-700 font-medium hover:text-grey-900">
                    캡션 미리보기
                  </summary>
                  <pre className="mt-2 p-3 bg-grey-50 rounded text-xs whitespace-pre-wrap font-sans text-grey-700">
                    {caption}
                  </pre>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "grey" | "green" | "blue" | "red";
}) {
  const accentClass = {
    grey: "border-grey-200 bg-white",
    green: "border-green-200 bg-green-50",
    blue: "border-blue-200 bg-blue-50",
    red: "border-red-200 bg-red-50",
  }[accent];
  return (
    <div className={`rounded-lg border ${accentClass} p-3`}>
      <p className="text-[11px] text-grey-600">{label}</p>
      <p className="mt-1 text-xl font-semibold text-grey-900">{value}</p>
    </div>
  );
}

function PublishStatusBadge({
  post,
}: {
  post: {
    instagram_published_at: string | null;
    instagram_media_id: string | null;
    instagram_attempt_count: number;
  };
}) {
  if (post.instagram_published_at) {
    return (
      <span className="inline-flex items-center rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800">
        ✅ 인스타 발행됨
      </span>
    );
  }
  if (post.instagram_attempt_count >= 3) {
    return (
      <span className="inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
        ❌ 발행 실패 ({post.instagram_attempt_count}회)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">
      ⏳ 발행 대기 ({post.instagram_attempt_count}/3)
    </span>
  );
}
