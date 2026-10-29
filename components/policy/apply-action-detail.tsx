import { Suspense } from "react";
import { ApplyClickTracker } from "@/components/analytics/apply-click-tracker";
import { PhoneClickLink } from "@/components/analytics/phone-click-link";
import { PolicyGuideBox } from "@/components/policy/PolicyGuideBox";
import { AdminReviewStatus } from "@/components/policy/admin-review-status";
import { ApplyAlimtalkIntent } from "@/components/policy/apply-alimtalk-intent";
import { ApplyBottomBar } from "@/components/policy/apply-bottom-bar";
import { CollapsedOriginal } from "@/components/policy/collapsed-original";
import { DetailSignupCard, DetailSignupCardView } from "@/components/policy/detail-signup-card";
import { VisitInfoTracker } from "@/components/policy/visit-info-tracker";
import type { EvidenceGuide } from "@/lib/policy/evidence-guide";
import {
  buildApplyActionModel,
  type ApplyActionInput,
  type ApplySecondary,
  type ApplyStep,
} from "@/lib/policy/apply-action-model";

type Props = ApplyActionInput & {
  programId: string;
  kind: "welfare" | "loan";
  sourcePage: string;
  guide: EvidenceGuide | null;
  reviewCheckedAt: string | null;
  reviewReviewedAt: string | null;
  signupViewer?: { loggedIn: boolean; matchCount: number | null };
};

const SUMMARY_ROWS = [
  ["who", "누가"],
  ["amount", "얼마"],
  ["when", "언제"],
  ["how", "어떻게"],
] as const;

function SectionTitle({ index, children }: { index: number; children: string }) {
  return (
    <h2 className="mb-4 flex items-center gap-2 text-[16px] font-bold text-grey-900">
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FF5C6C] text-[13px] font-bold text-white">
        {index}
      </span>
      {children}
    </h2>
  );
}

function ContactButton({
  action,
  programId,
  programTable,
  sourcePage,
}: {
  action: ApplySecondary;
  programId: string;
  programTable: "welfare_programs" | "loan_programs";
  sourcePage: string;
}) {
  const className = "mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-grey-100 px-4 text-center text-[15px] font-semibold text-grey-900 no-underline";
  if (action.type === "phone") {
    return (
      <PhoneClickLink programId={programId} programTable={programTable} sourcePage={sourcePage} href={action.tel} className={className}>
        📞 {action.display}
      </PhoneClickLink>
    );
  }
  return (
    <a href={action.href} target="_blank" rel="noopener noreferrer" className={className}>
      출처 보기
    </a>
  );
}

function StepItem({
  step,
  index,
  programId,
  programTable,
  sourcePage,
}: {
  step: ApplyStep;
  index: number;
  programId: string;
  programTable: "welfare_programs" | "loan_programs";
  sourcePage: string;
}) {
  const marker = (
    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[13px] font-bold text-blue-600">
      {index}
    </span>
  );
  if (step.external && step.href) {
    return (
      <li className="flex items-start gap-3">
        {marker}
        <ApplyClickTracker
          programId={programId}
          programTable={programTable}
          sourcePage={sourcePage}
          href={step.href}
          className="min-h-11 text-[15px] font-semibold leading-[1.6] text-blue-600 no-underline"
        >
          {step.text} ↗
        </ApplyClickTracker>
      </li>
    );
  }
  if (step.tel && step.href) {
    return (
      <li className="flex items-start gap-3">
        {marker}
        <PhoneClickLink
          programId={programId}
          programTable={programTable}
          sourcePage={sourcePage}
          href={step.href}
          className="min-h-11 text-[15px] font-semibold leading-[1.6] text-grey-900 no-underline"
        >
          📞 {step.text}
        </PhoneClickLink>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-3">
      {marker}
      <p className="min-h-11 text-[15px] leading-[1.6] text-grey-800">{step.text}</p>
    </li>
  );
}

export function ApplyActionDetail(props: Props) {
  const model = buildApplyActionModel(props);
  const programTable = props.kind === "welfare" ? "welfare_programs" : "loan_programs";
  const summaryValue = {
    who: model.summary.who,
    amount: model.summary.amount,
    when: model.summary.when.text,
    how: model.summary.how,
  };

  return (
    <>
      <AdminReviewStatus checkedAt={props.reviewCheckedAt} reviewedAt={props.reviewReviewedAt} />
      <Suspense fallback={null}>
        <ApplyAlimtalkIntent programId={props.programId} programType={props.kind} />
      </Suspense>

      {model.chips.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {model.chips.map((chip) => (
            <span key={chip} className="inline-flex items-center rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[13px] font-semibold text-blue-600">
              {chip}
            </span>
          ))}
        </div>
      )}

      <h1 className="mb-2 text-[28px] font-bold tracking-[-1px] text-grey-900 max-md:text-[24px]">
        {props.title}
      </h1>
      <p className="mb-5 text-[13px] font-medium text-grey-600">{model.sourceLine}</p>

      {props.isClosed && (
        <div className="mb-3 rounded-xl border border-red/30 bg-[#FFEEEE] px-4 py-3 text-[14px] font-medium leading-[1.6] text-red">
          이 공고는 신청이 마감됐습니다.
        </div>
      )}

      <section className="mb-3 rounded-2xl border border-grey-200 bg-white p-5">
        <SectionTitle index={1}>한 줄 요약</SectionTitle>
        <dl className="grid gap-3">
          {SUMMARY_ROWS.map(([key, label]) => {
            const value = summaryValue[key];
            const urgent = key === "when" && model.summary.when.urgent;
            const amount = key === "amount";
            const color = urgent ? "text-red" : "text-grey-900";
            return (
              <div key={key} className="grid grid-cols-[4.5rem_1fr] items-baseline gap-3">
                <dt className="text-[14px] font-medium text-grey-500">{label}</dt>
                <dd className={`text-right ${color} ${amount ? "text-[22px] font-extrabold leading-tight" : "text-[15px] font-semibold leading-[1.5]"}`}>
                  {value}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section className="mb-3 rounded-2xl border border-grey-200 bg-white p-5">
        <SectionTitle index={2}>신청은 이렇게 해요</SectionTitle>
        {model.route === "visit" && (
          <VisitInfoTracker programId={props.programId} programTable={programTable} sourcePage={props.sourcePage} />
        )}
        <ol className="grid gap-3">
          {model.steps.map((step, index) => (
            <StepItem
              key={`${index}-${step.text}`}
              step={step}
              index={index + 1}
              programId={props.programId}
              programTable={programTable}
              sourcePage={props.sourcePage}
            />
          ))}
        </ol>
        {model.contactAction && (
          <ContactButton
            action={model.contactAction}
            programId={props.programId}
            programTable={programTable}
            sourcePage={props.sourcePage}
          />
        )}
      </section>

      <section className="mb-3 rounded-2xl border border-grey-200 bg-white p-5">
        <SectionTitle index={3}>믿을 수 있는 정보인가요?</SectionTitle>
        <p className="text-[15px] font-semibold leading-[1.6] text-grey-900">
          공식 출처: {model.trustSource}
          {model.legalBasis ? ` · 근거: ${model.legalBasis}` : ""}
        </p>
        <p className="mt-2 text-[14px] leading-[1.6] text-grey-600">
          최종 조건은 공식 공고에서 한 번 더 확인하세요.
        </p>
      </section>

      {props.guide && (
        <PolicyGuideBox guide={props.guide} tips={null} faq={null} checklist={null} hideReviewStamp />
      )}

      {props.signupViewer ? (
        <DetailSignupCardView audience={model.audience} viewer={props.signupViewer} />
      ) : (
        <DetailSignupCard
          audience={model.audience}
          programId={props.programId}
          programTable={programTable}
          sourcePage={props.sourcePage}
        />
      )}
      <CollapsedOriginal body={model.originalBody} />

      <ApplyBottomBar
        programId={props.programId}
        programTable={programTable}
        sourcePage={props.sourcePage}
        primary={model.primary}
        secondary={model.secondary}
      />
    </>
  );
}
