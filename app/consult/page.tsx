"use client";

import { useState, useRef, useEffect } from "react";
import type { DisplayProgram } from "@/lib/programs";

// 챗봇 메시지 타입
type Message = {
  role: "user" | "bot";
  text: string;
  programs?: DisplayProgram[];
};

// 추천 질문 목록
const SUGGESTED_QUESTIONS = [
  "청년 주거 지원",
  "소상공인 대출",
  "의료비 지원",
  "양육 지원",
];

export default function ConsultPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      text: "안녕하세요! AI 정책 상담사입니다.\n\n궁금한 복지·대출 정보를 자유롭게 물어보세요.\n아래 추천 질문을 눌러보셔도 좋아요.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 새 메시지가 추가되면 자동 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 메시지 전송 함수
  async function handleSend(text?: string) {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: data.reply, programs: data.programs },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "오류가 발생했습니다. 다시 시도해주세요." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // 추천 카드 → 신청 가이드 — 해당 정책 ID 로 가이드 모드 호출
  async function handleApplyGuide(program: DisplayProgram) {
    if (loading) return;
    // 사용자 메시지 추가 — 어떤 정책을 물었는지 남겨야 대화 흐름이 자연스러움
    setMessages((prev) => [
      ...prev,
      { role: "user", text: `"${program.title}" 신청 방법 알려줘` },
    ]);
    setLoading(true);

    try {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId: program.id,
          programType: program.type,
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: data.reply, programs: data.programs },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "신청 가이드를 불러오지 못했어요. 다시 시도해주세요." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // 엔터 키로 전송
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <main className="max-w-content mx-auto px-10 pt-[80px] pb-10 max-md:px-5">
      {/* 페이지 제목 */}
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
        AI 정책 상담
      </h1>
      <p className="text-[15px] text-grey-600 mb-6">
        나에게 맞는 복지·대출 정책을 대화로 찾아보세요
      </p>

      {/* 채팅 영역 */}
      <div className="bg-white border border-grey-100 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] flex flex-col h-[calc(100vh-240px)] min-h-[400px]">
        {/* 메시지 목록 */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 max-md:px-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] max-md:max-w-[90%] ${
                  msg.role === "user"
                    ? "bg-blue-500 text-white rounded-2xl rounded-br-md"
                    : "bg-grey-50 text-grey-900 rounded-2xl rounded-bl-md"
                } px-5 py-3.5`}
              >
                <div className="text-[15px] leading-[1.7] whitespace-pre-line">
                  {msg.text}
                </div>
                {/* 추천된 프로그램 카드 목록 */}
                {msg.programs && msg.programs.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {msg.programs.map((p) => (
                      <div
                        key={p.id}
                        className="bg-white rounded-xl p-3.5 border border-grey-100 hover:border-blue-200 transition-colors"
                      >
                        <a
                          href={`/${p.type}/${p.id}`}
                          className="block no-underline text-inherit mb-2"
                        >
                          <div className="text-[14px] font-semibold text-grey-900 mb-1">
                            {p.title}
                          </div>
                          <div className="text-[13px] text-grey-600">
                            {p.amount} · {p.source}
                          </div>
                        </a>
                        <button
                          type="button"
                          onClick={() => handleApplyGuide(p)}
                          disabled={loading}
                          className="text-[12px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md border-none cursor-pointer disabled:opacity-50 disabled:cursor-default transition-colors"
                        >
                          📋 신청 가이드
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-grey-50 text-grey-600 rounded-2xl rounded-bl-md px-5 py-3.5 text-[15px]">
                검색 중...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 추천 질문 버튼 (메시지가 1개일 때만 표시 = 초기 상태) */}
        {messages.length === 1 && (
          <div className="px-6 pb-3 flex flex-wrap gap-2 max-md:px-4">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => handleSend(q)}
                className="px-4 py-2 text-[13px] font-medium bg-blue-50 text-blue-600 rounded-full border-none cursor-pointer hover:bg-blue-100 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* 입력 영역 */}
        <div className="px-6 py-4 border-t border-grey-100 max-md:px-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="궁금한 점을 입력하세요"
              className="flex-1 px-4 py-3 text-[15px] border border-grey-200 rounded-xl outline-none bg-transparent text-grey-900 font-pretendard placeholder:text-grey-400 focus:border-blue-500 transition-colors"
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="shrink-0 px-5 py-3 bg-blue-500 text-white text-[15px] font-semibold rounded-xl border-none cursor-pointer disabled:opacity-50 disabled:cursor-default hover:bg-blue-600 transition-colors font-pretendard"
            >
              전송
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
