import { config } from 'dotenv';
import { readFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createAdminClient } from '../lib/supabase/admin.ts';
import { createGuideDraft, programSnapshot } from '../lib/policy/evidence-guide.ts';
import { readPrivateReview, savePrivateReview } from '../lib/policy/guidance-storage.ts';

// 현재 기관 원문과 대조한 초안만 비공개로 저장한다. 사람 검수 승인과 공개는 수행하지 않는다.
config({ path: '.env.production', quiet: true });
const directory = resolve(process.argv[2]);
const apply = process.argv.includes('--apply');
const packet = JSON.parse(await readFile(resolve(directory, 'next/pilot-drafts.json'), 'utf8'));
const admin = createAdminClient(); let saved = 0;
for (const item of packet.results) {
  if (!['welfare_programs', 'loan_programs'].includes(item.table)
    || item.operatorApproved || item.matchedQuotes !== item.draft.sections.length) throw new Error('원문 대조 초안만 저장할 수 있습니다.');
  const { data: row, error } = await admin.from(item.table).select('*').eq('id', item.id).single();
  if (error) throw new Error('현재 정책 조회 실패');
  if (programSnapshot(row) !== item.draft.programSnapshot) throw new Error('정책이 변경되어 재대조가 필요합니다.');
  const review = await readPrivateReview(admin, item.table, item.id);
  if (review || row.policy_guidance?.status === 'approved') {
    console.log(JSON.stringify({ id: item.id, status: '기존 검수 자료 보호: 건너뜀' })); continue;
  }
  const draft = createGuideDraft(row, item.draft.source, item.draft.sections);
  if (draft.status !== 'draft' || draft.source.checkedAt !== null) throw new Error('공개 승인 자료를 저장할 수 없습니다.');
  if (apply) {
    const ok = await savePrivateReview(admin, item.table, row, review, draft);
    if (!ok) throw new Error('동시 변경이 있어 저장을 중단했습니다.');
    const readback = await readPrivateReview(admin, item.table, item.id);
    if (JSON.stringify(readback?.guidance) !== JSON.stringify(draft)) {
      // 저장소가 속성 순서를 바꿀 수 있으므로 변경 감지값과 비공개 상태를 다시 대조한다.
      if (readback?.guidance?.contentSnapshot !== draft.contentSnapshot || readback?.guidance?.status !== 'draft') throw new Error('비공개 초안 저장 확인 실패');
    }
    await appendFile(resolve(directory, 'next/stored-pilot-drafts.jsonl'), JSON.stringify({ id: item.id,
      table: item.table, title: item.title, storedAt: new Date().toISOString(), publicApproved: false }) + '\n');
    saved++;
  }
}
console.log(JSON.stringify({ mode: apply ? '비공개 초안 저장' : '쓰기 없이 대조', saved, publicApproved: 0 }));
