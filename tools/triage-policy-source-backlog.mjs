import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// 원문 자료를 한 번 읽어 전체 후보를 대조한다. 검색 후보를 사실 확인 결과로 승격하지 않는다.
config({ path: '.env.production', quiet: true });
const directory = resolve(process.argv[2]);
const current = JSON.parse(await readFile(resolve(directory, 'next/inventory.json'), 'utf8')).rows;
const previous = JSON.parse(await readFile(resolve(directory, 'repair-proposals.json'), 'utf8')).proposals;
const previousById = new Map(previous.map(row => [row.id, row]));
const official = value => { try { return ['.go.kr', '.gov.kr', '.or.kr', '.re.kr']
  .some(suffix => new URL(value).hostname.endsWith(suffix)); } catch { return false; } };
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } });
const cachePath = resolve(directory, 'next/official-news-index.json');
let cached;
try { cached = JSON.parse(await readFile(cachePath, 'utf8')); } catch { cached = null; }
if (cached && Date.now() - Date.parse(cached.checkedAt) > 86400000) cached = null;
const news = cached?.rows ?? [];
for (let offset = cached?.nextOffset ?? 0; !cached?.complete; offset += 500) {
  const { data, error } = await client.from('news_posts').select('id,title,ministry,source_url')
    .ilike('source_url', '%go.kr/%').order('id').range(offset, offset + 499)
    .abortSignal(AbortSignal.timeout(30000));
  if (error) throw new Error(`공식 원문 후보 자료 조회 실패 (${error.code || '연결 확인 필요'}, 위치 ${offset})`);
  news.push(...data.filter(item => official(item.source_url)));
  await writeFile(cachePath, JSON.stringify({ checkedAt: new Date().toISOString(),
    nextOffset: offset + data.length, complete: data.length < 500, rows: news }));
  if (data.length < 500) break;
}
const normalize = value => (value ?? '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
const normalizedNews = news.map(item => ({ ...item, normalizedTitle: normalize(item.title) }));
const backlog = current.filter(row => row.apply_kind === '기관 첫 화면'
  || ['키피오 내부', '누락', '주소 오류', '기관 첫 화면'].includes(row.source_kind)
  || (previousById.has(row.id) && !official(row.source_url)));
const items = backlog.map(row => {
  const original = previousById.get(row.id);
  const title = normalize(row.title); const longTitle = normalize(original?.sourceTitle);
  // 짧은 정책명은 여러 지역에 중복돼 정확한 제목이 있어도 자동 수정하지 않는다.
  const candidates = normalizedNews.filter(item => (longTitle.length >= 12 && item.normalizedTitle === longTitle)
    || (title.length >= 12 && item.normalizedTitle.includes(title))).slice(0, 5)
    .map(item => ({ id: item.id, title: item.title, ministry: item.ministry, source_url: item.source_url }));
  return { ...row, issues: [
    ...(row.apply_kind === '기관 첫 화면' ? ['신청 안내 확인 필요'] : []),
    ...(row.source_kind === '키피오 내부' ? ['원본 미확인'] : []),
    ...(['누락', '주소 오류', '기관 첫 화면'].includes(row.source_kind) ? ['원문 주소 누락·오류·첫 화면'] : []),
    ...(original?.proposedSource && !official(row.source_url) ? ['언론 기사: 공식 공고 대조 필요'] : []),
  ], officialCandidates: candidates, contentVerified: false, operatorApproved: false };
});
const summary = { checkedAt: new Date().toISOString(), writesPerformed: 0,
  uniqueBacklog: items.length, applicationHomepage: items.filter(row => row.issues.includes('신청 안내 확인 필요')).length,
  originalMissing: items.filter(row => row.issues.includes('원본 미확인')).length,
  mediaSource: items.filter(row => row.issues.includes('언론 기사: 공식 공고 대조 필요')).length,
  officialNewsRead: news.length, withCandidates: items.filter(row => row.officialCandidates.length).length,
  contentVerified: 0, unresolved: items.length };
await writeFile(resolve(directory, 'next/backlog.json'), JSON.stringify({ ...summary, items }, null, 2));
await writeFile(resolve(directory, 'next/backlog-summary.md'), ['# 신청 주소·공식 원문 대기 자료',
  ...Object.entries(summary).map(([key, value]) => `${key}: ${value}`),
  '\n후보 제목 일치는 지역·연도·회차·조건 확인이 아닙니다. 확인 전 주소는 수정하지 않았습니다.',
  '중복을 제거한 전체 목록은 backlog.json에 있으며 같은 원문을 정책마다 다시 검색하지 않도록 모았습니다.'].join('\n'));
console.log(JSON.stringify(summary, null, 2));
