// ============================================================
// AdminRestoreBanner — hidden 뉴스를 admin 이 열었을 때 상단에 뜨는 복원 배너
// ============================================================
// 스펙: docs/superpowers/specs/2026-04-25-news-moderation-design.md 3.3
//
// admin 은 createAdminClient (RLS 우회) 로 hidden 뉴스도 볼 수 있음.
// 배너로 "비공개 상태" + "복원" 버튼 노출. 버튼은 /admin/news/actions 의
// toggleNewsHidden 을 hide=false 로 호출 → 감사 로그·revalidate·리다이렉트
// 동일 경로로 재진입 (복원 후엔 평소 상세 페이지로 보임).
// ============================================================

import { toggleNewsHidden } from "@/app/admin/news/actions";

type Props = {
  slug: string;
  hiddenAt: string | null;
  hiddenReason: string | null;
};

export function AdminRestoreBanner({ slug, hiddenAt, hiddenReason }: Props) {
  const hiddenAtLabel = hiddenAt
    ? new Date(hiddenAt).toLocaleString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      role="status"
      className="bg-orange/10 border border-orange/30 rounded-xl px-4 py-3 mb-6 flex flex-wrap items-start gap-3"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-grey-900 mb-0.5">
          ⚠ 이 뉴스는 현재 비공개 상태입니다
        </div>
        <div className="text-[12px] text-grey-700 leading-[1.55]">
          일반 사용자에게는 비공개 안내 페이지(noindex)가 표시되고,
          /news 목록·홈·sitemap 어디에도 노출되지 않아요.
          {hiddenAtLabel && (
            <>
              <br />
              숨긴 시각 {hiddenAtLabel}
              {hiddenReason && ` — ${hiddenReason}`}
            </>
          )}
        </div>
      </div>
      <form action={toggleNewsHidden} className="shrink-0">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="hide" value="false" />
        <input type="hidden" name="returnTo" value={`/news/${slug}`} />
        <button
          type="submit"
          className="px-4 py-2 bg-grey-900 text-white text-[12px] font-semibold rounded-md hover:bg-grey-800"
        >
          복원
        </button>
      </form>
    </div>
  );
}
