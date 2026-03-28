import { ChatIcon } from "./icons";

export function ChatbotFab() {
  return (
    <button
      className="fixed bottom-7 right-7 z-40 w-[54px] h-[54px] bg-grey-900 rounded-full grid place-items-center cursor-pointer shadow-[0_2px_12px_rgba(0,0,0,0.15)] transition-all duration-200 hover:scale-[1.06] hover:shadow-[0_4px_20px_rgba(0,0,0,0.2)] border-none"
      aria-label="챗봇 열기"
    >
      <ChatIcon className="w-[22px] h-[22px] text-white" />
    </button>
  );
}
