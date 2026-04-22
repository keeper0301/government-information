"use client";

import { useState } from "react";
import { ProgramRow } from "@/components/program-row";
import type { DisplayProgram } from "@/lib/programs";

// 선택 옵션 목록
const AGE_OPTIONS = ["10대", "20대", "30대", "40대", "50대", "60대 이상"];
const REGION_OPTIONS = [
  "전국", "서울", "경기", "인천", "부산", "대구", "광주",
  "대전", "울산", "세종", "강원", "충북", "충남",
  "전북", "전남", "경북", "경남", "제주",
];
const OCCUPATION_OPTIONS = ["대학생", "직장인", "자영업자", "구직자", "주부", "기타"];

export function RecommendForm() {
  const [ageGroup, setAgeGroup] = useState("");
  const [region, setRegion] = useState("");
  const [occupation, setOccupation] = useState("");
  const [programs, setPrograms] = useState<DisplayProgram[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

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
            <div className="text-center py-16 text-grey-500 text-[15px]">
              조건에 맞는 정책을 찾지 못했습니다. 다른 조건으로 시도해보세요.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
