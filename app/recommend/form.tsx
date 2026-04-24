"use client";

import { useState } from "react";
import { ProgramRow } from "@/components/program-row";
import type { DisplayProgram } from "@/lib/programs";
import { AGE_OPTIONS, REGION_OPTIONS, OCCUPATION_OPTIONS } from "@/lib/profile-options";

// 프로필 값이 폼 옵션 목록에 있을 때만 초기값으로 사용
function pickMatching(value: string | null | undefined, options: readonly string[]): string {
  if (!value) return "";
  return options.includes(value) ? value : "";
}

type Props = {
  // /mypage 에 저장된 프로필 (비로그인 / 프로필 없음 → null)
  initial?: {
    age_group: string | null;
    region: string | null;
    occupation: string | null;
  } | null;
  // 서버에서 미리 계산한 추천 결과 (프로필 완비 시에만 존재)
  initialPrograms?: DisplayProgram[] | null;
};

// 맞춤추천 폼 — 실용성 위주로 재구성
// - 초기 결과 있으면 폼 접고 결과를 바로 보여줌 (사용자 클릭 불필요)
// - "조건 변경" 버튼으로 폼 펼치기 → 추천받기 → 다시 접힘
// - 결과 0건 시 "전국으로 확대해보기" 원클릭 폴백 제공
export function RecommendForm({ initial, initialPrograms }: Props) {
  const [ageGroup, setAgeGroup] = useState(
    pickMatching(initial?.age_group, AGE_OPTIONS),
  );
  const [region, setRegion] = useState(
    pickMatching(initial?.region, REGION_OPTIONS),
  );
  const [occupation, setOccupation] = useState(
    pickMatching(initial?.occupation, OCCUPATION_OPTIONS),
  );
  const [programs, setPrograms] = useState<DisplayProgram[]>(initialPrograms ?? []);
  const [loading, setLoading] = useState(false);

  // 서버에서 초기 결과를 받았으면 → 결과 모드로 시작 (폼 접힘), 아니면 → 편집 모드
  const hasInitialResults = (initialPrograms?.length ?? 0) > 0;
  const hasValidInitial = Boolean(ageGroup && region && occupation);
  const [editing, setEditing] = useState(!(hasInitialResults && hasValidInitial));

  // 한 번이라도 검색 결과를 받아본 적 있는지 (빈 결과 UX 분기용)
  const [hasSearched, setHasSearched] = useState(
    initialPrograms !== null && initialPrograms !== undefined,
  );

  // 재검색 수행 (override 로 특정 필드 값을 덮어씀 — "전국 확대" 폴백용)
  async function runSearch(override?: { region?: string }) {
    const eff = {
      ageGroup,
      region: override?.region ?? region,
      occupation,
    };
    if (!eff.ageGroup || !eff.region || !eff.occupation) return;

    // override 로 바뀐 값은 UI state 에도 즉시 반영 (다음 렌더에 칩 업데이트)
    if (override?.region && override.region !== region) setRegion(override.region);

    setLoading(true);
    setHasSearched(true);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eff),
      });
      const data = await res.json();
      setPrograms(data.programs || []);
      setEditing(false); // 결과 받으면 폼 접기
    } catch {
      setPrograms([]);
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = Boolean(ageGroup && region && occupation) && !loading;

  const selectClass =
    "w-full px-4 py-3 text-[15px] border border-grey-200 rounded-xl outline-none bg-white text-grey-900 font-pretendard focus:border-blue-500 transition-colors appearance-none cursor-pointer";

  return (
    <div>
      {/* ─── 상단: 편집 모드면 폼, 아니면 조건 요약 칩 ─── */}
      {editing ? (
        <EditPanel
          ageGroup={ageGroup}
          region={region}
          occupation={occupation}
          onAgeChange={setAgeGroup}
          onRegionChange={setRegion}
          onOccupationChange={setOccupation}
          onSubmit={() => runSearch()}
          // 초기 결과가 있고 필드가 유효할 때만 "취소" 로 결과로 돌아가기 가능
          onCancel={
            hasInitialResults && hasValidInitial ? () => setEditing(false) : undefined
          }
          canSubmit={canSubmit}
          loading={loading}
          selectClass={selectClass}
        />
      ) : (
        <SummaryChip
          ageGroup={ageGroup}
          region={region}
          occupation={occupation}
          onEdit={() => setEditing(true)}
        />
      )}

      {/* ─── 결과 영역 ─── */}
      {loading ? (
        <SkeletonList />
      ) : hasSearched ? (
        programs.length > 0 ? (
          <div>
            <h2 className="text-[20px] font-bold text-grey-900 mb-4">
              추천 결과{" "}
              <span className="text-grey-500 font-medium text-[16px]">
                ({programs.length}건)
              </span>
            </h2>
            <div>
              {programs.map((program) => (
                <ProgramRow key={program.id} program={program} />
              ))}
            </div>
          </div>
        ) : (
          <EmptyResult
            canExpandRegion={region !== "전국"}
            onExpandRegion={() => runSearch({ region: "전국" })}
            onEdit={() => setEditing(true)}
          />
        )
      ) : (
        // 첫 진입 + 프로필 미완비 안내
        !hasValidInitial && (
          <div className="py-12 text-center text-grey-500 text-[14px]">
            나이대·지역·직업 3가지를 선택하고 추천을 받아보세요.
          </div>
        )
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 현재 조건 요약 칩 (편집 아닌 상태에서 노출)
// ─────────────────────────────────────────────────────────────
function SummaryChip({
  ageGroup,
  region,
  occupation,
  onEdit,
}: {
  ageGroup: string;
  region: string;
  occupation: string;
  onEdit: () => void;
}) {
  return (
    <div className="bg-white border border-grey-100 rounded-2xl p-4 mb-6 flex items-center justify-between gap-3 shadow-[0_1px_4px_rgba(0,0,0,0.03)] max-md:flex-col max-md:items-start">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span className="text-[13px] font-semibold text-grey-500 mr-1 shrink-0">
          내 조건
        </span>
        <Chip>{ageGroup}</Chip>
        <Chip>{region}</Chip>
        <Chip>{occupation}</Chip>
      </div>
      <button
        onClick={onEdit}
        className="shrink-0 px-4 py-2 text-[13px] font-semibold text-blue-700 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer max-md:w-full"
      >
        조건 변경
      </button>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 py-1.5 bg-grey-50 border border-grey-200 rounded-full text-[13px] font-semibold text-grey-800">
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// 편집 모드 — 3개 select + 추천받기 / 취소
// ─────────────────────────────────────────────────────────────
function EditPanel({
  ageGroup,
  region,
  occupation,
  onAgeChange,
  onRegionChange,
  onOccupationChange,
  onSubmit,
  onCancel,
  canSubmit,
  loading,
  selectClass,
}: {
  ageGroup: string;
  region: string;
  occupation: string;
  onAgeChange: (v: string) => void;
  onRegionChange: (v: string) => void;
  onOccupationChange: (v: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  canSubmit: boolean;
  loading: boolean;
  selectClass: string;
}) {
  return (
    <div className="bg-white border border-grey-100 rounded-2xl p-6 mb-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] max-md:p-5">
      <div className="grid grid-cols-3 gap-4 mb-5 max-md:grid-cols-1">
        <Field label="나이대">
          <select
            value={ageGroup}
            onChange={(e) => onAgeChange(e.target.value)}
            className={selectClass}
          >
            <option value="">선택하세요</option>
            {AGE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </Field>
        <Field label="지역">
          <select
            value={region}
            onChange={(e) => onRegionChange(e.target.value)}
            className={selectClass}
          >
            <option value="">선택하세요</option>
            {REGION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </Field>
        <Field label="직업">
          <select
            value={occupation}
            onChange={(e) => onOccupationChange(e.target.value)}
            className={selectClass}
          >
            <option value="">선택하세요</option>
            {OCCUPATION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex gap-3 max-md:flex-col-reverse">
        {onCancel && (
          <button
            onClick={onCancel}
            className="shrink-0 px-6 py-3.5 bg-white text-grey-700 text-[15px] font-semibold rounded-xl border border-grey-200 hover:bg-grey-50 transition-colors cursor-pointer max-md:w-full"
          >
            취소
          </button>
        )}
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="flex-1 py-3.5 bg-blue-500 text-white text-[16px] font-bold rounded-xl border-none cursor-pointer disabled:opacity-50 disabled:cursor-default hover:bg-blue-600 transition-colors font-pretendard"
        >
          {loading ? "검색 중..." : "추천받기"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-semibold text-grey-700 mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 결과 0건 빈 상태 — "전국 확대" 원클릭 폴백 제공
// ─────────────────────────────────────────────────────────────
function EmptyResult({
  canExpandRegion,
  onExpandRegion,
  onEdit,
}: {
  canExpandRegion: boolean;
  onExpandRegion: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="text-center py-16 px-6 bg-white border border-grey-100 rounded-2xl">
      <div className="text-[40px] mb-3" aria-hidden="true">
        🔍
      </div>
      <h3 className="text-[17px] font-bold text-grey-900 mb-2">
        조건에 맞는 공고를 찾지 못했어요
      </h3>
      <p className="text-[14px] text-grey-500 mb-6 leading-[1.6]">
        해당 지역에 올라온 공고가 적을 수 있어요.
        <br />
        지역을 넓혀보거나 다른 조건으로 다시 시도해보세요.
      </p>
      <div className="flex gap-2 justify-center max-md:flex-col max-md:items-stretch">
        {canExpandRegion && (
          <button
            onClick={onExpandRegion}
            className="px-5 py-3 bg-blue-500 text-white text-[14px] font-semibold rounded-lg hover:bg-blue-600 transition-colors cursor-pointer"
          >
            지역을 &apos;전국&apos;으로 확대해보기
          </button>
        )}
        <button
          onClick={onEdit}
          className="px-5 py-3 bg-white text-grey-800 text-[14px] font-semibold border border-grey-200 rounded-lg hover:bg-grey-50 transition-colors cursor-pointer"
        >
          조건 바꿔보기
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 로딩 스켈레톤 — 검색 중 레이아웃 깜빡임 방지
// ─────────────────────────────────────────────────────────────
function SkeletonList() {
  return (
    <div>
      <h2 className="text-[20px] font-bold text-grey-900 mb-4">추천 결과</h2>
      <div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 py-4 border-b border-grey-100 animate-pulse"
          >
            <div className="w-10 h-10 rounded-lg bg-grey-100 shrink-0" />
            <div className="flex-1">
              <div className="h-4 bg-grey-100 rounded w-3/4 mb-2" />
              <div className="h-3 bg-grey-100 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
