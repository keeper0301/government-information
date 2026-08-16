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
import {
  getAdminInstagramReelsQualityDashboard,
  type InstagramReelsQualityCandidate,
  type InstagramReelsQualityDashboard,
  type ReelsCandidateStatus,
} from "@/lib/admin-instagram-reels-quality";

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

  const [posts, stats, oauth, reels] = await Promise.all([
    loadRecentPosts(),
    loadInstaStats(),
    loadOAuthStatus(),
    getAdminInstagramReelsQualityDashboard(),
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

      <ReelsQualityDashboard data={reels} />

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

function ReelsQualityDashboard({ data }: { data: InstagramReelsQualityDashboard }) {
  const capAccent = data.dailyCapRemaining > 0 ? "green" : "red";
  return (
    <section className="mb-6 rounded-xl border border-grey-200 bg-white p-5">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-grey-500">
            Instagram Reels 자동 발행 품질
          </div>
          <h2 className="mt-1 text-lg font-bold tracking-[-0.3px] text-grey-900">
            렌더·품질 gate·발행 상태 보드
          </h2>
          <p className="mt-1 text-xs leading-[1.5] text-grey-500">{data.safetyLine}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
          <StatePill ok={data.renderEnabled} label={`render ${data.renderEnabled ? "ON" : "OFF"}`} />
          <StatePill ok={data.publishEnabled} label={`publish ${data.publishEnabled ? "ON" : "OFF"}`} />
          <StatePill ok={!data.frozenHookCtaWeak} label={data.frozenHookCtaWeak ? "hook_cta_weak freeze" : "freeze clear"} />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        <MiniStat label="오늘 발행" value={`${data.todayPublished}/${data.dailyCap}`} accent={capAccent} />
        <MiniStat label="발행 대기" value={data.counts.readyToPublish} accent="blue" />
        <MiniStat label="렌더 필요" value={data.counts.needsRender} accent="grey" />
        <MiniStat label="품질 보류" value={data.counts.qualityBlocked} accent="yellow" />
        <MiniStat label="retry 제외" value={data.counts.retryExcluded} accent="red" />
        <MiniStat label="최근 발행" value={data.counts.published} accent="green" />
      </div>

      {data.latestJudgementStatus && (
        <div className="mb-4 rounded-lg border border-yellow-100 bg-yellow-50 px-4 py-3 text-xs leading-[1.6] text-yellow-900">
          최근 성과 판정: <strong>{data.latestJudgementStatus}</strong>
          {data.latestJudgementAt ? ` · ${formatDateTime(data.latestJudgementAt)}` : ""}
          {data.latestJudgementNextAction ? ` · 다음 조치: ${data.latestJudgementNextAction}` : ""}
        </div>
      )}

      {data.candidates.length === 0 ? (
        <div className="rounded-lg border border-grey-200 bg-grey-50 p-4 text-sm text-grey-600">
          최근 30일 Reels 후보가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-grey-500">
              <tr>
                <th className="py-2 pr-3">상태</th>
                <th className="py-2 pr-3">제목</th>
                <th className="py-2 pr-3 text-right">점수</th>
                <th className="py-2 pr-3">TTS/오디오</th>
                <th className="py-2 pr-3">시도</th>
                <th className="py-2 pr-3">사유</th>
              </tr>
            </thead>
            <tbody>
              {data.candidates.slice(0, 12).map((candidate) => (
                <ReelsQualityRow key={candidate.id} candidate={candidate} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ReelsQualityRow({ candidate }: { candidate: InstagramReelsQualityCandidate }) {
  const reasonText = candidate.lastError
    ?? candidate.reasons.slice(0, 2).join(", ")
    ?? candidate.latestSkipReason
    ?? "—";
  return (
    <tr className="border-t border-grey-100 align-top">
      <td className="py-2 pr-3">
        <ReelsStatusBadge status={candidate.status} />
      </td>
      <td className="py-2 pr-3 text-grey-900">
        <div className="max-w-[280px] font-semibold line-clamp-2">{candidate.title}</div>
        <div className="mt-1 text-[11px] text-grey-500">
          {candidate.category ?? "미분류"} · {candidate.slug}
        </div>
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">
        <span className={candidate.reelQualityApproved ? "font-bold text-green-700" : "font-bold text-red-600"}>
          {candidate.reelScore}
        </span>
      </td>
      <td className="py-2 pr-3">
        <AudioStatusBadge status={candidate.ttsAudioStatus} />
        {candidate.durationSeconds ? (
          <div className="mt-1 text-[11px] text-grey-500">{candidate.durationSeconds}s</div>
        ) : null}
      </td>
      <td className="py-2 pr-3 text-xs text-grey-700">
        render {candidate.renderAttemptCount}/3
        <br />
        publish {candidate.publishAttemptCount}/3
      </td>
      <td className="py-2 pr-3 text-xs text-grey-600 max-w-[260px]">
        <span className="line-clamp-2">{reasonText || "—"}</span>
      </td>
    </tr>
  );
}

function StatePill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`rounded-full px-2 py-1 ${ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
      {label}
    </span>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: "grey" | "green" | "blue" | "red" | "yellow";
}) {
  const cls = {
    grey: "border-grey-200 bg-grey-50",
    green: "border-green-200 bg-green-50",
    blue: "border-blue-200 bg-blue-50",
    red: "border-red-200 bg-red-50",
    yellow: "border-yellow-200 bg-yellow-50",
  }[accent];
  return (
    <div className={`rounded-lg border ${cls} p-3`}>
      <div className="text-[11px] text-grey-500">{label}</div>
      <div className="mt-1 text-lg font-extrabold text-grey-900 tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function ReelsStatusBadge({ status }: { status: ReelsCandidateStatus }) {
  const map: Record<ReelsCandidateStatus, { label: string; cls: string }> = {
    published: { label: "발행됨", cls: "bg-green-100 text-green-800" },
    ready_to_publish: { label: "발행 대기", cls: "bg-blue-100 text-blue-800" },
    needs_render: { label: "렌더 필요", cls: "bg-grey-100 text-grey-800" },
    quality_blocked: { label: "품질 보류", cls: "bg-yellow-100 text-yellow-800" },
    retry_excluded: { label: "retry 제외", cls: "bg-red-100 text-red-800" },
    invalid_video_url: { label: "URL 오류", cls: "bg-red-100 text-red-800" },
  };
  const item = map[status];
  return <span className={`inline-flex rounded px-2 py-1 text-[11px] font-bold ${item.cls}`}>{item.label}</span>;
}

function AudioStatusBadge({ status }: { status: "verified" | "unknown" | "missing" }) {
  const map = {
    verified: { label: "검증됨", cls: "bg-green-50 text-green-700" },
    unknown: { label: "확인 필요", cls: "bg-yellow-50 text-yellow-700" },
    missing: { label: "없음", cls: "bg-grey-100 text-grey-700" },
  }[status];
  return <span className={`inline-flex rounded px-2 py-1 text-[11px] font-bold ${map.cls}`}>{map.label}</span>;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
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
