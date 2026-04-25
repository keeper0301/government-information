"use client";

// ============================================================
// HideNewsButton — 정책 뉴스 상세 우상단의 admin 전용 "숨김" 버튼 + 확인 모달
// ============================================================
// 스펙: docs/superpowers/specs/2026-04-25-news-moderation-design.md 2.1
//
// 권한 체크는 2단 방어:
//   1) 서버 컴포넌트 (/news/[slug]/page.tsx) 가 isAdminUser 통과 시에만
//      이 컴포넌트를 렌더. 비admin 의 DOM 에는 없음.
//   2) toggleNewsHidden server action 이 다시 requireAdminUser 로 검증.
//      (DOM 조작·직접 POST 방어)
//
// 확정 시 /admin/news/actions.ts 의 toggleNewsHidden 재사용 — slug/hide/
// reasonCategory/note/returnTo 를 form 으로 전달. returnTo 를 동일 상세
// 페이지로 지정해 admin 은 "복원" 배너 포함한 상태를 즉시 확인.
// ============================================================

import { useState } from "react";
import { toggleNewsHidden } from "@/app/admin/news/actions";
import { HIDE_REASON_CATEGORIES } from "@/app/admin/news/moderation-types";

type Props = {
  slug: string;
};

export function HideNewsButton({ slug }: Props) {
  const [open, setOpen] = useState(false);
  const returnTo = `/news/${slug}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] font-semibold px-3 py-1.5 rounded-md border border-red/40 text-red hover:bg-red/10 transition-colors"
      >
        이 뉴스 숨김
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="hide-news-title"
          className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-[440px] w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="hide-news-title"
              className="text-[17px] font-bold text-grey-900 mb-2"
            >
              이 뉴스를 비공개로 전환할까요?
            </h2>
            <p className="text-[13px] text-grey-700 leading-[1.6] mb-4">
              확정 즉시 /news 목록·홈·sitemap 모두에서 사라지고,
              일반 사용자가 이 URL 을 열면 비공개 안내 페이지(noindex)가 표시돼요.
              잘못 숨겼다면 /admin/news 또는 이 페이지의 복원 배너에서 바로 되돌릴 수 있어요.
            </p>

            <form action={toggleNewsHidden} className="space-y-3">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="hide" value="true" />
              <input type="hidden" name="returnTo" value={returnTo} />

              <div>
                <label
                  htmlFor="hide-news-reason"
                  className="block text-[12px] font-semibold text-grey-900 mb-1"
                >
                  사유 카테고리
                </label>
                <select
                  id="hide-news-reason"
                  name="reasonCategory"
                  required
                  defaultValue={HIDE_REASON_CATEGORIES[0]}
                  className="w-full px-3 py-2 text-[14px] border border-grey-300 rounded-lg bg-white focus:outline-none focus:border-blue-500"
                >
                  {HIDE_REASON_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="hide-news-note"
                  className="block text-[12px] font-semibold text-grey-900 mb-1"
                >
                  메모 (선택)
                </label>
                <input
                  id="hide-news-note"
                  type="text"
                  name="note"
                  maxLength={200}
                  placeholder="예: 홍길동 요청 2026-04-25"
                  className="w-full px-3 py-2 text-[14px] border border-grey-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
                <p className="text-[11px] text-grey-600 mt-1">
                  법적 요청의 경우 요청자·일시를 기록해 두면 추후 대응이 쉬워요.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 bg-grey-100 text-grey-900 text-[13px] font-semibold rounded-lg hover:bg-grey-200 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red text-white text-[13px] font-semibold rounded-lg hover:bg-red/90 transition-colors"
                >
                  숨김 확정
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
