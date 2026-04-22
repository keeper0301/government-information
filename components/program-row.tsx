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
      className="flex items-center gap-4 py-[18px] border-b border-grey-100 last:border-b-0 cursor-pointer no-underline text-inherit transition-colors hover:bg-grey-50 hover:mx-[-12px] hover:px-3 hover:rounded-xl overflow-hidden"
    >
      <div className="shrink-0 w-10 h-10 bg-grey-100 rounded-[11px] grid place-items-center">
        <Icon className="w-5 h-5 text-grey-700" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-[3px]">
          <div className="text-base font-semibold text-grey-900 tracking-[-0.3px] truncate">
            {program.title}
          </div>
          <DdayLabel dday={program.dday} />
        </div>
        <div className="text-sm text-grey-600 leading-[1.45] truncate">
          {program.description}
        </div>
      </div>
      <div className="shrink-0 text-right max-w-[240px]">
        <div className="text-[15px] font-bold text-grey-900 tracking-[-0.3px] mb-0.5 truncate">
          {program.amount}
        </div>
        <div className="text-xs text-grey-500 truncate">{program.source}</div>
      </div>
    </a>
  );
}
