import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
config({ path: '.env.production', quiet: true });
// 원문 기록을 대조할 복구 후보만 만든다. 운영 자료에는 쓰지 않는다.
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const directory = resolve(process.argv[2] || 'docs/policy-source-audit');
const inventory = JSON.parse(await readFile(resolve(directory, 'inventory.json'), 'utf8'));
const internal = inventory.rows.filter(row => row.source_kind === '키피오 내부');
const newsById = new Map(); const newsBySlug = new Map();
const ids = [...new Set(internal.filter(row => row.source_code === 'press_l2_confirm' && row.source_id)
  .map(row => row.source_id))];
const slugs = [...new Set(internal.map(row => {
  try { return decodeURIComponent(new URL(row.source_url).pathname.split('/').pop()); } catch { return ''; }
}).filter(Boolean))];
for (const [column, values] of [['id', ids], ['slug', slugs]]) {
  const batchSize = column === 'slug' ? 10 : 40;
  for (let offset = 0; offset < values.length; offset += batchSize) {
    const { data, error } = await client.from('news_posts')
      .select('id,slug,title,ministry,source_url,published_at,body').in(column, values.slice(offset, offset + batchSize));
    if (error) throw new Error(`원문 대조 자료 조회 실패 (${column}, ${offset}, ${error.code || '응답 확인 필요'})`);
    for (const news of data ?? []) { newsById.set(news.id, news); newsBySlug.set(news.slug, news); }
  }
}
const proposals = internal.map(row => {
  const path = decodeURIComponent(new URL(row.source_url).pathname.split('/').pop());
  const news = newsById.get(row.source_id) ?? newsById.get(path) ?? newsBySlug.get(path);
  const linked = news && row.source_code === 'press_l2_confirm' && row.source_id === news.id;
  return { table: row.table, id: row.id, title: row.title, institution: row.source,
    previousSource: row.source_url, previousApply: row.apply_url, updatedAt: row.updated_at,
    proposedSource: news?.source_url ?? null, linkedOriginalRecord: !!linked,
    sourceTitle: news?.title ?? null, sourceInstitution: news?.ministry ?? null,
    sourcePublishedAt: news?.published_at ?? null, sourceBody: news?.body ?? null,
    reviewStatus: news ? '지역·연도·회차·내용 대조 필요' : '원본 기록 확인 필요' };
});
await writeFile(resolve(directory, 'repair-proposals.json'), JSON.stringify({
  writesPerformed: 0, total: proposals.length,
  linkedOriginals: proposals.filter(row => row.linkedOriginalRecord).length,
  recoverableCandidates: proposals.filter(row => row.proposedSource).length, proposals,
}, null, 2));
console.log(JSON.stringify({ total: proposals.length,
  linkedOriginals: proposals.filter(row => row.linkedOriginalRecord).length,
  recoverableCandidates: proposals.filter(row => row.proposedSource).length,
  sample: proposals.filter(row => ['3c0550cc-381c-4d84-81bd-a307394cccc3',
    '3a1dc45e-013f-45ee-abfa-35650e25c363', '67868b1c-4861-4f3e-b8ef-e6efc6f2413f',
    '2820d6c8-2244-45ae-9d52-a8176031370d'].includes(row.id))
    .map(({ sourceBody, ...row }) => ({ ...row, bodyLength: sourceBody?.length ?? 0 })) }, null, 2));
