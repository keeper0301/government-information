import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { load } from 'cheerio';
import { PILOT_CONTENT } from './policy-review-pilot-content.mjs';
import { createGuideDraft } from '../lib/policy/evidence-guide.ts';

// 비공개 검토 패킷만 작성한다. 정책 저장소와 사람 승인 기록은 변경하지 않는다.
config({ path: '.env.production', quiet: true });
const directory = resolve(process.argv[2]);
const proposals = JSON.parse(await readFile(resolve(directory, 'repair-proposals.json'), 'utf8')).proposals;
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } });
const results = [];
const normal = value => value.replace(/\s+/g, ' ').trim();
for (const content of PILOT_CONTENT) {
  const original = proposals.find(row => row.id === content.id);
  const { data: row, error } = await client.from(original.table).select('*').eq('id', content.id).single();
  if (error) throw new Error('대표 정책 조회 실패');
  const sections = content.sections.map(([label, text, quote]) => ({ label, text, quote }));
  const draft = createGuideDraft(row, { url: row.source_url, title: row.title,
    body: original.sourceBody, checkedAt: null }, sections);
  let liveStatus = '접속 확인 필요'; let matchedQuotes = 0; let applicationCandidates = [];
  try {
    const response = await fetch(row.source_url, { signal: AbortSignal.timeout(12000), redirect: 'manual' });
    if (response.status !== 200) liveStatus = `기관 접속 응답 ${response.status}: 재확인 필요`;
    else {
      const buffer = await response.arrayBuffer(); const utf = new TextDecoder().decode(buffer);
      const encoding = /charset\s*=\s*["']?(euc-kr|ks_c_5601-1987)/i.test(response.headers.get('content-type') ?? utf) ? 'euc-kr' : 'utf-8';
      const $ = load(new TextDecoder(encoding).decode(buffer));
      $('script,style,nav,header,footer').remove(); const body = normal($('body').text());
      matchedQuotes = sections.filter(section => body.includes(normal(section.quote))).length;
      liveStatus = matchedQuotes === sections.length ? '현재 기관 원문에서 모든 인용 근거 확인' : '현재 원문과 인용 재대조 필요';
      applicationCandidates = $('a[href]').toArray().filter(element => /신청|접수|공고/.test($(element).text()))
        .map(element => { try { return { label: normal($(element).text()), url: new URL($(element).attr('href'), row.source_url).href }; } catch { return null; } })
        .filter(Boolean).filter(item => item.url.startsWith('https:')).slice(0, 15);
    }
  } catch { liveStatus = '기관 접속 실패: 저장된 원문 근거로 초안 작성, 공개 전 재확인 필요'; }
  results.push({ id: row.id, table: original.table, title: row.title, draft, liveStatus,
    matchedQuotes, applicationCandidates, currentApply: row.apply_url, operatorApproved: false });
  console.log(JSON.stringify({ title: row.title, matchedQuotes, liveStatus }));
}
await writeFile(resolve(directory, 'next/pilot-drafts.json'), JSON.stringify({ checkedAt: new Date().toISOString(),
  writesPerformed: 0, operatorApproved: false, results }, null, 2));
await writeFile(resolve(directory, 'next/pilot-review.md'), ['# 대표 정책 10개 검토 초안',
  '사람 검수 미승인 상태입니다. 현재 접속 실패·근거 불일치 자료는 공개 전에 다시 확인해야 합니다.',
  ...results.flatMap(item => [`\n## ${item.title}`, `원문: ${item.draft.source.url}`, `확인 결과: ${item.liveStatus}`,
    ...item.draft.sections.flatMap(section => [`\n### ${section.label}`, section.text, `근거: ${section.quote}`])])].join('\n'));
