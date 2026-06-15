"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_MENU } from "@/lib/admin/menu";

type SearchItem = {
  href: string;
  label: string;
  icon: string;
  group: string;
  description?: string;
};

function buildSearchItems(): SearchItem[] {
  return [
    {
      href: "/admin",
      label: "대시보드",
      icon: "🏠",
      group: "홈",
      description: "오늘 처리할 일과 운영 요약",
    },
    ...ADMIN_MENU.flatMap((group) =>
      group.items.map((item) => ({
        ...item,
        group: group.title,
      })),
    ),
  ];
}

export function CmdKPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const allItems = useMemo(() => buildSearchItems(), []);

  const openPalette = useCallback(() => {
    setQuery("");
    setHighlight(0);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((item) => {
      const haystack = `${item.label} ${item.group} ${item.description ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [allItems, query]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey) && !e.repeat) {
        e.preventDefault();
        if (open) setOpen(false);
        else openPalette();
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("cmdk:open", openPalette);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("cmdk:open", openPalette);
    };
  }, [open, openPalette]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((current) => Math.min(current + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
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
      aria-label="관리자 페이지 검색"
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[15vh]"
    >
      <button
        type="button"
        aria-label="닫기"
        tabIndex={-1}
        onClick={() => setOpen(false)}
        className="absolute inset-0 cursor-default bg-grey-900/40"
      />

      <div className="relative w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-grey-100 px-4 py-3">
          <span aria-hidden className="text-grey-500">
            🔍
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onInputKey}
            placeholder="페이지, 작업, 기능 검색"
            className="flex-1 bg-transparent text-base text-grey-900 outline-none placeholder:text-grey-400"
          />
          <kbd className="rounded border border-grey-200 px-1.5 py-0.5 text-xs text-grey-500">
            ESC
          </kbd>
        </div>

        <ul className="max-h-[60vh] overflow-y-auto py-1">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-grey-500">
              일치하는 페이지가 없습니다.
            </li>
          ) : (
            results.map((item, index) => (
              <li key={item.href}>
                <button
                  type="button"
                  onClick={() => navigate(item.href)}
                  onMouseEnter={() => setHighlight(index)}
                  className={
                    "flex w-full items-start gap-3 px-4 py-3 text-left no-underline " +
                    (index === highlight
                      ? "bg-blue-50 text-blue-600"
                      : "text-grey-800 hover:bg-grey-50")
                  }
                >
                  <span className="mt-0.5 w-6 shrink-0 text-center text-base" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{item.label}</span>
                    {item.description && (
                      <span className="mt-0.5 block truncate text-xs text-grey-600">
                        {item.description}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-grey-500">{item.group}</span>
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="flex items-center justify-end gap-3 border-t border-grey-100 px-4 py-2 text-xs text-grey-500">
          <span>↑↓ 이동</span>
          <span>Enter 선택</span>
        </div>
      </div>
    </div>
  );
}
