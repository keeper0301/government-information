'use client';

import { useActionState } from 'react';
import { previewNewsDraft, type NewsPreviewResult } from './actions';

const initialState: NewsPreviewResult = { status: 'idle', message: '' };

export function NewsPreviewForm() {
  const [result, action, pending] = useActionState(previewNewsDraft, initialState);
  return <div className="space-y-6">
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="space-y-2 text-sm font-medium">
        <span className="block">공식 기사 번호</span>
        <input name="sourceId" required pattern="[0-9]{9}" maxLength={9} defaultValue="148972915"
          className="rounded-xl border px-4 py-3" disabled={pending} />
      </label>
      <button disabled={pending} className="rounded-xl bg-blue-600 px-5 py-3 text-white disabled:opacity-50">
        {pending ? '초안 작성·검사 중…' : '비공개 초안 작성·검사'}
      </button>
    </form>
    <p className="text-sm text-grey-600">실제 작성 도구를 호출합니다. 한 번에 기사 하나만 검사하며, 작성과 검사는 최대 3회 호출합니다. 기사·발행 한도·기존 보류 상태를 바꾸지 않습니다.</p>
    {result.message && <p role="status" className="rounded-xl bg-slate-100 p-4">{result.message}</p>}
    {result.source && <section className="space-y-3">
      <h2 className="text-lg font-bold">대조할 공식 원문</h2>
      <a href={result.source.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{result.source.title}</a>
      <p className="text-sm">공식 발표일: {result.source.publishedAt}</p>
      <details><summary className="cursor-pointer">원문 내용 펼치기</summary>
        <p className="mt-3 whitespace-pre-wrap rounded-xl border p-4 text-sm leading-7">{result.source.body}</p>
      </details>
    </section>}
    {result.evidenceText && <section className="space-y-3">
      <h2 className="text-lg font-bold">비공개 초안과 검사 근거</h2>
      <p className="text-sm text-grey-600">자동 검사 통과가 글 품질을 보장하지는 않습니다. 원문과 비교해 주요 변화·조건·사례가 빠지지 않았는지 검토하세요.</p>
      {result.draft && <article className="space-y-5 rounded-xl border p-5">
        <h3 className="text-xl font-bold">{result.draft.title}</h3>
        <p className="leading-7">{result.draft.answer}</p>
        <p className="text-sm text-grey-600">대상: {result.draft.audience}</p>
        {result.draft.sections.map((section, index) => <section key={index} className="space-y-2">
          <h4 className="font-bold">{section.heading}</h4>
          {section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex} className="leading-7">{paragraph}</p>)}
        </section>)}
      </article>}
      <details><summary className="cursor-pointer">검사 근거와 원래 응답 펼치기</summary>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border p-4 text-sm leading-7">{result.evidenceText}</pre>
      </details>
    </section>}
  </div>;
}
