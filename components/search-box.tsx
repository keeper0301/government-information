import { SearchIcon } from "./icons";
import { searchTags } from "@/lib/mock-data";

export function SearchBox() {
  return (
    <div>
      <form action="/welfare" method="GET">
        <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-grey-200 rounded-lg p-1.5 pl-5 max-w-[560px] transition-all focus-within:border-blue-500 focus-within:shadow-[0_0_0_3px_rgba(49,130,246,0.12)]">
          <input
            type="text"
            name="q"
            placeholder="찾고 싶은 복지·대출 정보를 검색하세요"
            className="flex-1 border-none outline-none bg-transparent text-base text-grey-900 font-pretendard min-w-0 placeholder:text-grey-400"
          />
          <button type="submit" className="shrink-0 px-[22px] py-2.5 bg-blue-500 text-white border-none rounded-md text-[15px] font-semibold font-pretendard cursor-pointer hover:bg-blue-600 transition-colors">
            검색
          </button>
        </div>
      </form>
      <div className="flex gap-1.5 mt-3.5 flex-wrap">
        {searchTags.map((tag) => (
          <span
            key={tag}
            className="text-[13px] font-medium text-grey-600 bg-grey-50 border border-grey-100 px-3 py-[5px] rounded-full cursor-pointer hover:bg-grey-100 hover:text-grey-800 transition-all"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
