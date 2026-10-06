import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { load } from 'cheerio';

// 같은 공식 주소는 한 번만 읽고 결과를 공유한다. 제목 일치만으로 운영 주소를 변경하지 않는다.
const directory = resolve(process.argv[2]);
const backlog = JSON.parse(await readFile(resolve(directory, 'next/backlog.json'), 'utf8'));
const proposals = JSON.parse(await readFile(resolve(directory, 'repair-proposals.json'), 'utf8')).proposals;
const previous = new Map(proposals.map(item => [item.id, item]));
const urls = [...new Set(backlog.items.flatMap(item => item.officialCandidates.map(candidate => candidate.source_url)))];
const pages = new Map(); let cursor = 0;
const normalize = value => (value ?? '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
async function worker() {
  while (cursor < urls.length) {
    const url = urls[cursor++];
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.endsWith('.go.kr') || parsed.username || parsed.password) throw new Error('주소 재확인');
      const response = await fetch(url, { signal: AbortSignal.timeout(12000), redirect: 'manual' });
      if (response.status !== 200) { pages.set(url, { status: `접속 응답 ${response.status}: 확인 필요` }); continue; }
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > 2000000) throw new Error('큰 응답');
      const utf = new TextDecoder().decode(buffer);
      const encoding = /charset\s*=\s*["']?(euc-kr|ks_c_5601-1987)/i.test(response.headers.get('content-type') ?? utf) ? 'euc-kr' : 'utf-8';
      const $ = load(new TextDecoder(encoding).decode(buffer)); $('script,style,nav,header,footer').remove();
      const body = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 40000);
      pages.set(url, { status: '접속 확인', body, normalizedBody: normalize(body) });
    } catch { pages.set(url, { status: '기관 접속 실패: 수동 확인 필요' }); }
  }
}
await Promise.all([worker(), worker()]);
const results = backlog.items.filter(item => item.officialCandidates.length).map(item => ({
  id: item.id, table: item.table, title: item.title, currentSource: item.source_url,
  candidates: item.officialCandidates.map(candidate => {
    const page = pages.get(candidate.source_url); const original = previous.get(item.id);
    const sentences = (original?.sourceBody ?? '').split(/[.!?\n]/).map(normalize).filter(sentence => sentence.length >= 20);
    const matches = sentences.filter(sentence => page.normalizedBody?.includes(sentence));
    return { ...candidate, accessStatus: page.status,
      titlePresent: !!page.normalizedBody?.includes(normalize(candidate.title)),
      previousSentencesMatched: matches.length, previousSentenceCount: sentences.length,
      sameStoredInstitution: normalize(item.source) === normalize(candidate.ministry),
      decision: '지역·연도·회차·사업 단계 대조 필요', body: page.body,
      operatorApproved: false };
  }),
}));
await writeFile(resolve(directory, 'next/candidate-readback.json'), JSON.stringify({ checkedAt: new Date().toISOString(),
  writesPerformed: 0, uniqueUrlsRead: urls.length, accessible: [...pages.values()].filter(page => page.body).length,
  operatorApproved: false, results }, null, 2));
console.log(JSON.stringify({ policyCandidates: results.length, uniqueUrlsRead: urls.length,
  accessible: [...pages.values()].filter(page => page.body).length,
  newSources: results.filter(item => item.candidates.some(candidate => candidate.source_url !== item.currentSource)).length,
  writesPerformed: 0 }));
