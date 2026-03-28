"use client";

import { useState } from "react";

type Props = {
  programId: string;
  programType: "welfare" | "loan";
};

export function AlarmButton({ programId, programType }: Props) {
  const [email, setEmail] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");

    try {
      const res = await fetch("/api/alarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, programId, programType }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        setMessage(data.message);
      } else {
        setStatus("error");
        setMessage(data.error || "오류가 발생했습니다.");
      }
    } catch {
      setStatus("error");
      setMessage("네트워크 오류가 발생했습니다.");
    }
  }

  if (status === "success") {
    return (
      <div className="px-6 py-3 bg-blue-50 text-blue-600 text-[15px] font-medium rounded-xl">
        {message}
      </div>
    );
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="px-6 py-3 bg-grey-100 text-grey-700 text-[15px] font-semibold rounded-xl border-none cursor-pointer hover:bg-grey-200 transition-colors font-pretendard"
      >
        알림 받기
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="이메일 주소"
        required
        className="px-4 py-3 border-[1.5px] border-grey-200 rounded-xl text-[15px] text-grey-900 font-pretendard outline-none focus:border-blue-500 transition-colors placeholder:text-grey-400 w-[240px]"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="px-5 py-3 bg-blue-500 text-white text-[15px] font-semibold rounded-xl border-none cursor-pointer hover:bg-blue-600 transition-colors font-pretendard disabled:opacity-50"
      >
        {status === "loading" ? "등록 중..." : "등록"}
      </button>
      {status === "error" && <span className="text-sm text-red">{message}</span>}
    </form>
  );
}
