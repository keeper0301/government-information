"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "./icons";
import { searchTags } from "@/lib/mock-data";

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
          <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-grey-200 rounded-lg p-1.5 pl-5 max-w-[560px] transition-all focus-within:border-blue-500 focus-within:shadow-[0_0_0_3px_rgba(49,130,246,0.12)]">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(-1);
              }}
              onFocus={() => {
                if (suggestions.length > 0) setShowDropdown(true);
              }}
              onKeyDown={handleKeyDown}
              placeholder="찾고 싶은 복지·대출 정보를 검색하세요"
              className="flex-1 border-none outline-none bg-transparent text-base text-grey-900 font-pretendard min-w-0 placeholder:text-grey-400"
            />
            <button
              type="submit"
              className="shrink-0 px-[22px] py-2.5 bg-blue-500 text-white border-none rounded-md text-[15px] font-semibold font-pretendard cursor-pointer hover:bg-blue-600 transition-colors"
            >
              검색
            </button>
          </div>
        </form>

        {/* 자동완성 드롭다운 */}
        {showDropdown && (
          <div className="absolute top-full left-0 right-0 max-w-[560px] mt-1.5 bg-white border border-grey-200 rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] z-50 overflow-hidden">
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
                    <SearchIcon className="w-4 h-4 text-grey-400 shrink-0" />
                    <span className="text-sm font-medium text-grey-900 truncate flex-1">
                      {item.title}
                    </span>
                    <span
                      className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        item.type === "welfare"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-[#FFF4E6] text-[#E8590C]"
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

      {/* 키워드 칩 */}
      <div className="flex gap-1.5 mt-3.5 flex-wrap">
        {searchTags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => handleTagClick(tag)}
            className="text-[13px] font-medium text-grey-600 bg-grey-50 border border-grey-100 px-3 py-[5px] rounded-full cursor-pointer hover:bg-grey-100 hover:text-grey-800 transition-all"
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}
