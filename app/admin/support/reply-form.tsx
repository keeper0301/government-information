// /admin/support 의 답변 입력 폼 — server action 으로 reply + status='replied' update.
// 클라이언트 컴포넌트 (form 인터랙션). server action 은 별도 파일.

"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { submitSupportReply } from "./actions";

export function SupportReplyForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const reply = (formData.get("reply") ?? "").toString().trim();
    if (reply.length < 10) {
      setError("답변은 10자 이상 입력해 주세요.");
      return;
    }
    startTransition(async () => {
      const result = await submitSupportReply({ ticketId, reply });
      if (!result.ok) {
        setError(result.error ?? "답변 저장 실패");
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-2">
      <textarea
        name="reply"
        rows={4}
        maxLength={2000}
        placeholder="답변 내용을 입력하세요 (10~2000자). 저장 시 status=replied 로 변경됩니다."
        className="w-full px-3 py-2 border border-grey-200 rounded-lg text-sm text-grey-900 focus:border-blue-500 outline-none"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="min-h-[40px] px-4 text-sm font-semibold rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {pending ? "저장 중..." : "답변 저장"}
        </button>
        {error && <span className="text-xs text-red">{error}</span>}
      </div>
    </form>
  );
}
