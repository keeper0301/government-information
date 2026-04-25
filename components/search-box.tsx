"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "./icons";
import { searchTags } from "@/lib/mock-data";

// 검색박스 placeholder 자동 회전 — 사용자가 어떤 검색을 할 수 있는지
// 학습시키며 첫 화면에 활동감을 줌. 사용자가 input 에 focus 하거나
// 입력 시작하면 자동 정지 (방해 X).
const PLACEHOLDER_KEYWORDS = [
  "청년월세 지원",
  "소상공인 대출",
  "출산 지원금",
  "기초생활 수급",
  "노인 의료비",
  "신혼부부 전세자금",
  "학자금 대출",
];

// 자동완성 결과 타입
type SuggestItem = {
  id: string;
  title: string;
  type: "welfare" | "loan";
  category: string;
};

export function SearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // placeholder 키워드 회전 — 3.2초 주기. focus·query 있으면 정지.
  const [phIndex, setPhIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  useEffect(() => {
    if (isFocused || query) return;
    const interval = setInterval(() => {
      setPhIndex((i) => (i + 1) % PLACEHOLDER_KEYWORDS.length);
    }, 3200);
    return () => clearInterval(interval);
  }, [isFocused, query]);

  // 검색 실행 (복지 페이지로 이동)
  const handleSearch = (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setShowDropdown(false);
    router.push(`/welfare?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  // 폼 제출
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  // 키워드 칩 클릭
  const handleTagClick = (tag: string) => {
    setQuery(tag);
    handleSearch(tag);
  };

  // 자동완성 API 호출 (디바운스 300ms)
  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.results?.slice(0, 5) || []);
          setShowDropdown(true);
        }
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 키보드 네비게이션 (화살표 위/아래, Enter)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const item = suggestions[activeIndex];
      router.push(`/${item.type}/${item.id}`);
      setShowDropdown(false);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  return (
    <div>
      {/* 검색 폼 */}
      <div className="relative" ref={dropdownRef}>
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-grey-200 rounded-2xl p-2 pl-6 max-w-[600px] transition-all focus-within:border-blue-500 focus-within:shadow-[0_0_0_4px_rgba(49,130,246,0.16)]">
            {/* input + 가짜 placeholder div 오버레이 — placeholder 회전 시
                fade 효과 주기 위해. native placeholder 는 transition 불가. */}
            <div className="relative flex-1 min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(-1);
                }}
                onFocus={() => {
                  setIsFocused(true);
                  if (suggestions.length > 0) setShowDropdown(true);
                }}
                onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown}
                className="w-full border-none outline-none bg-transparent text-[17px] text-grey-900 font-pretendard min-w-0"
              />
              {/* 가짜 placeholder — input 비고 focus 안된 상태일 때만 표시.
                  key 가 phIndex 따라 변하므로 React 가 새로 mount 하면서
                  .placeholder-fade 애니메이션 재생. */}
              {!query && !isFocused && (
                <div
                  key={phIndex}
                  className="placeholder-fade pointer-events-none absolute inset-y-0 left-0 flex items-center text-[17px] text-grey-400"
                >
                  예: {PLACEHOLDER_KEYWORDS[phIndex]}
                </div>
              )}
            </div>
            <button
              type="submit"
              className="shrink-0 h-11 px-6 bg-blue-500 text-white border-none rounded-xl text-[15px] font-bold font-pretendard cursor-pointer hover:bg-blue-600 active:scale-[0.98] transition-all shadow-blue-glow"
            >
              검색
            </button>
          </div>
        </form>

        {/* 자동완성 드롭다운 */}
        {showDropdown && (
          <div className="absolute top-full left-0 right-0 max-w-[600px] mt-2 bg-white border border-grey-100 rounded-2xl shadow-xl z-50 overflow-hidden">
            {loading ? (
              <div className="px-5 py-4 text-sm text-grey-600">검색 중...</div>
            ) : suggestions.length > 0 ? (
              <>
                {suggestions.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      router.push(`/${item.type}/${item.id}`);
                      setShowDropdown(false);
                    }}
                    className={`w-full text-left px-5 py-3 flex items-center gap-3 transition-colors border-none cursor-pointer ${
                      index === activeIndex ? "bg-grey-50" : "bg-white hover:bg-grey-50"
                    }`}
                  >
                    <SearchIcon className="w-4 h-4 text-grey-500 shrink-0" />
                    <span className="text-sm font-medium text-grey-900 truncate flex-1">
                      {item.title}
                    </span>
                    <span
                      className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        item.type === "welfare"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-[#FFF3E0] text-[#FB8800]"
                      }`}
                    >
                      {item.type === "welfare" ? "복지" : "대출"}
                    </span>
                  </button>
                ))}
                {/* 전체 검색 결과 보기 */}
                <button
                  type="button"
                  onClick={() => handleSearch(query)}
                  className="w-full text-center px-5 py-3 text-sm font-medium text-blue-500 bg-grey-50 border-none border-t border-grey-100 cursor-pointer hover:bg-grey-100 transition-colors"
                >
                  &quot;{query}&quot; 전체 검색 결과 보기
                </button>
              </>
            ) : (
              <div className="px-5 py-4 text-sm text-grey-600">
                검색 결과가 없습니다
              </div>
            )}
          </div>
        )}
      </div>

      {/* 키워드 칩 — 토스 풍 알약 (border 제거, hover 시 blue 톤으로 전환) */}
      <div className="flex gap-2 mt-4 flex-wrap">
        {searchTags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => handleTagClick(tag)}
            className="text-[13px] font-semibold text-grey-700 bg-grey-100 border-0 px-3.5 py-1.5 max-md:px-4 max-md:py-3 rounded-full cursor-pointer hover:bg-blue-50 hover:text-blue-700 transition-colors"
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}
