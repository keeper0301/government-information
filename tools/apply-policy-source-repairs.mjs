import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve(process.argv[2] || 'docs/policy-source-audit');
const apply = process.argv.includes('--apply');
const proposal = JSON.parse(await readFile(resolve(directory, 'repair-proposals.json'), 'utf8'));
function external(raw) {
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      && !['keepioo.com', 'www.keepioo.com'].includes(url.hostname);
  } catch { return false; }
}
const targets = proposal.proposals.filter(row => row.linkedOriginalRecord && external(row.proposedSource));
// 기본 실행은 비교 파일만 만든다. 명시적으로 적용할 때에도 원본 기록과 현재 상태를 다시 읽는다.
const patches = targets.map(row => ({ table: row.table, id: row.id, title: row.title,
  before: { source_url: row.previousSource }, after: { source_url: row.proposedSource },
  expectedUpdatedAt: row.updatedAt, sourceContentApproved: false }));
await writeFile(resolve(directory, 'source-patches.json'), JSON.stringify({
  writesPerformed: 0, patches, note: '수집 주소 복구만 수행하며 공고 내용·해설 검수 승인을 뜻하지 않습니다.' }, null, 2));
if (!apply) { console.log(JSON.stringify({ mode: '쓰기 없는 비교', targets: patches.length })); }
else {
  config({ path: '.env.production', quiet: true });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } });
  const results = [];
  for (const patch of patches) {
    if (!['welfare_programs', 'loan_programs'].includes(patch.table)) throw new Error('지원하지 않는 정책 종류');
    const { data: current, error } = await admin.from(patch.table)
      .select('id,source_id,source_code,source_url,updated_at').eq('id', patch.id).maybeSingle();
    if (error) throw new Error('현재 정책 조회 실패');
    if (!current || current.source_code !== 'press_l2_confirm' || current.source_url !== patch.before.source_url
      || current.updated_at !== patch.expectedUpdatedAt) { results.push({ id: patch.id, status: '변경 또는 이전 적용으로 건너뜀' }); continue; }
    const { data: news, error: sourceError } = await admin.from('news_posts')
      .select('id,source_url').eq('id', current.source_id).maybeSingle();
    if (sourceError) throw new Error('원본 기록 재조회 실패');
    if (!news || news.source_url !== patch.after.source_url) { results.push({ id: patch.id, status: '원본 기록 변경으로 보류' }); continue; }
    const { data: changed, error: saveError } = await admin.from(patch.table).update(patch.after)
      .eq('id', patch.id).eq('source_url', patch.before.source_url).eq('updated_at', patch.expectedUpdatedAt).select('id');
    if (saveError) throw new Error('주소 복구 저장 실패');
    results.push({ ...patch, status: changed?.length ? '복구 완료' : '저장 충돌로 보류' });
    // 중간 중단에도 완료 항목과 이전 값을 남겨 같은 작업을 이어서 처리할 수 있게 한다.
    await appendFile(resolve(directory, 'applied-source-repairs.jsonl'), JSON.stringify({
      appliedAt: new Date().toISOString(), ...results.at(-1) }) + '\n');
  }
  console.log(JSON.stringify({ restored: results.filter(row => row.status === '복구 완료').length,
    deferred: results.filter(row => row.status !== '복구 완료').length }));
}
