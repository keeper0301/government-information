"use client";

import { useState, useTransition } from "react";
import { uploadCookiesAction, type UploadCookiesResult } from "./actions";

export function CookiesUploadForm() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<UploadCookiesResult | null>(null);

  function onSubmit(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const res = await uploadCookiesAction(formData);
      setResult(res);
    });
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <div>
        <label htmlFor="cookies_json" className="block text-sm font-medium mb-1">
          Cookies JSON
        </label>
        <textarea
          id="cookies_json"
          name="cookies_json"
          rows={10}
          required
          placeholder='[{"name":"NID_AUT","value":"...","domain":".naver.com","path":"/","secure":true,"httpOnly":true,"expires":1780650471},...]'
          className="w-full border border-grey-300 rounded px-3 py-2 font-mono text-xs"
        />
        <p className="text-xs text-grey-600 mt-1">
          배열 그대로 <code>[...]</code> 또는 <code>{"{cookies: [...]}"}</code> 형식 모두 OK.
        </p>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium mb-1">
          메모 (선택)
        </label>
        <input
          id="notes"
          name="notes"
          type="text"
          placeholder="예: 2026-05-12 재로그인 후 export"
          className="w-full border border-grey-300 rounded px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="bg-blue-600 hover:bg-blue-700 disabled:bg-grey-400 text-white font-medium px-5 py-2 rounded transition-colors"
      >
        {pending ? "저장 중..." : "💾 저장"}
      </button>

      {result?.ok && (
        <div className="bg-green-50 border border-green-200 rounded p-3 text-sm">
          ✅ 저장 완료! <strong>{result.cookiesCount}개 cookies</strong> 가 active
          상태로 등록됐어요.
          {result.expiresMin && (
            <p className="mt-1 text-xs text-grey-600">
              가장 빠른 만료: {new Date(result.expiresMin).toLocaleString("ko-KR")}
            </p>
          )}
        </div>
      )}

      {result?.ok === false && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm">
          ❌ <strong>저장 실패:</strong> {result.error}
        </div>
      )}
    </form>
  );
}
