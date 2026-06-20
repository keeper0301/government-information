import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import type { SnsLeadRecommendationStatus } from "@/lib/analytics/sns-utm-performance";
import { getSnsUtmPerformance } from "@/lib/analytics/sns-utm-performance";
import { loadLatestSnsCaptionPreviews } from "@/lib/sns-control-tower/caption-preview";
import { loadSnsLeadPolicySnapshot } from "@/lib/sns-control-tower/lead-policy";
import { loadSnsControlTowerSnapshotDbFirst } from "@/lib/sns-control-tower/registry";
import { importLocalReportsAction, markManualDeletedAction, setLeadPolicyAction } from "./actions";
import type { SnsPostStatus, SnsPublishedPost } from "@/lib/sns-control-tower/types";

export const metadata: Metadata = {
  title: "SNS Control Tower | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SnsControlTowerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const [snapshot, utmPerformance, leadPolicy, captionPreviewsResult] = await Promise.all([
    loadSnsControlTowerSnapshotDbFirst(),
    getSnsUtmPerformance(30),
    loadSnsLeadPolicySnapshot(),
    loadLatestSnsCaptionPreviews(3)
      .then((previews) => ({ previews, error: null as string | null }))
      .catch((error) => ({
        previews: [],
        error: error instanceof Error ? error.message : String(error),
      })),
  ]);
  const finalPost = snapshot.posts.find((post) => post.status === "active_final");
  const failedDeletionPosts = snapshot.posts.filter((post) => post.status === "delete_failed_permission");

  return (
    <div className="max-w-[1120px]">
      <AdminPageHeader
        kicker="ADMIN · SNS 운영"
        title="SNS Control Tower"
        description="발행본 원장, 최종본, 중복본, 삭제 실패를 DB 기준으로 한 화면에서 보는 운영 콘솔."
      />

      {params.flash && (
        <section className="mb-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-900">
          {params.flash}
        </section>
      )}
      {params.error && (
        <section className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-900">
          {params.error}
        </section>
      )}

      <section className="mb-5 rounded-2xl border border-grey-200 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-extrabold text-grey-950">DB 원장 이관</div>
            <p className="mt-1 text-xs leading-relaxed text-grey-500">
              기존 Hermes JSON 리포트를 `sns_posts`, `sns_render_artifacts`, `sns_cleanup_queue`로 다시 이관한다. 재실행 시 같은 게시물은 갱신된다.
            </p>
          </div>
          <form action={importLocalReportsAction}>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
            >
              리포트 DB 이관
            </button>
          </form>
        </div>
      </section>

      {snapshot.warnings.length > 0 && (
        <section className="mb-5 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
          <div className="font-bold">주의</div>
          <ul className="mt-2 list-disc pl-5">
            {snapshot.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      {leadPolicy.warning && (
        <section className="mb-5 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm font-semibold text-orange-900">
          {leadPolicy.warning}
        </section>
      )}

      <section className="mb-6 grid gap-3 md:grid-cols-5">
        <MetricCard label="총 발행본" value={snapshot.stats.total} tone="grey" />
        <MetricCard label="최종본" value={snapshot.stats.activeFinal} tone="green" />
        <MetricCard label="이전본" value={snapshot.stats.superseded} tone="blue" />
        <MetricCard
          label="삭제 실패"
          value={snapshot.stats.deleteFailedPermission}
          tone="red"
        />
        <MetricCard label="URL 누락" value={snapshot.stats.missingPermalink} tone="orange" />
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-700">
            UTM 성과 · 최근 {utmPerformance.windowDays}일
          </div>
          <h2 className="mt-1 text-lg font-extrabold tracking-[-0.4px] text-blue-950">
            SNS 자동 발행 클릭 추적
          </h2>
          {utmPerformance.error ? (
            <p className="mt-2 rounded-xl border border-blue-200 bg-white p-3 text-xs leading-relaxed text-blue-900">
              GA4 UTM 조회 대기: {utmPerformance.error}. 발행은 계속되지만, 어떤 첫줄이 돈 되는지는 아직 안 보인다.
            </p>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <MetricCard label="SNS 세션" value={utmPerformance.totals.sessions} tone="blue" compact />
                <MetricCard label="활성 사용자" value={utmPerformance.totals.activeUsers} tone="green" compact />
              </div>
              {utmPerformance.bestContent && (
                <p className="mt-3 text-xs font-bold text-blue-950">
                  현재 1등: {utmPerformance.bestContent.source} · {utmPerformance.bestContent.content} · {utmPerformance.bestContent.sessions}세션
                </p>
              )}
              <div className="mt-4 rounded-xl border border-blue-200 bg-white p-3">
                <div className="text-xs font-extrabold text-blue-950">Threads lead 운영 권고</div>
                <ul className="mt-2 space-y-2">
                  {utmPerformance.leadRecommendations.map((lead) => (
                    <li key={lead.content} className="rounded-lg border border-blue-100 bg-blue-50/70 p-2 text-xs text-blue-950">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-extrabold">{lead.content}</div>
                        <LeadStatusBadge status={lead.status} />
                      </div>
                      <div className="mt-1 text-blue-900">
                        {lead.sessions}세션 · {lead.activeUsers}명 · {lead.sharePct}%
                      </div>
                      <div className="mt-1 leading-relaxed text-blue-800">{lead.reason}</div>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] leading-relaxed text-blue-700">
                  이건 자동 변경이 아니라 운영 판단표다. 실제 lead 중단/비율 변경은 별도 승인 후 적용.
                </p>
                <div className="mt-3 border-t border-blue-100 pt-3">
                  <div className="text-xs font-extrabold text-blue-950">현재 적용 정책</div>
                  <ul className="mt-2 space-y-2">
                    {leadPolicy.policies.map((policy) => (
                      <li key={policy.content} className="rounded-lg bg-white p-2 text-xs text-blue-950">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-extrabold">{policy.content}</span>
                          <span className={policy.status === "paused" ? "font-bold text-red-700" : "font-bold text-green-700"}>
                            {policy.status === "paused" ? "중단 적용 중" : "사용 중"}
                          </span>
                        </div>
                        {policy.reason && <div className="mt-1 text-blue-700">사유: {policy.reason}</div>}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <form action={setLeadPolicyAction}>
                            <input type="hidden" name="content" value={policy.content} />
                            <input type="hidden" name="status" value="active" />
                            <input type="hidden" name="reason" value="관리자 승인: lead 재사용" />
                            <button type="submit" className="rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-[11px] font-bold text-green-800 hover:bg-green-100">
                              사용
                            </button>
                          </form>
                          <form action={setLeadPolicyAction}>
                            <input type="hidden" name="content" value={policy.content} />
                            <input type="hidden" name="status" value="paused" />
                            <input type="hidden" name="reason" value="관리자 승인: 성과 낮은 lead 중단" />
                            <button type="submit" className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-bold text-red-800 hover:bg-red-100">
                              중단
                            </button>
                          </form>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <ul className="mt-3 space-y-2">
                {utmPerformance.rows.slice(0, 5).map((row) => (
                  <li key={`${row.source}-${row.content}`} className="rounded-xl bg-white p-3 text-xs text-blue-950">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-extrabold">{row.source} / {row.content}</span>
                      <span>{row.sessions}세션 · {row.activeUsers}명</span>
                    </div>
                  </li>
                ))}
              </ul>
              {utmPerformance.rows.length === 0 && (
                <p className="mt-3 text-xs text-blue-800">아직 blog_auto UTM 유입이 없다. 다음 발행 뒤 이 카드가 A/B 판정판이 된다.</p>
              )}
            </>
          )}
        </div>

        <div className="rounded-2xl border border-grey-200 bg-white p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-grey-500">
            Threads 미리보기
          </div>
          <h2 className="mt-1 text-lg font-extrabold tracking-[-0.4px] text-grey-950">
            최신 블로그 캡션 가독성 검수
          </h2>
          {captionPreviewsResult.error ? (
            <p className="mt-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">
              미리보기 로드 실패: {captionPreviewsResult.error}
            </p>
          ) : captionPreviewsResult.previews.length === 0 ? (
            <p className="mt-3 text-sm text-grey-500">미리볼 블로그 글이 없다.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {captionPreviewsResult.previews.map((preview) => (
                <li key={preview.slug} className="rounded-xl border border-grey-100 bg-grey-50 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-grey-600">
                    <span>{preview.length}/500자</span>
                    <span>·</span>
                    <span>{preview.leadVariant}</span>
                    <span>·</span>
                    <span>{formatDate(preview.publishedAt)}</span>
                  </div>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-xs leading-relaxed text-grey-900">
                    {preview.text}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {finalPost && (
        <section className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-green-700">
            현재 최종본
          </div>
          <h2 className="mt-1 text-lg font-extrabold tracking-[-0.4px] text-green-950">
            {finalPost.topic}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-green-900">
            <StatusBadge status={finalPost.status} />
            <span>mediaId: {finalPost.mediaId ?? "—"}</span>
            <span>·</span>
            <span>{formatDate(finalPost.publishedAt)}</span>
          </div>
          {finalPost.permalink && (
            <Link
              href={finalPost.permalink}
              target="_blank"
              className="mt-3 inline-flex rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-800"
            >
              최종본 열기
            </Link>
          )}
        </section>
      )}

      {failedDeletionPosts.length > 0 && (
        <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-red-700">
            즉시 처리 필요
          </div>
          <h2 className="mt-1 text-lg font-extrabold tracking-[-0.4px] text-red-950">
            삭제 실패 게시물 {failedDeletionPosts.length}건
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-red-900">
            Graph API 권한 문제로 자동 삭제가 실패한 이전 발행본이다. Instagram에서 직접 삭제한 뒤 `수동 삭제 완료`를 눌러 원장을 닫아라.
          </p>
          <ul className="mt-4 space-y-3">
            {failedDeletionPosts.map((post) => (
              <li
                key={`failed-${post.platform}-${post.itemId}-${post.mediaId ?? "none"}`}
                className="rounded-xl border border-red-200 bg-white p-3"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-extrabold text-red-950">{post.topic}</div>
                    <div className="mt-1 break-all text-xs text-red-800">mediaId: {post.mediaId ?? "—"}</div>
                    {post.deletion?.reason && (
                      <div className="mt-2 break-words text-xs text-red-700">{post.deletion.reason}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {post.permalink && (
                      <Link
                        href={post.permalink}
                        target="_blank"
                        className="rounded-lg border border-red-300 px-3 py-2 text-xs font-bold text-red-900 hover:bg-red-100"
                      >
                        Instagram에서 확인
                      </Link>
                    )}
                    {post.mediaId && (
                      <form action={markManualDeletedAction}>
                        <input type="hidden" name="mediaId" value={post.mediaId} />
                        <button
                          type="submit"
                          className="rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white hover:bg-red-800"
                        >
                          수동 삭제 완료
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-grey-200 bg-white">
        <div className="border-b border-grey-100 p-5">
          <h2 className="text-base font-extrabold tracking-[-0.3px] text-grey-900">
            발행 원장
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-grey-500">
            기존 리포트 경로: <code>/home/user/.hermes/workspace/claude/data/keepioo/reports</code>
          </p>
        </div>

        {snapshot.posts.length === 0 ? (
          <div className="p-8 text-center text-sm text-grey-500">표시할 SNS 발행 리포트가 없다.</div>
        ) : (
          <ul className="divide-y divide-grey-100">
            {snapshot.posts.map((post) => (
              <PostRow key={`${post.platform}-${post.itemId}-${post.mediaId ?? "none"}`} post={post} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm leading-relaxed text-blue-950">
        <div className="font-bold">다음 Phase</div>
        <ul className="mt-2 list-disc pl-5">
          <li>삭제 재시도 자동화와 Graph API 권한 점검 로그 저장</li>
          <li>`next-og-image-response` 아닌 렌더러 발행 차단</li>
          <li>승인·렌더·발행·정리까지 관리자 화면으로 통합</li>
        </ul>
      </section>
    </div>
  );
}

function PostRow({ post }: { post: SnsPublishedPost }) {
  return (
    <li className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={post.status} />
            <span className="rounded-full bg-grey-100 px-2 py-1 text-[11px] font-bold uppercase text-grey-600">
              {post.platform}
            </span>
            <span className="text-xs text-grey-500">{formatDate(post.publishedAt)}</span>
          </div>
          <h3 className="truncate text-sm font-extrabold tracking-[-0.2px] text-grey-950">
            {post.topic}
          </h3>
          <p className="mt-1 break-all text-xs text-grey-500">itemId: {post.itemId}</p>
          <div className="mt-3 grid gap-2 text-xs text-grey-700 md:grid-cols-2">
            <Info label="mediaId" value={post.mediaId} />
            <Info label="shortcode" value={post.shortcode} />
            <Info label="assets" value={String(post.assetCount)} />
            <Info label="render QA" value={post.renderOk === null ? "—" : post.renderOk ? "pass" : "fail"} />
            <Info label="manifest" value={post.renderManifest} wide />
            <Info label="report" value={post.reportPath} wide />
          </div>
          {post.deletion && (
            <div className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-900">
              <div className="font-bold">삭제 시도 실패</div>
              <div className="mt-1">
                HTTP {post.deletion.deleteHttpStatus ?? "—"} · verify GET {post.deletion.verifyGetHttpStatus ?? "—"}
              </div>
              {post.deletion.reason && <div className="mt-1 break-words">{post.deletion.reason}</div>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {post.deletion && post.mediaId && (
            <form action={markManualDeletedAction}>
              <input type="hidden" name="mediaId" value={post.mediaId} />
              <button
                type="submit"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800 hover:bg-red-100"
              >
                수동 삭제 완료
              </button>
            </form>
          )}
          {post.permalink ? (
            <Link
              href={post.permalink}
              target="_blank"
              className="rounded-lg border border-grey-300 px-3 py-2 text-xs font-bold text-grey-800 hover:bg-grey-50"
            >
              Instagram 열기
            </Link>
          ) : (
            <span className="rounded-lg border border-grey-200 px-3 py-2 text-xs text-grey-500">URL 없음</span>
          )}
        </div>
      </div>
    </li>
  );
}

function MetricCard({
  label,
  value,
  tone,
  compact = false,
}: {
  label: string;
  value: number;
  tone: "grey" | "green" | "blue" | "red" | "orange";
  compact?: boolean;
}) {
  const toneClass = {
    grey: "border-grey-200 bg-white text-grey-900",
    green: "border-green-200 bg-green-50 text-green-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    red: "border-red-200 bg-red-50 text-red-900",
    orange: "border-orange-200 bg-orange-50 text-orange-900",
  }[tone];
  return (
    <div className={`rounded-2xl border ${compact ? "p-3" : "p-4"} ${toneClass}`}>
      <div className="text-xs font-bold text-current opacity-70">{label}</div>
      <div className={`${compact ? "mt-1 text-xl" : "mt-2 text-2xl"} font-black tracking-[-0.5px]`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: SnsPostStatus }) {
  const label = {
    active_final: "최종본",
    superseded: "이전본",
    delete_pending: "삭제 대기",
    delete_failed_permission: "삭제 실패/권한",
    manually_deleted: "수동 삭제됨",
    unknown: "미분류",
  }[status];
  const className = {
    active_final: "bg-green-100 text-green-800 border-green-200",
    superseded: "bg-blue-100 text-blue-800 border-blue-200",
    delete_pending: "bg-orange-100 text-orange-800 border-orange-200",
    delete_failed_permission: "bg-red-100 text-red-800 border-red-200",
    manually_deleted: "bg-grey-100 text-grey-700 border-grey-200",
    unknown: "bg-grey-100 text-grey-700 border-grey-200",
  }[status];
  return <span className={`rounded-full border px-2 py-1 text-[11px] font-extrabold ${className}`}>{label}</span>;
}

function LeadStatusBadge({ status }: { status: SnsLeadRecommendationStatus }) {
  const label = {
    keep: "유지 후보",
    pause: "중단 후보",
    watch: "관찰",
    needs_data: "데이터 부족",
  }[status];
  const className = {
    keep: "bg-green-100 text-green-800 border-green-200",
    pause: "bg-red-100 text-red-800 border-red-200",
    watch: "bg-orange-100 text-orange-800 border-orange-200",
    needs_data: "bg-grey-100 text-grey-700 border-grey-200",
  }[status];
  return <span className={`rounded-full border px-2 py-1 text-[11px] font-extrabold ${className}`}>{label}</span>;
}

function Info({ label, value, wide = false }: { label: string; value: string | null; wide?: boolean }) {
  return (
    <div className={wide ? "md:col-span-2" : undefined}>
      <span className="font-bold text-grey-500">{label}: </span>
      <span className="break-all text-grey-800">{value ?? "—"}</span>
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}
