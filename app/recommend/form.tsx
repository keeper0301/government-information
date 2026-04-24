"use client";

import { useState } from "react";
import { ProgramRow } from "@/components/program-row";
import type { DisplayProgram } from "@/lib/programs";

// 선택 옵션 목록 (lib/profile-options.ts 단일 소스 import)
import { AGE_OPTIONS, REGION_OPTIONS, OCCUPATION_OPTIONS } from "@/lib/profile-options";

// 프로필 값이 폼의 옵션 목록에 있을 때만 초기값으로 사용
// (readonly tuple 대응)
function pickMatching(value: string | null | undefined, options: readonly string[]): string {
  if (!value) return "";
  return options.includes(value) ? value : "";
}

type RecommendFormProps = {
  // /mypage 에 저장한 프로필 (로그인 안 했거나 프로필 없으면 null)
  initial?: {
    age_group: string | null;
    region: string | null;
    occupation: string | null;
  } | null;
};

export function RecommendForm({ initial }: RecommendFormProps) {
  const [ageGroup, setAgeGroup] = useState(
    pickMatching(initial?.age_group, AGE_OPTIONS),
  );
  const [region, setRegion] = useState(
    pickMatching(initial?.region, REGION_OPTIONS),
  );
  const [occupation, setOccupation] = useState(
    pickMatching(initial?.occupation, OCCUPATION_OPTIONS),
  );
  const [programs, setPrograms] = useState<DisplayProgram[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // 자동 채워진 값이 하나라도 있으면 힌트 배너 표시
  const hasInitialValues = Boolean(ageGroup || region || occupation);

  // 추천받기 버튼 클릭
  async function handleSubmit() {
    if (!ageGroup || !region || !occupation) return;
    setLoading(true);
    setSearched(true);

    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ageGroup, region, occupation }),
      });
      const data = await res.json();
      setPrograms(data.programs || []);
    } catch {
      setPrograms([]);
    } finally {
      setLoading(false);
    }
  }

  // select 스타일
  const selectClass =
    "w-full px-4 py-3 text-[15px] border border-grey-200 rounded-xl outline-none bg-white text-grey-900 font-pretendard focus:border-blue-500 transition-colors appearance-none cursor-pointer";

  return (
    <div>
      {/* 로그인된 사용자의 프로필이 자동 채워진 경우 안내 */}
      {hasInitialValues && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4 text-[14px] text-blue-700 leading-[1.5]">
          <span className="font-semibold">내 정보</span>에 저장된 프로필이 자동으로 채워졌어요.
          필요하면 바꾸고 추천받으세요.
        </div>
      )}

      {/* 입력 폼 */}
      <div className="bg-white border border-grey-100 rounded-2xl p-6 mb-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] max-md:p-5">
        <div className="grid grid-cols-3 gap-4 mb-5 max-md:grid-cols-1">
          {/* 나이대 선택 */}
          <div>
            <label className="block text-[13px] font-semibold text-grey-700 mb-2">
              나이대
            </label>
            <select
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
              className={selectClass}
            >
              <option value="">선택하세요</option>
              {AGE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* 지역 선택 */}
          <div>
            <label className="block text-[13px] font-semibold text-grey-700 mb-2">
              지역
            </label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className={selectClass}
            >
              <option value="">선택하세요</option>
              {REGION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* 직업 선택 */}
          <div>
            <label className="block text-[13px] font-semibold text-grey-700 mb-2">
              직업
            </label>
            <select
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              className={selectClass}
            >
              <option value="">선택하세요</option>
              {OCCUPATION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 추천받기 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={!ageGroup || !region || !occupation || loading}
          className="w-full py-3.5 bg-blue-500 text-white text-[16px] font-bold rounded-xl border-none cursor-pointer disabled:opacity-50 disabled:cursor-default hover:bg-blue-600 transition-colors font-pretendard"
        >
          {loading ? "검색 중..." : "추천받기"}
        </button>
      </div>

      {/* 결과 영역 */}
      {searched && !loading && (
        <div>
          <h2 className="text-[20px] font-bold text-grey-900 mb-4">
            추천 결과 ({programs.length}건)
          </h2>
          {programs.length > 0 ? (
            <div>
              {programs.map((program) => (
                <ProgramRow key={program.id} program={program} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-grey-600 text-[15px]">
              조건에 맞는 정책을 찾지 못했습니다. 다른 조건으로 시도해보세요.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
