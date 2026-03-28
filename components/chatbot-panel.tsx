"use client";

import { useState, useRef, useEffect } from "react";
import { ChatIcon } from "./icons";
import type { DisplayProgram } from "@/lib/programs";

type Message = {
  role: "user" | "bot";
  text: string;
  programs?: DisplayProgram[];
};

export function ChatbotPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "bot", text: "안녕하세요! 궁금한 복지·대출 정보를 물어보세요.\n\n예: '청년 주거 지원', '소상공인 대출', '의료비 지원'" },
  ]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const msg = input.trim();
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
      setMessages((prev) => [...prev, { role: "bot", text: data.reply, programs: data.programs }]);
    } catch {
      setMessages((prev) => [...prev, { role: "bot", text: "오류가 발생했습니다. 다시 시도해주세요." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-7 right-7 z-50 w-[54px] h-[54px] bg-grey-900 rounded-full grid place-items-center cursor-pointer shadow-[0_2px_12px_rgba(0,0,0,0.15)] transition-all duration-200 hover:scale-[1.06] hover:shadow-[0_4px_20px_rgba(0,0,0,0.2)] border-none"
        aria-label={open ? "챗봇 닫기" : "챗봇 열기"}
      >
        {open ? (
          <svg className="w-[22px] h-[22px] text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <ChatIcon className="w-[22px] h-[22px] text-white" />
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-7 z-50 w-[380px] h-[520px] bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-grey-100 flex flex-col overflow-hidden max-md:w-[calc(100vw-32px)] max-md:right-4 max-md:bottom-24 max-md:h-[60vh]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-grey-100">
            <div className="text-[16px] font-bold text-grey-900">정책알리미 챗봇</div>
            <div className="text-[13px] text-grey-500">복지·대출 정보를 물어보세요</div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] ${msg.role === "user" ? "bg-blue-500 text-white rounded-2xl rounded-br-md" : "bg-grey-50 text-grey-900 rounded-2xl rounded-bl-md"} px-4 py-3`}>
                  <div className="text-[14px] leading-[1.6] whitespace-pre-line">{msg.text}</div>
                  {msg.programs && msg.programs.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {msg.programs.map((p) => (
                        <a
                          key={p.id}
                          href={`/${p.type}/${p.id}`}
                          className="block bg-white rounded-xl p-3 no-underline text-inherit border border-grey-100 hover:border-blue-200 transition-colors"
                        >
                          <div className="text-[13px] font-semibold text-grey-900 mb-1">{p.title}</div>
                          <div className="text-[12px] text-grey-500">{p.amount} · {p.source}</div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-grey-50 text-grey-500 rounded-2xl rounded-bl-md px-4 py-3 text-[14px]">
                  검색 중...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-grey-100">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="궁금한 점을 입력하세요"
                className="flex-1 px-3 py-2.5 text-[14px] border border-grey-200 rounded-xl outline-none bg-transparent text-grey-900 font-pretendard placeholder:text-grey-400 focus:border-blue-500 transition-colors"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="shrink-0 px-4 py-2.5 bg-blue-500 text-white text-[14px] font-semibold rounded-xl border-none cursor-pointer disabled:opacity-50 disabled:cursor-default hover:bg-blue-600 transition-colors font-pretendard"
              >
                전송
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
