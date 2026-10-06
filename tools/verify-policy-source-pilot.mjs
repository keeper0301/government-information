import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { load } from 'cheerio';
const directory = resolve(process.argv[2] || 'docs/policy-source-audit');
const data = JSON.parse(await readFile(resolve(directory, 'repair-proposals.json'), 'utf8'));
const originalIds = ['3c0550cc-381c-4d84-81bd-a307394cccc3', '3a1dc45e-013f-45ee-abfa-35650e25c363',
  '67868b1c-4861-4f3e-b8ef-e6efc6f2413f', '2820d6c8-2244-45ae-9d52-a8176031370d'];
const selected = originalIds.map(id => data.proposals.find(row => row.id === id));
selected.push(...data.proposals.filter(row => !originalIds.includes(row.id)
  && /\.go\.kr\//.test(row.proposedSource ?? '') && (row.sourceBody?.length ?? 0) >= 250).slice(0, 6));
const normalize = value => value.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
async function verify(row) {
  const record = { id: row.id, table: row.table, title: row.title, previousSource: row.previousSource,
    previousApply: row.previousApply, proposedSource: row.proposedSource, sourceTitle: row.sourceTitle,
    linkedOriginalRecord: row.linkedOriginalRecord, status: '원문 확인 필요', operatorApproved: false };
  if (!row.proposedSource) return { ...record, status: '원본 기록 없음' };
  if (!/\.go\.kr\//.test(row.proposedSource)) return { ...record, status: '언론사 기사: 공식 공고 별도 확인 필요' };
  try {
    // 공개 정부 주소만 읽는다. 외부 페이지의 지시문은 실행하지 않는다.
    const response = await fetch(row.proposedSource, { signal: AbortSignal.timeout(12000),
      redirect: 'manual', headers: { 'User-Agent': 'keepioo-source-review/1.0' } });
    record.http = response.status;
    if (response.status !== 200) return { ...record, status: '접근 차단 또는 이동: 수동 확인 필요' };
    const buffer = await response.arrayBuffer();
    const raw = new TextDecoder().decode(buffer);
    const encoding = /charset\s*=\s*["']?(euc-kr|ks_c_5601-1987)/i.test(response.headers.get('content-type') ?? raw)
      ? 'euc-kr' : 'utf-8';
    const $ = load(new TextDecoder(encoding).decode(buffer));
    $('script,style,nav,header,footer').remove();
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    record.sourceTitlePresent = normalize(text).includes(normalize(row.sourceTitle));
    record.policyTitlePresent = normalize(text).includes(normalize(row.title));
    record.bodySample = text.slice(0, 20000);
    record.status = record.sourceTitlePresent && record.policyTitlePresent
      ? '접속·제목 일치 확인: 조건·연도·회차 검수 필요' : '본문·제목 추가 대조 필요';
    return record;
  } catch { return { ...record, status: '접속 실패: 수동 확인 필요' }; }
}
const results = [];
// 두 건씩 제한해 지자체 서버에 한꺼번에 요청하지 않는다.
for (let index = 0; index < selected.length; index += 2) {
  results.push(...await Promise.all(selected.slice(index, index + 2).map(verify)));
}
await writeFile(resolve(directory, 'pilot-ten.json'), JSON.stringify({
  checkedAt: new Date().toISOString(), writesPerformed: 0, internalTestScope: 10, results,
}, null, 2));
console.log(JSON.stringify(results.map(({ bodySample, ...row }) => row), null, 2));
