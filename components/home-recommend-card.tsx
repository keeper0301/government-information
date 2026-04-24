"use client";

import { useState } from "react";
import { ProgramRow } from "@/components/program-row";
import type { DisplayProgram } from "@/lib/programs";

const AGE_OPTIONS = ["10대", "20대", "30대", "40대", "50대", "60대 이상"];
// 지역: Progressive Disclosure — 인기 4개를 기본, 나머지 14개는 확장 시
const POPULAR_REGIONS = ["전국", "서울", "경기", "인천"];
const OTHER_REGIONS = [
  "부산", "대구", "광주", "대전", "울산", "세종",
  "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];
const ALL_REGIONS = [...POPULAR_REGIONS, ...OTHER_REGIONS];
const OCCUPATION_OPTIONS = ["대학생", "직장인", "자영업자", "구직자", "주부", "기타"];
const PROGRAM_TYPES = ["전체", "복지정보", "대출정보"]; // 기본 "전체" 선택, 3개는 필수 선택
const toApiType = (s: string) => s === "복지정보" ? "welfare" : s === "대출정보" ? "loan" : "all";
const HOME_RESULT_LIMIT = 5;

function pickMatching(value: string | null | undefined, options: string[]): string {
  if (!value) return "";
  return options.includes(value) ? value : "";
}

type Props = {
  initial?: {
    age_group: string | null;
    region: string | null;
    occupation: string | null;
  } | null;
};

// 홈 맞춤 추천 카드 — Hero 오른쪽에 배치되는 경량 카드
// 원칙: 절제된 위계 · 대화형 카피 · Progressive Disclosure
export function HomeRecommendCard({ initial }: Props) {
  const [ageGroup, setAgeGroup] = useState(pickMatching(initial?.age_group, AGE_OPTIONS));
  const [region, setRegion] = useState(pickMatching(initial?.region, ALL_REGIONS));
  const [occupation, setOccupation] = useState(pickMatching(initial?.occupation, OCCUPATION_OPTIONS));
  const [programType, setProgramType] = useState<string>("전체");
  const [programs, setPrograms] = useState<DisplayProgram[]>([]);
  const [totalFound, setTotalFound] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [regionExpanded, setRegionExpanded] = useState(
    Boolean(region && !POPULAR_REGIONS.includes(region)),
  );

  const canSubmit = Boolean(ageGroup && region && occupation);
  const autoFilled = Boolean(ageGroup || region || occupation);
  const visibleRegions = regionExpanded ? ALL_REGIONS : POPULAR_REGIONS;

  // 3필드 중 몇 개 입력됐는지 — 진행 표시 + 버튼 라벨에 사용
  const completedCount = [ageGroup, region, occupation].filter(Boolean).length;
  const missingLabels = [
    !ageGroup && "나이",
    !region && "지역",
    !occupation && "직업",
  ].filter(Boolean) as string[];
  const submitLabel = canSubmit
    ? "내가 받을 수 있는 건 뭘까"
    : `${missingLabels.join(" · ")} 골라주세요`;

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ageGroup, region, occupation, programType: toApiType(programType) }),
      });
      const data = await res.json();
      const all: DisplayProgram[] = data.programs || [];
      setTotalFound(all.length);
      setPrograms(all.slice(0, HOME_RESULT_LIMIT));
    } catch {
      setPrograms([]);
      setTotalFound(0);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      {/* 입력 카드 — 얇은 테두리 + 흰 배경 */}
      <div className="bg-white border border-grey-100 rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        {/* 카드 내부 헤더 + 진행 카운터 */}
        <div className="mb-5">
          <div className="flex items-baseline justify-between mb-0.5">
            <h2 className="text-[17px] font-bold tracking-[-0.3px] text-grey-900">
              나에게 맞는 정책 찾기
            </h2>
            <span
              className={`text-[12px] font-bold tabular-nums ${
                completedCount === 3 ? "text-blue-500" : "text-grey-400"
              }`}
              aria-label={`${completedCount}개 중 3개 입력 완료`}
            >
              {completedCount}/3
            </span>
          </div>
          <p className="text-[13px] text-grey-500 leading-[1.5]">
            3가지만 고르면 30초 안에 보여드려요
            {autoFilled && !searched && (
              <span className="text-blue-500 font-medium"> · 내 정보에서 불러왔어요</span>
            )}
          </p>
        </div>

        {/* 필터: 찾는 정보 (전체/복지/대출) — 기본 "전체" 선택 상태라 번호 제외 */}
        <Field label="찾는 정보">
          {PROGRAM_TYPES.map((opt) => (
            <Chip key={opt} label={opt} selected={programType === opt} onClick={() => setProgramType(opt)} />
          ))}
        </Field>

        {/* 질문 1: 나이 */}
        <Field label="나이대" step={1} completed={!!ageGroup}>
          {AGE_OPTIONS.map((opt) => (
            <Chip key={opt} label={opt} selected={ageGroup === opt} onClick={() => setAgeGroup(opt)} />
          ))}
        </Field>

        {/* 질문 2: 지역 — Progressive Disclosure */}
        <Field label="거주 지역" step={2} completed={!!region}>
          {visibleRegions.map((opt) => (
            <Chip key={opt} label={opt} selected={region === opt} onClick={() => setRegion(opt)} />
          ))}
          {!regionExpanded && (
            <button
              type="button"
              onClick={() => setRegionExpanded(true)}
              className="min-h-[36px] px-3 text-[13px] font-medium rounded-full border-none bg-transparent text-grey-500 hover:text-grey-700 hover:bg-grey-50 cursor-pointer transition-colors"
            >
              + 다른 지역 ({OTHER_REGIONS.length})
            </button>
          )}
        </Field>

        {/* 질문 3: 직업 */}
        <Field label="하시는 일" step={3} completed={!!occupation} last>
          {OCCUPATION_OPTIONS.map((opt) => (
            <Chip key={opt} label={opt} selected={occupation === opt} onClick={() => setOccupation(opt)} />
          ))}
        </Field>

        {/* CTA */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          className={`group w-full min-h-[52px] text-[15px] font-bold rounded-xl border-none cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
            canSubmit && !loading
              ? "bg-blue-500 text-white hover:bg-blue-600 shadow-[0_2px_8px_rgba(49,130,246,0.25)]"
              : "bg-grey-100 text-grey-400 cursor-not-allowed"
          }`}
        >
          {loading ? "지금 찾고 있어요" : canSubmit ? (
            <>
              {submitLabel}
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </>
          ) : (
            submitLabel
          )}
        </button>
      </div>

      {/* 결과 영역 */}
      {searched && !loading && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between mb-2.5">
            <h3 className="text-[14px] font-bold text-grey-900">추천 결과</h3>
            {totalFound > 0 && <span className="text-[12px] font-semibold text-blue-500">{totalFound}건</span>}
          </div>
          {programs.length > 0 ? (
            <>
              <div>{programs.map((p) => <ProgramRow key={p.id} program={p} />)}</div>
              {totalFound > HOME_RESULT_LIMIT && (
                <a href="/recommend" className="mt-2 flex items-center justify-center gap-1 w-full py-2.5 text-[13px] font-semibold text-grey-700 bg-grey-50 rounded-lg no-underline hover:bg-grey-100 transition-colors">
                  더 많은 추천 보기 <span className="text-grey-400">({totalFound - HOME_RESULT_LIMIT}건)</span>
                </a>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-grey-100 bg-grey-50 p-5 text-center">
              <div className="text-[14px] font-semibold text-grey-900 mb-1">딱 맞는 정책이 아직 없어요</div>
              <p className="text-[12px] text-grey-500 leading-[1.5]">새 공고가 올라오면 알려드릴 수 있어요</p>
              <a href="/alerts" className="inline-block mt-3 px-4 py-2 text-[13px] font-semibold text-blue-500 bg-white border border-blue-100 rounded-lg no-underline hover:bg-blue-50 transition-colors">
                알림 설정하기
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 질문 블록 (라벨 + 칩 목록)
// step: 있으면 라벨 앞에 번호 배지 표시 (진행감 부여).
// completed: 해당 필드가 채워졌는지 — 배지 색상 파랑/회색 전환.
function Field({
  label,
  step,
  completed,
  last,
  children,
}: {
  label: string;
  step?: number;
  completed?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={last ? "mb-5" : "mb-4"}>
      <div className="flex items-center gap-1.5 mb-2">
        {step !== undefined && (
          <span
            aria-hidden="true"
            className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[10px] font-bold transition-colors ${
              completed
                ? "bg-blue-500 text-white"
                : "bg-grey-100 text-grey-500"
            }`}
          >
            {completed ? "✓" : step}
          </span>
        )}
        <div className="text-[12px] font-semibold text-grey-500 tracking-wide">{label}</div>
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

// 단일 칩 (토글 버튼, aria-pressed 로 스크린리더에 선택 상태 전달)
function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-[36px] px-3.5 text-[13px] rounded-full border-none cursor-pointer transition-colors ${
        selected ? "bg-blue-500 text-white font-semibold" : "bg-grey-100 text-grey-800 font-medium hover:bg-grey-200"
      }`}
    >
      {label}
    </button>
  );
}
