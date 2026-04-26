import {
  HouseIcon,
  BriefcaseIcon,
  HeartIcon,
  MedicalIcon,
  CoinIcon,
  StoreIcon,
  ShieldCheckIcon,
} from "./icons";
import type { DisplayProgram } from "@/lib/programs";
import { cleanDescription } from "@/lib/utils";
import { EligibilityBadges } from "./personalization/EligibilityBadges";
import { BusinessMatchBadge } from "./personalization/BusinessMatchBadge";
import {
  evaluateBusinessMatch,
  type BusinessProfile,
} from "@/lib/eligibility/business-match";

const iconMap = {
  house: HouseIcon,
  briefcase: BriefcaseIcon,
  heart: HeartIcon,
  medical: MedicalIcon,
  coin: CoinIcon,
  store: StoreIcon,
  shield: ShieldCheckIcon,
};

// 아이콘 색상 — 토스 디자인 시스템(미니멀 모노톤) 패턴 채택.
// 카테고리별 색차보다 통일된 blue 톤 + 호버·액센트 인터랙션으로 시각 다양성 확보.
// 배경 bg-blue-50 + 아이콘 text-blue-600 단일 — 흰 카드 위 가독성·정돈감 우선.
// 색상 차별화 시 yellow 시인성 약함, red 가 D-day 와 의미 충돌 등 부작용 있어 통일.
const ICON_BG_CLASS = "bg-blue-50";
const ICON_TEXT_CLASS = "text-blue-600";

function DdayLabel({ dday }: { dday: number | null }) {
  // 마감 정보는 사용자가 가장 먼저 봐야 할 시그널이라 12px·semibold 로 키움.
  // 11px 은 한국어 본문 13~15px 와 너무 격차가 커서 노안·40·50대가 놓치기 쉬움.
  if (dday === null) {
    return (
      <span className="shrink-0 text-[12px] font-semibold px-2 py-0.5 rounded bg-grey-100 text-grey-600">
        상시
      </span>
    );
  }
  if (dday <= 7) {
    return (
      <span className="shrink-0 text-[12px] font-semibold px-2 py-0.5 rounded bg-[#FFEEEE] text-red">
        D-{dday}
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[12px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-600">
      D-{dday}
    </span>
  );
}

export function ProgramRow({
  program,
  businessProfile,
}: {
  program: DisplayProgram;
  // 자영업자 자격 진단 — 입력한 사용자만 prop 전달. 미입력 사용자는 undefined.
  // server component 라 props drilling 채택 (React Context 미사용).
  businessProfile?: BusinessProfile | null;
}) {
  const Icon = iconMap[program.icon];
  // 마감 7일 이내면 좌측 액센트를 항상 빨강으로 — 긴박성 시각 신호.
  // 그 외엔 hover 시에만 blue 액센트 등장 (정적 상태 차분).
  const isUrgent = program.dday !== null && program.dday <= 7;

  // 자격 진단 — businessProfile 있을 때만 평가 (없으면 null → 배지 미노출)
  // server-side 평가라 React render 마다 호출되지만, evaluateBusinessMatch 는
  // 정규식 + 단순 비교라 1ms 미만. 큰 부담 X.
  const businessMatch = businessProfile
    ? evaluateBusinessMatch(
        `${program.title ?? ''} ${program.description ?? ''}`,
        businessProfile,
      )
    : null;

  return (
    <a
      href={`/${program.type}/${program.id}`}
      className="group relative block py-6 -mx-4 px-4 rounded-2xl border-b border-grey-100 last:border-b-0 cursor-pointer no-underline text-inherit transition-all duration-150 hover:bg-grey-50 hover:translate-x-[1px]"
    >
      {/* 좌측 액센트 막대 — 평소 투명, hover 시 blue-500 등장.
          마감 임박(D-7 이내) 행은 항상 빨간 액센트로 긴박성 강조.
          inset 을 작게 두어 막대 길이를 최대화 (시각 강도 ↑). */}
      <span
        aria-hidden="true"
        className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full transition-opacity duration-150 ${
          isUrgent
            ? "bg-red opacity-100"
            : "bg-blue-500 opacity-0 group-hover:opacity-100"
        }`}
      />
      {/* 데스크톱: 아이콘 + 제목/설명 + 금액 가로 배치 */}
      <div className="flex items-center gap-4">
        <div
          className={`shrink-0 w-11 h-11 ${ICON_BG_CLASS} rounded-xl grid place-items-center transition-transform duration-150 group-hover:scale-105 max-md:w-9 max-md:h-9`}
        >
          <Icon
            className={`w-5 h-5 ${ICON_TEXT_CLASS} max-md:w-[18px] max-md:h-[18px]`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-[17px] font-bold text-grey-900 tracking-[-0.3px] truncate transition-colors group-hover:text-blue-600 max-md:text-[15px]">
              {program.title}
            </div>
            <DdayLabel dday={program.dday} />
          </div>
          {/* 자격 배지 라인 — 자영업자 매칭이 가장 앞 (사용자 본인 자격 시그널이 가장 강함).
              두 컴포넌트 모두 데이터 없으면 null 반환 → empty:hidden 으로 wrap 자체 숨김. */}
          <div className="flex flex-wrap items-center gap-1 mt-1 mb-1 empty:hidden">
            <BusinessMatchBadge match={businessMatch} />
            <EligibilityBadges
              incomeTargetLevel={program.incomeTargetLevel}
              householdTargetTags={program.householdTargetTags}
            />
          </div>
          {/* description 은 원문 그대로 저장돼 있어 &nbsp; · ☞ · <br> 등 raw 엔티티·
              섹션 기호가 노출되는 사례가 있음. 상세 페이지와 동일하게 cleanDescription
              으로 엔티티·태그 정리. truncate 한 줄이라 삽입된 \n 은 CSS 가 공백으로
              합쳐 한 줄로 렌더됨 (ellipsis 위치만 자연스러워짐).
              본문 색·크기는 grey-900·15px 유지 — 사장님 "글자가 잘 안 보여"
              피드백 대응으로 약화하지 않음. */}
          <div className="text-[15px] text-grey-900 leading-[1.55] truncate">
            {cleanDescription(program.description)}
          </div>
        </div>
        {/* 데스크톱에서만 오른쪽에 금액·출처 표시. 출처는 작은 회색 칩으로
            정보 위계 명확화 — 단순 텍스트 보다 카드 안 다른 메타와 구분됨. */}
        <div className="shrink-0 text-right max-w-[240px] flex flex-col items-end gap-1 max-md:hidden">
          {program.amount && (
            <div className="text-[15px] font-bold text-grey-900 tracking-[-0.3px] truncate max-w-full">
              {program.amount}
            </div>
          )}
          <span className="inline-block text-[12px] font-medium text-grey-700 bg-grey-100 px-2 py-0.5 rounded-md truncate max-w-full">
            {program.source}
          </span>
        </div>
      </div>
      {/* 모바일에서만 아래에 금액 + 출처 칩 — 40~50대 가독성 위해 14px 유지.
          ml-[52px] = w-9 모바일 아이콘(36px) + gap-4(16px) 정확 정렬. */}
      {(program.amount || program.source) && (
        <div className="hidden max-md:flex items-center justify-between mt-2 ml-[52px] pl-0.5 gap-2">
          {program.amount ? (
            <div className="text-[14px] font-bold text-grey-900 truncate">
              {program.amount}
            </div>
          ) : (
            <span />
          )}
          <span className="inline-block text-[12px] font-medium text-grey-700 bg-grey-100 px-2 py-0.5 rounded-md shrink-0 truncate max-w-[50%]">
            {program.source}
          </span>
        </div>
      )}
    </a>
  );
}
