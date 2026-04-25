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

const iconMap = {
  house: HouseIcon,
  briefcase: BriefcaseIcon,
  heart: HeartIcon,
  medical: MedicalIcon,
  coin: CoinIcon,
  store: StoreIcon,
  shield: ShieldCheckIcon,
};

function DdayLabel({ dday }: { dday: number | null }) {
  if (dday === null) {
    return (
      <span className="shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-grey-100 text-grey-600">
        상시
      </span>
    );
  }
  if (dday <= 7) {
    return (
      <span className="shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#FFEEEE] text-red">
        D-{dday}
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
      D-{dday}
    </span>
  );
}

export function ProgramRow({ program }: { program: DisplayProgram }) {
  const Icon = iconMap[program.icon];

  return (
    <a
      href={`/${program.type}/${program.id}`}
      className="block py-5 -mx-3 px-3 rounded-xl border-b border-grey-100 last:border-b-0 cursor-pointer no-underline text-inherit transition-colors hover:bg-grey-50"
    >
      {/* 데스크톱: 아이콘 + 제목/설명 + 금액 가로 배치 */}
      <div className="flex items-center gap-4">
        <div className="shrink-0 w-10 h-10 bg-grey-200 rounded-[11px] grid place-items-center max-md:w-8 max-md:h-8">
          <Icon className="w-5 h-5 text-grey-800 max-md:w-4 max-md:h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-[17px] font-bold text-grey-900 tracking-[-0.3px] truncate max-md:text-[15px]">
              {program.title}
            </div>
            <DdayLabel dday={program.dday} />
          </div>
          {/* description 은 원문 그대로 저장돼 있어 &nbsp; · ☞ · <br> 등 raw 엔티티·
              섹션 기호가 노출되는 사례가 있음. 상세 페이지와 동일하게 cleanDescription
              으로 엔티티·태그 정리. truncate 한 줄이라 삽입된 \n 은 CSS 가 공백으로
              합쳐 한 줄로 렌더됨 (ellipsis 위치만 자연스러워짐). */}
          <div className="text-[15px] text-grey-900 leading-[1.55] truncate">
            {cleanDescription(program.description)}
          </div>
        </div>
        {/* 데스크톱에서만 오른쪽에 금액 표시 */}
        <div className="shrink-0 text-right max-w-[240px] max-md:hidden">
          <div className="text-[15px] font-bold text-grey-900 tracking-[-0.3px] mb-0.5 truncate">
            {program.amount}
          </div>
          <div className="text-[13px] font-medium text-grey-800 truncate">{program.source}</div>
        </div>
      </div>
      {/* 모바일에서만 아래에 금액 표시 — 40~50대 가독성 위해 14px */}
      {program.amount && (
        <div className="hidden max-md:flex items-center justify-between mt-2 ml-12 pl-0.5">
          <div className="text-[14px] font-bold text-grey-900 truncate">
            {program.amount}
          </div>
          <div className="text-[13px] font-medium text-grey-800 shrink-0 ml-2">{program.source}</div>
        </div>
      )}
    </a>
  );
}
