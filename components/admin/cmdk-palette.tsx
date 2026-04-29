"use client";

// ============================================================
// 어드민 명령 팔레트 — Ctrl/Cmd+K 빠른 검색·이동
// ============================================================
// 사이드바 18 페이지 + 대시보드를 한 번에 검색·이동. 키보드 우선.
//   · Ctrl+K (Win) / ⌘+K (Mac) — 토글 (아무 페이지에서도 동작)
//   · ↑ ↓                       — 결과 navigate
//   · Enter                     — 선택 이동
//   · Esc                       — 닫기 (또는 input 비어있을 때 한 번 더)
// 검색 매칭: query 가 라벨·그룹명에 부분 포함되면 결과. 대소문자 무시.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_MENU } from "@/lib/admin/menu";

// 검색 가능한 평탄 항목 — 그룹명까지 표시해 위치 인지 도움
type SearchItem = {
  href: string;
  label: string;
  icon: string;
  group: string;
};

// ADMIN_MENU 평탄화 + 대시보드 (그룹 외) 추가
function buildSearchItems(): SearchItem[] {
  const items: SearchItem[] = [
    { href: "/admin", label: "대시보드", icon: "🏠", group: "홈" },
  ];
  for (const group of ADMIN_MENU) {
    for (const it of group.items) {
      items.push({ ...it, group: group.title });
    }
  }
  return items;
}

export function CmdKPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 검색 데이터는 한 번만 빌드 (ADMIN_MENU 정적)
  const allItems = useMemo(() => buildSearchItems(), []);

  // 부분 매칭 — query 비어있으면 전체 표시 (사이드바 대용 빠른 보기)
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((it) => {
      const hay = `${it.label} ${it.group}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allItems, query]);

  // 글로벌 키보드 listener — 페이지 어디서든 Ctrl/Cmd+K 동작
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ctrl+K (Win) 또는 ⌘+K (Mac) — modal 토글.
      // e.repeat 무시: 키 길게 눌러서 setOpen 이 폭주하지 않도록 첫 누름만 처리.
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey) && !e.repeat) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // ESC — modal 닫음 (modal 외 영역에선 무시)
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    // 사이드바 등 다른 client 컴포넌트가 모달을 열고 싶을 때 dispatch 하는 커스텀 이벤트
    function onExternalOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("cmdk:open", onExternalOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("cmdk:open", onExternalOpen);
    };
  }, [open]);

  // modal 열린 동안 body scroll lock — 뒤 문서가 휠로 움직이지 않도록.
  // CmdK 가 사라지면 원복.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // modal 열릴 때 input focus + 상태 초기화
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      inputRef.current?.focus();
    }
  }, [open]);

  // query 변하면 highlight 리셋 (첫 결과 가리키도록)
  useEffect(() => {
    setHighlight(0);
  }, [query]);

  // 선택 → 이동 + 닫기
  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  // input 안 키보드 — ↑↓ Enter
  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[highlight];
      if (target) navigate(target.href);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="어드민 명령 팔레트"
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4"
    >
      {/* 백드롭 — 클릭으로 닫기. tabIndex={-1} 로 Tab 순환에서 제외해서
          input → 결과 버튼 → 풋터 자연스러운 keyboard 흐름 보장. */}
      <button
        type="button"
        aria-label="닫기"
        tabIndex={-1}
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-grey-900/40 cursor-default"
      />

      {/* 다이얼로그 본체 */}
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden">
        {/* 검색 input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-grey-100">
          <span aria-hidden className="text-grey-400">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="페이지 검색 — 예: 헬스, 알림톡, 블로그"
            className="flex-1 outline-none text-base text-grey-900 placeholder:text-grey-400"
          />
          <kbd className="text-xs text-grey-500 px-1.5 py-0.5 border border-grey-200 rounded">
            ESC
          </kbd>
        </div>

        {/* 결과 리스트 — 검색 결과 없을 때 안내 */}
        <ul className="max-h-[60vh] overflow-y-auto py-1">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-sm text-grey-500 text-center">
              일치하는 페이지 없음
            </li>
          ) : (
            results.map((it, i) => (
              <li key={it.href}>
                <button
                  type="button"
                  onClick={() => navigate(it.href)}
                  onMouseEnter={() => setHighlight(i)}
                  className={
                    "w-full flex items-center gap-3 px-4 py-2.5 text-left no-underline " +
                    (i === highlight
                      ? "bg-blue-50 text-blue-600"
                      : "text-grey-800 hover:bg-grey-50")
                  }
                >
                  <span aria-hidden>{it.icon}</span>
                  <span className="flex-1 text-sm font-semibold">
                    {it.label}
                  </span>
                  <span className="text-xs text-grey-400">{it.group}</span>
                </button>
              </li>
            ))
          )}
        </ul>

        {/* 풋터 hint — 키보드 단축키 안내 */}
        <div className="flex items-center justify-end gap-3 px-4 py-2 border-t border-grey-100 text-xs text-grey-500">
          <span>
            <kbd className="px-1 border border-grey-200 rounded">↑</kbd>{" "}
            <kbd className="px-1 border border-grey-200 rounded">↓</kbd> 이동
          </span>
          <span>
            <kbd className="px-1 border border-grey-200 rounded">↵</kbd> 선택
          </span>
        </div>
      </div>
    </div>
  );
}
