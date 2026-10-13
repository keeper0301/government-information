import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// 공개 읽기 전용 키로 조사한다. 저장된 정책과 설정을 변경하지 않는다.
config({ path: '.env.production', quiet: true });
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const output = resolve(process.argv[2] || 'docs/policy-source-audit');
const rows = [];
function classify(value) {
  if (!value) return '누락';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '주소 오류';
    if (['keepioo.com', 'www.keepioo.com'].includes(url.hostname)) return '키피오 내부';
    if (url.pathname === '/' && !url.search) return '기관 첫 화면';
    return '상세 주소 후보'; // 내용 일치 확인 전에는 공고로 확정하지 않는다.
  } catch { return '주소 오류'; }
}
for (const table of ['welfare_programs', 'loan_programs']) {
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from(table)
      .select('id,title,source,source_url,apply_url,source_code,source_id,updated_at,apply_end')
      .order('id').range(offset, offset + 499);
    if (error) throw new Error(`${table}: 공개 자료 조회 실패 (${error.code})`);
    rows.push(...data.map(row => ({ table, ...row,
      source_kind: classify(row.source_url), apply_kind: classify(row.apply_url) })));
    if (data.length < 500) break;
  }
}
const counts = {};
for (const row of rows) {
  const tableCounts = counts[row.table] ||= { total: 0, source: {}, application: {} };
  tableCounts.total++;
  tableCounts.source[row.source_kind] = (tableCounts.source[row.source_kind] || 0) + 1;
  tableCounts.application[row.apply_kind] = (tableCounts.application[row.apply_kind] || 0) + 1;
}
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'inventory.json'), JSON.stringify({
  checkedAt: new Date().toISOString(), scope: '공개 읽기 권한으로 조회 가능한 정책',
  contentVerified: false, counts, rows,
}, null, 2));
console.log(JSON.stringify({ output, counts }, null, 2));
