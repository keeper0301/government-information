// /admin/long-tail 입력 폼 — 키워드 + 카테고리 입력 → server action 호출.
// "use client" — useTransition 으로 pending 상태.

"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { submitLongTailKeyword } from "./actions";

const CATEGORIES = [
  { value: "", label: "자동 추정" },
  { value: "청년", label: "청년" },
  { value: "소상공인", label: "소상공인" },
  { value: "주거", label: "주거" },
  { value: "육아·가족", label: "육아·가족" },
  { value: "노년", label: "노년" },
  { value: "학생·교육", label: "학생·교육" },
  { value: "문화", label: "문화" },
  { value: "큐레이션", label: "큐레이션" },
];

export function LongTailForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ title: string; slug: string } | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const formData = new FormData(e.currentTarget);
    const keyword = (formData.get("keyword") ?? "").toString().trim();
    const category = (formData.get("category") ?? "").toString();

    if (keyword.length < 2) {
      setError("키워드는 2자 이상 입력해 주세요.");
      return;
    }

    startTransition(async () => {
      const result = await submitLongTailKeyword({
        keyword,
        category: category || undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "발행 실패");
        return;
      }
      setSuccess({
        title: result.title ?? "(제목 없음)",
        slug: result.slug ?? "",
      });
      // 폼 reset 은 안 함 — 사장님이 유사 키워드 연속 입력 가능 (수정만)
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-grey-200 bg-white p-5 space-y-4"
    >
      <label className="block">
        <span className="block text-sm font-semibold text-grey-800 mb-1">
          키워드 *
        </span>
        <input
          type="text"
          name="keyword"
          required
          minLength={2}
          maxLength={80}
          placeholder="60대 부산 노인 의료비 지원"
          className="w-full px-3 py-2 border border-grey-200 rounded-lg text-sm text-grey-900 focus:border-blue-500 outline-none"
        />
        <p className="mt-1 text-xs text-grey-600">
          정책 title·target·description 에 포함된 단어로 검색해 매칭 정책 1건 자동 선택.
        </p>
      </label>

      <label className="block">
        <span className="block text-sm font-semibold text-grey-800 mb-1">
          카테고리 (선택)
        </span>
        <select
          name="category"
          className="w-full px-3 py-2 border border-grey-200 rounded-lg text-sm text-grey-900 focus:border-blue-500 outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-grey-600">
          자동 추정: 키워드에 "청년"/"노인" 등 매칭 단어 있으면 자동, 없으면 큐레이션.
        </p>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="min-h-[44px] px-5 text-sm font-semibold rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {pending ? "Claude 글 생성 중... (10~20초)" : "글 생성"}
        </button>
        {error && (
          <p className="text-xs text-red max-w-[400px] leading-[1.4]">⚠️ {error}</p>
        )}
        {success && (
          <p className="text-xs text-blue-600 max-w-[400px] leading-[1.4]">
            ✅ &quot;{success.title}&quot; 발행 완료
            {success.slug && (
              <a
                href={`/blog/${success.slug}`}
                target="_blank"
                rel="noopener"
                className="ml-2 underline"
              >
                보기 →
              </a>
            )}
          </p>
        )}
      </div>
    </form>
  );
}
