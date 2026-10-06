import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// 공개 읽기로 적용 결과만 확인하며 운영 자료를 저장하지 않는다.
config({ path: '.env.production', quiet: true });
const directory = resolve(process.argv[2] || 'docs/policy-source-audit');
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { patches } = JSON.parse(await readFile(resolve(directory, 'source-patches.json'), 'utf8'));
const results = [];
for (const table of ['welfare_programs', 'loan_programs']) {
  const selected = patches.filter(row => row.table === table);
  for (let offset = 0; offset < selected.length; offset += 40) {
    const chunk = selected.slice(offset, offset + 40);
    const { data, error } = await client.from(table).select('id,source_url').in('id', chunk.map(row => row.id));
    if (error) throw new Error('적용 결과 공개 조회 실패');
    for (const patch of chunk) results.push({ id: patch.id, table,
      matched: data.some(row => row.id === patch.id && row.source_url === patch.after.source_url) });
  }
}
const report = { checkedAt: new Date().toISOString(), writesPerformed: 0,
  verified: results.filter(row => row.matched).length, unmatched: results.filter(row => !row.matched).length, results };
await writeFile(resolve(directory, 'source-repairs-readback.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ verified: report.verified, unmatched: report.unmatched }));
if (report.unmatched) process.exitCode = 1;
