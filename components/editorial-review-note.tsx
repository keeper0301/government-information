import Link from "next/link";

type ChecklistItem = {
  label: string;
  text: string;
};

type EditorialReviewNoteProps = {
  title: string;
  description: string;
  checklist: ChecklistItem[];
  guideHref?: string;
};

export function EditorialReviewNote({
  title,
  description,
  checklist,
  guideHref = "/guides",
}: EditorialReviewNoteProps) {
  return (
    <section className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5 md:p-6">
      <div className="mb-4">
        <p className="mb-1 text-[12px] font-bold uppercase tracking-[0.12em] text-blue-700">
          정책알리미 검토 기준
        </p>
        <h2 className="text-[18px] font-extrabold text-grey-900">
          {title}
        </h2>
        <p className="mt-2 text-[14px] leading-[1.7] text-grey-700">
          {description}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {checklist.map((item) => (
          <div key={item.label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-blue-100/70">
            <div className="mb-1 text-[14px] font-bold text-grey-900">
              {item.label}
            </div>
            <p className="text-[13px] leading-[1.6] text-grey-700">
              {item.text}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px] text-grey-700">
        <Link
          href={guideHref}
          className="inline-flex min-h-[40px] items-center rounded-xl bg-blue-600 px-4 font-semibold text-white no-underline hover:bg-blue-700"
        >
          신청 전 가이드 보기
        </Link>
        <span>
          최종 신청은 각 정책의 공식 원문·담당 기관 안내를 기준으로 확인하세요.
        </span>
      </div>
    </section>
  );
}

export const welfareReviewChecklist: ChecklistItem[] = [
  {
    label: "대상 조건 먼저 확인",
    text: "나이·거주지·소득·가구 형태가 함께 맞아야 합니다. 제목만 보고 신청 가능하다고 판단하지 않습니다.",
  },
  {
    label: "서류와 발급일 점검",
    text: "등본, 가족관계증명서, 소득 증빙, 임대차계약서처럼 자주 반려되는 서류를 먼저 확인합니다.",
  },
  {
    label: "중복 수급 제한 확인",
    text: "비슷한 목적의 지원을 이미 받는 경우 차감·제외·환수 위험이 있어 담당 기관 확인이 필요합니다.",
  },
  {
    label: "마감·예산 소진 주의",
    text: "마감일이 남아 있어도 예산 소진형 사업은 조기 종료될 수 있어 최소 3일 전 준비가 안전합니다.",
  },
];

export const loanReviewChecklist: ChecklistItem[] = [
  {
    label: "업종·용도 제한 확인",
    text: "소상공인 자금은 업종, 사업자 상태, 자금 용도 제한이 먼저 걸립니다. 금리보다 대상 적합성이 우선입니다.",
  },
  {
    label: "상환 가능성 점검",
    text: "대출형 지원은 결국 갚아야 합니다. 한도, 금리, 거치 기간, 보증료, 중도상환 조건을 함께 봅니다.",
  },
  {
    label: "체납·휴폐업 리스크",
    text: "국세·지방세 체납, 휴폐업, 신용 상태, 기존 대출 보유 현황은 심사에서 자주 막히는 항목입니다.",
  },
  {
    label: "보증·담보 절차",
    text: "보증기관 심사나 현장 확인이 붙으면 실제 실행까지 시간이 걸리므로 접수일과 실행일을 분리해 봐야 합니다.",
  },
];
