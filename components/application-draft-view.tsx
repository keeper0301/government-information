// components/application-draft-view.tsx
// Pro 신청서 초안 화면 — server-renderable + client print button.
//
// 신청서 형식:
//   - 정책 제목 + type 라벨
//   - 면책 안내 (가장 위에, 사용자 검토 의무 명시)
//   - 섹션별 테이블 (label : value) — 빈 값은 placeholder 회색
//   - 자유 작성 영역 (사용자 직접 작성용 빈 박스 + hint)
//   - 첨부 서류 체크리스트
//   - 신청 페이지 link
//
// print-to-PDF: 별도 client island (PrintButton) 만 client. 본문은 server-rendered.
// @media print 로 nav/footer/버튼 숨김.

import Link from 'next/link';
import {
  POLICY_TYPE_LABEL,
  type ApplicationDraft,
} from '@/lib/application-draft';
import { PrintButton } from './print-button';

export function ApplicationDraftView({
  draft,
  programType,
  programId,
}: {
  draft: ApplicationDraft;
  programType: 'welfare' | 'loan';
  programId: string;
}) {
  return (
    <main className="pt-24 pb-20 max-w-[760px] mx-auto px-10 max-md:px-5 print:pt-0 print:max-w-full print:px-0">
      {/* 화면 전용 헤더 — print 시 숨김 */}
      <div className="mb-6 print:hidden">
        <Link
          href={`/${programType}/${programId}`}
          className="inline-flex items-center text-[13px] text-grey-600 hover:text-grey-900 no-underline mb-4"
        >
          ← 정책 상세로 돌아가기
        </Link>
        <p className="text-[12px] font-semibold text-blue-500 mb-2 tracking-wide">
          Pro · 신청서 초안 자동 생성
        </p>
        <h1 className="text-[26px] font-extrabold tracking-[-1px] text-grey-900 mb-2 max-md:text-[22px]">
          {draft.policyTitle}
        </h1>
        <p className="text-[13px] text-grey-700">
          {POLICY_TYPE_LABEL[draft.policyType]} · 사장님 정보로 자동 채움
        </p>
      </div>

      {/* 면책 안내 — 가장 위, 노란 배경. print 시에도 노출 */}
      <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl print:rounded-none">
        <p className="text-[13px] font-semibold text-amber-900 mb-2">
          ⚠️ 신청 전 반드시 확인하세요
        </p>
        <ul className="text-[12px] text-amber-800 leading-[1.65] space-y-1 list-disc pl-4">
          {draft.disclaimers.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      </div>

      {/* print 전용 헤더 */}
      <div className="hidden print:block mb-4">
        <p className="text-[10px] text-grey-700">신청서 초안 (참고용) — keepioo</p>
        <h1 className="text-[20px] font-bold text-grey-900">{draft.policyTitle}</h1>
        <p className="text-[11px] text-grey-700">
          {POLICY_TYPE_LABEL[draft.policyType]}
        </p>
      </div>

      {/* 섹션들 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-6 print:rounded-none print:shadow-none print:border print:border-grey-300">
        {draft.sections.map((section, idx) => (
          <section
            key={idx}
            className="border-b border-grey-100 last:border-b-0 p-6 max-md:p-4 print:p-3"
          >
            <h2 className="text-[15px] font-bold text-grey-900 mb-3 tracking-[-0.3px] print:text-[13px]">
              {section.heading}
            </h2>

            {section.fields.length > 0 && (
              <table className="w-full text-[13px] border-collapse">
                <tbody>
                  {section.fields.map((field, fi) => (
                    <tr
                      key={fi}
                      className="border-b border-grey-100 last:border-b-0"
                    >
                      <th className="text-left align-top py-2.5 pr-3 font-semibold text-grey-700 w-[35%] max-md:w-[40%] print:py-1.5">
                        {field.label}
                      </th>
                      <td className="py-2.5 align-top text-grey-900 print:py-1.5">
                        {field.value ? (
                          <span className="whitespace-pre-line">{field.value}</span>
                        ) : (
                          <span className="text-grey-500 italic">
                            {field.placeholder ?? '미입력 — 직접 작성 필요'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {section.freeform && (
              <div className="mt-2">
                <p className="text-[12px] text-grey-700 mb-2 leading-[1.5]">
                  💡 {section.freeform.hint}
                </p>
                {/* 자유 작성 빈 박스 — print 시 사용자가 손글씨로 작성 가능 */}
                <div className="min-h-[160px] border border-grey-300 rounded-xl bg-grey-50 p-3 text-[12px] text-grey-500 italic print:bg-transparent print:rounded-none">
                  여기에 직접 작성 (
                  {section.freeform.minLength && (
                    <>최소 {section.freeform.minLength}자 </>
                  )}
                  {section.freeform.maxLength && (
                    <>~ {section.freeform.maxLength}자</>
                  )}
                  )
                </div>
              </div>
            )}
          </section>
        ))}

        {/* 첨부 서류 체크리스트 */}
        <section className="border-t border-grey-100 p-6 max-md:p-4 print:p-3">
          <h2 className="text-[15px] font-bold text-grey-900 mb-3 tracking-[-0.3px] print:text-[13px]">
            {draft.sections.length + 1}. 첨부 서류 체크리스트
          </h2>
          <ul className="space-y-1.5">
            {draft.requiredDocuments.map((doc, di) => (
              <li
                key={di}
                className="text-[13px] text-grey-900 leading-[1.55] flex items-start gap-2"
              >
                <span className="inline-block w-3.5 h-3.5 border border-grey-400 rounded-sm mt-0.5 shrink-0" />
                <span>{doc}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-grey-600 mt-3 leading-[1.55]">
            ※ 정책별로 추가 서류가 있을 수 있어요. 공식 페이지에서 최종 확인 필수.
          </p>
        </section>
      </div>

      {/* 화면 전용 액션 — print 시 숨김 */}
      <div className="print:hidden flex items-center gap-3 max-md:flex-col">
        <PrintButton />
        {draft.applyUrl && (
          <a
            href={draft.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center min-h-[48px] px-6 text-[15px] font-bold rounded-xl bg-grey-900 text-white hover:bg-grey-800 no-underline transition-colors max-md:w-full max-md:justify-center"
          >
            정책 공식 페이지에서 신청 →
          </a>
        )}
      </div>

      <p className="text-[12px] text-grey-600 mt-6 leading-[1.65] print:hidden">
        💡 작성 팁: PDF 인쇄 후 출력해서 손글씨로 채워 제출하거나, 디지털 입력 후
        브라우저 인쇄 기능으로 PDF 저장 (Ctrl+P → PDF로 저장).
      </p>
    </main>
  );
}
