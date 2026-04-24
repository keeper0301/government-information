"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trackEvent, EVENTS } from "@/lib/analytics";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from "@/components/ui/card";

const AGE_OPTIONS = ["10대", "20대", "30대", "40대", "50대", "60대 이상"];
// 지역: Progressive Disclosure — 인기 4개를 기본, 나머지 14개는 확장 시
const POPULAR_REGIONS = ["전국", "서울", "경기", "인천"];
const OTHER_REGIONS = [
  "부산", "대구", "광주", "대전", "울산", "세종",
  "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];
const ALL_REGIONS = [...POPULAR_REGIONS, ...OTHER_REGIONS];
const OCCUPATION_OPTIONS = ["대학생", "직장인", "자영업자", "구직자", "주부", "기타"];

// "전체"는 URL 쿼리에서 생략해서 깔끔하게 — 복지/대출만 쿼리에 포함
const PROGRAM_TYPE_TABS: { value: "all" | "welfare" | "loan"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "welfare", label: "복지정보" },
  { value: "loan", label: "대출정보" },
];

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

// 홈 맞춤 추천 카드 — "질문만" 담당하고 결과는 /recommend 페이지에 위임
// 왜 이 구조?
//   1) 결과 공간 부족 해결: 홈 히어로 오른쪽 카드는 작아서 결과를 끼워 넣으면 답답
//   2) 중복 계산 제거: 기존엔 홈에서 fetch → "더 보기" 누르면 /recommend 가 또 계산
//      이제는 /recommend 가 URL 쿼리를 받아 SSR 로 한 번에 계산
//   3) 링크 공유 가능 (?age=30대&region=전남&occupation=자영업자&type=welfare)
//   4) 컴포넌트 책임 단순화 — 결과 렌더 로직 완전 제거
export function HomeRecommendCard({ initial }: Props) {
  const router = useRouter();

  const [ageGroup, setAgeGroup] = useState(pickMatching(initial?.age_group, AGE_OPTIONS));
  const [region, setRegion] = useState(pickMatching(initial?.region, ALL_REGIONS));
  const [occupation, setOccupation] = useState(
    pickMatching(initial?.occupation, OCCUPATION_OPTIONS),
  );
  const [programType, setProgramType] = useState<"all" | "welfare" | "loan">("all");
  const [regionExpanded, setRegionExpanded] = useState(
    Boolean(region && !POPULAR_REGIONS.includes(region)),
  );
  // 라우팅 중 버튼 연타 방지용
  const [submitting, setSubmitting] = useState(false);

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

  function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);

    // GA4 이벤트 — 어떤 조합이 많이 선택되는지 분포 파악
    trackEvent(EVENTS.RECOMMEND_SUBMITTED, {
      age_group: ageGroup,
      region,
      occupation,
      program_type: programType,
    });

    // /recommend?age=30대&region=전남&occupation=자영업자&type=welfare 로 이동.
    // /recommend 페이지가 이 쿼리를 받아 SSR 로 즉시 추천을 계산한다.
    const params = new URLSearchParams();
    params.set("age", ageGroup);
    params.set("region", region);
    params.set("occupation", occupation);
    if (programType !== "all") params.set("type", programType);
    router.push(`/recommend?${params.toString()}`);
  }

  return (
    <div className="w-full">
      {/* shadcn Card 시맨틱 구조로 교체 (2026-04-24) — 브랜드 비주얼(흰 배경·
          얇은 테두리·부드러운 그림자·큰 모서리·p-6)은 className 오버라이드로
          100% 유지. 기본 shadcn 스타일(py-4 ring) 을 껐고, keepioo 톤 유지. */}
      <Card className="bg-white border border-grey-100 rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)] ring-0 gap-0 py-0">
        <CardHeader className="px-0 pb-0 mb-5">
          <CardTitle className="text-[17px] font-bold tracking-[-0.3px] text-grey-900 leading-normal">
            나에게 맞는 정책 찾기
          </CardTitle>
          <CardDescription className="text-[13px] text-grey-600 leading-[1.5]">
            3가지만 고르면 30초 안에 보여드려요
            {autoFilled && (
              <span className="text-blue-500 font-medium"> · 내 정보에서 불러왔어요</span>
            )}
          </CardDescription>
          {/* 진행 카운터 — CardAction 슬롯(우측 상단)에 배치. CardHeader grid
              레이아웃이 자동 정렬. */}
          <CardAction
            className={`text-[12px] font-bold tabular-nums self-start ${
              completedCount === 3 ? "text-blue-500" : "text-grey-500"
            }`}
            aria-label={`${completedCount}개 중 3개 입력 완료`}
          >
            {completedCount}/3
          </CardAction>
        </CardHeader>

        <CardContent className="px-0">

        {/* 필터: 찾는 정보 (전체/복지/대출) — 기본 "전체" */}
        <Field label="찾는 정보">
          {PROGRAM_TYPE_TABS.map((tab) => (
            <Chip
              key={tab.value}
              label={tab.label}
              selected={programType === tab.value}
              onClick={() => setProgramType(tab.value)}
            />
          ))}
        </Field>

        {/* 질문 1: 나이 */}
        <Field label="나이대" step={1} completed={!!ageGroup}>
          {AGE_OPTIONS.map((opt) => (
            <Chip
              key={opt}
              label={opt}
              selected={ageGroup === opt}
              onClick={() => setAgeGroup(opt)}
            />
          ))}
        </Field>

        {/* 질문 2: 지역 — Progressive Disclosure */}
        <Field label="거주 지역" step={2} completed={!!region}>
          {visibleRegions.map((opt) => (
            <Chip
              key={opt}
              label={opt}
              selected={region === opt}
              onClick={() => setRegion(opt)}
            />
          ))}
          {!regionExpanded && (
            <button
              type="button"
              onClick={() => setRegionExpanded(true)}
              className="min-h-[44px] px-3 text-[13px] font-medium rounded-full border-none bg-transparent text-grey-600 hover:text-grey-700 hover:bg-grey-50 cursor-pointer transition-colors"
            >
              + 다른 지역 ({OTHER_REGIONS.length})
            </button>
          )}
        </Field>

        {/* 질문 3: 직업 */}
        <Field label="하시는 일" step={3} completed={!!occupation} last>
          {OCCUPATION_OPTIONS.map((opt) => (
            <Chip
              key={opt}
              label={opt}
              selected={occupation === opt}
              onClick={() => setOccupation(opt)}
            />
          ))}
        </Field>

        {/* CTA — 클릭 시 /recommend?... 로 이동 */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className={`group w-full min-h-[52px] text-[15px] font-bold rounded-xl border-none cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
            canSubmit && !submitting
              ? "bg-blue-500 text-white hover:bg-blue-600 shadow-[0_2px_8px_rgba(49,130,246,0.25)]"
              : "bg-grey-100 text-grey-500 cursor-not-allowed"
          }`}
        >
          {submitting ? (
            "결과 페이지로 이동 중..."
          ) : canSubmit ? (
            <>
              {submitLabel}
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </>
          ) : (
            submitLabel
          )}
        </button>
        </CardContent>
      </Card>
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
                : "bg-grey-100 text-grey-600"
            }`}
          >
            {completed ? "✓" : step}
          </span>
        )}
        <div className="text-[12px] font-semibold text-grey-600 tracking-wide">
          {label}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

// 단일 칩 (토글 버튼, aria-pressed 로 스크린리더에 선택 상태 전달)
function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-[44px] px-3.5 text-[13px] rounded-full border-none cursor-pointer transition-colors ${
        selected
          ? "bg-blue-500 text-white font-semibold"
          : "bg-grey-100 text-grey-800 font-medium hover:bg-grey-200"
      }`}
    >
      {label}
    </button>
  );
}
