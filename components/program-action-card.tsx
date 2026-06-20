import { AlarmButton } from "@/components/alarm-button";
import { BookmarkButton } from "@/components/bookmark-button";
import { ApplyClickTracker } from "@/components/analytics/apply-click-tracker";
import { isDeepLink } from "@/lib/utils/apply-url";

export type ProgramActionCardKind = "welfare" | "loan";

type Props = {
  kind: ProgramActionCardKind;
  programId: string;
  title: string;
  source: string | null;
  sourcePage: string;
  applyUrl: string | null;
  applyEnd: string | null;
  dday: number | null;
  isClosed: boolean;
  updatedAt?: string | null;
};

export function buildActionStatus(input: {
  applyUrl: string | null;
  isClosed: boolean;
  dday: number | null;
}): { label: string; tone: "closed" | "urgent" | "open" | "unknown"; helper: string } {
  if (input.isClosed) {
    return {
      label: "신청 마감",
      tone: "closed",
      helper: "마감된 공고입니다. 같은 기관의 새 공고 알림을 설정해두세요.",
    };
  }
  if (input.dday !== null && input.dday <= 7) {
    return {
      label: `마감 D-${input.dday}`,
      tone: "urgent",
      helper: "마감이 가까워요. 자격과 서류를 먼저 확인하세요.",
    };
  }
  if (input.applyUrl) {
    return {
      label: input.dday === null ? "상시 신청" : "신청 가능",
      tone: "open",
      helper: "공식 신청 페이지로 이동하기 전 대상 조건을 확인하세요.",
    };
  }
  return {
    label: "신청처 확인 필요",
    tone: "unknown",
    helper: "공식 신청 링크가 부족해 기관명으로 신청 방법을 찾아야 합니다.",
  };
}

export function formatActionDate(value?: string | null): string {
  if (!value) return "확인 중";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "확인 중";
  return date.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function toneClasses(tone: ReturnType<typeof buildActionStatus>["tone"]): string {
  if (tone === "closed") return "bg-red/10 text-red border-red/20";
  if (tone === "urgent") return "bg-[#FFEEEE] text-red border-red/20";
  if (tone === "open") return "bg-blue-50 text-blue-600 border-blue-100";
  return "bg-grey-100 text-grey-700 border-grey-200";
}

export function ProgramActionCard({
  kind,
  programId,
  title,
  source,
  sourcePage,
  applyUrl,
  applyEnd,
  dday,
  isClosed,
  updatedAt,
}: Props) {
  const status = buildActionStatus({ applyUrl, isClosed, dday });
  const programTable = kind === "welfare" ? "welfare_programs" : "loan_programs";
  const applyLabel = kind === "loan" ? "신청하러 가기" : "신청하기";
  const sourceName = source || "공식 기관";
  const fallbackSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `${sourceName} ${title} 신청`,
  )}`;

  return (
    <section className="mb-8 rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50/50 p-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-[13px] font-bold ${toneClasses(
                status.tone,
              )}`}
            >
              {status.label}
            </span>
            <span className="text-[13px] font-medium text-grey-600">
              출처: {sourceName}
            </span>
          </div>
          <h2 className="mb-2 text-[20px] font-extrabold tracking-[-0.6px] text-grey-900">
            신청 전에 이것만 확인하세요
          </h2>
          <p className="text-[14px] leading-[1.7] text-grey-700">
            {status.helper}
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white/80 p-3 ring-1 ring-grey-100">
              <dt className="text-[12px] font-bold text-grey-500">마감일</dt>
              <dd className="mt-1 text-[14px] font-bold text-grey-900">
                {applyEnd || "상시·확인 필요"}
              </dd>
            </div>
            <div className="rounded-xl bg-white/80 p-3 ring-1 ring-grey-100">
              <dt className="text-[12px] font-bold text-grey-500">신청 링크</dt>
              <dd className="mt-1 text-[14px] font-bold text-grey-900">
                {applyUrl ? (isDeepLink(applyUrl) ? "공식 신청 바로가기" : "기관 홈페이지 확인") : "검색으로 확인"}
              </dd>
            </div>
            <div className="rounded-xl bg-white/80 p-3 ring-1 ring-grey-100">
              <dt className="text-[12px] font-bold text-grey-500">마지막 확인</dt>
              <dd className="mt-1 text-[14px] font-bold text-grey-900">
                {formatActionDate(updatedAt)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex w-full flex-col gap-2 lg:w-[260px]">
          {applyUrl && !isClosed ? (
            <ApplyClickTracker
              programId={programId}
              programTable={programTable}
              sourcePage={sourcePage}
              href={applyUrl}
              className={`inline-flex min-h-[48px] items-center justify-center rounded-xl px-5 text-[15px] font-bold no-underline transition-colors ${
                isDeepLink(applyUrl)
                  ? "bg-blue-500 text-white hover:bg-blue-600"
                  : "bg-grey-900 text-white hover:bg-grey-800"
              }`}
            >
              {isDeepLink(applyUrl) ? applyLabel : `${sourceName} 홈페이지 방문`}
            </ApplyClickTracker>
          ) : (
            <a
              href={fallbackSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-grey-900 px-5 text-[15px] font-bold text-white no-underline transition-colors hover:bg-grey-800"
            >
              신청 방법 찾기
            </a>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <AlarmButton programId={programId} programType={kind} />
            <BookmarkButton programType={kind} programId={programId} />
          </div>
          <p className="text-[12px] leading-[1.5] text-grey-500">
            정보는 자동 수집·정리된 안내입니다. 최종 신청 조건은 공식 기관 공고에서 다시 확인하세요.
          </p>
        </div>
      </div>
    </section>
  );
}
