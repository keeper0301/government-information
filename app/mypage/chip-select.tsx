"use client";

// ChipSelect — 단일 선택 칩 그룹.
// 마이페이지 프로필 폼의 나이대·지역·시군구·직업 같은 단일 선택 항목에서 재사용.
export function ChipSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[13px] font-semibold text-grey-700 mb-2">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`px-3.5 py-2 rounded-full text-[14px] font-medium border transition-colors cursor-pointer ${
                selected
                  ? "bg-blue-500 text-white border-blue-500"
                  : "bg-white text-grey-700 border-grey-200 hover:bg-grey-50"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
