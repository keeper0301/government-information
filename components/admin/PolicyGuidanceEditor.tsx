'use client';
import { useState } from 'react';
import type { EvidenceGuide, EvidenceSection } from '@/lib/policy/evidence-guide';

type Program = { id: string; title: string; source_url: string | null; description: string | null;
  detailed_content: string | null; policy_guidance?: EvidenceGuide };
const initial = (): EvidenceSection[] => ['대상 조건 확인 순서', '공고상 주의점', '서류와 제출 순서']
  .map(label => ({ label, text: '', quote: '' }));
export function PolicyGuidanceEditor() {
  const [type, setType] = useState('welfare'); const [id, setId] = useState('');
  const [program, setProgram] = useState<Program | null>(null);
  const [snapshot, setSnapshot] = useState(''); const [sourceBody, setSourceBody] = useState('');
  const [sections, setSections] = useState(initial); const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  async function load() {
    setBusy(true); setMessage(''); setProgram(null); setChecked(false);
    try {
      const response = await fetch(`/api/admin/policy-guidance?type=${type}&id=${encodeURIComponent(id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setProgram(data.program); setSnapshot(data.snapshot);
      setSourceBody(data.program.policy_guidance?.source?.body ?? data.program.detailed_content ?? '');
      setSections(data.program.policy_guidance?.sections ?? initial());
    } catch (error) { setMessage(error instanceof Error ? error.message : '불러오기 실패'); }
    finally { setBusy(false); }
  }
  async function save(action: 'generate' | 'draft' | 'approve' | 'revoke') {
    if (!program) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/policy-guidance', { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, id: program.id, snapshot, action, sourceBody,
          sections: sections.filter(section => section.text.trim()), sourceChecked: checked,
          contentSnapshot: program.policy_guidance?.contentSnapshot }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setProgram({ ...program, policy_guidance: data.guidance });
      if (data.guidance.sections) setSections(data.guidance.sections);
      setChecked(false); setMessage(action === 'approve' ? '검수 완료 설명으로 저장했습니다.' : '저장했습니다. 초안은 공개되지 않습니다.');
    } catch (error) { setMessage(error instanceof Error ? error.message : '저장 실패'); }
    finally { setBusy(false); }
  }
  const approved = program?.policy_guidance?.status === 'approved';
  const stored = program?.policy_guidance;
  const changed = JSON.stringify(sections.filter(section => section.text.trim())) !== JSON.stringify(stored?.sections)
    || sourceBody !== stored?.source?.body;
  return <div className="space-y-4">
    <fieldset disabled={busy} className="space-y-4">
      <label className="block">정책 종류 <select value={type} onChange={event => { setType(event.target.value); setProgram(null); }}>
        <option value="welfare">복지·지원</option><option value="loan">금융·대출</option></select></label>
      <label className="block">정책 번호 <input className="border p-2 w-full" value={id}
        onChange={event => { setId(event.target.value); setProgram(null); }} placeholder="정책 상세 주소의 마지막 번호" /></label>
      <button type="button" onClick={load} className="border rounded p-2">정책 불러오기</button>
      {program && <div className="space-y-4">
        <h2 className="font-bold">{program.title}</h2>
        {approved && stored?.programSnapshot !== snapshot && <p className="text-red-700">
          정책 자료가 변경되어 예전 검수가 무효입니다. 승인을 회수하고 원문과 다시 대조하세요.
        </p>}
        <p>등록된 출처: {program.source_url ?? '없음'}</p>
        <p className="whitespace-pre-wrap">현재 수집 내용: {program.description}</p>
        <label className="block">대조할 공고 원문
          <textarea disabled={approved} className="border p-2 w-full" rows={10} maxLength={20000}
            value={sourceBody} onChange={event => { setSourceBody(event.target.value); setChecked(false); }} /></label>
        {sections.map((section, index) => <div key={index} className="border rounded p-3 space-y-2">
          <h3>{section.label}</h3>
          {(['text', 'quote'] as const).map(key => <label key={key} className="block">
            {key === 'text' ? '키피오 설명' : '이 설명을 뒷받침하는 원문 문장'}
            <textarea disabled={approved} className="border p-2 w-full" rows={3} value={section[key]}
              onChange={event => { setSections(sections.map((item, position) => position === index
                ? { ...item, [key]: event.target.value } : item)); setChecked(false); }} /></label>)}
        </div>)}
        {!approved && <div className="flex gap-3">
          <button type="button" onClick={() => save('generate')} className="border p-2">원문으로 초안 생성</button>
          <button type="button" onClick={() => save('draft')} className="border p-2">수정한 초안 저장</button>
        </div>}
        <label className="block"><input type="checkbox" checked={checked}
          onChange={event => setChecked(event.target.checked)} /> 사업명·지역·연도·회차와 설명·조건·서류를 공식 원문과 직접 대조했습니다.</label>
        {approved ? <button type="button" onClick={() => save('revoke')} className="border p-2">검수 승인 회수</button>
          : <button type="button" disabled={!checked || changed || !stored?.contentSnapshot}
            onClick={() => save('approve')} className="bg-blue-600 text-white p-2 rounded disabled:opacity-40">저장한 초안 검수 승인</button>}
      </div>}
    </fieldset>
    <p role="status">{busy ? '처리 중입니다.' : message}</p>
  </div>;
}
