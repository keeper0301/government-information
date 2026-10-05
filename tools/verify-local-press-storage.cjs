/* eslint-disable @typescript-eslint/no-require-imports -- 실제 서버 실행 환경을 사용하는 공통 모듈 방식의 저장 확인 도구입니다. */
// 첨부문서도 실제 서버와 같은 실행 환경에서 읽고 저장 결과를 확인한다.
const fs = require('node:fs');
const path = require('node:path');
const { loadTypescript } = require('./local-press-node-loader.cjs');

async function verifyStorage() {
  if (process.env.LOCAL_PRESS_VERIFY_STORAGE !== '1') throw new Error('저장 확인을 명시적으로 활성화해 주세요.');
  const requested = (process.env.LOCAL_PRESS_AUDIT_KEYS ?? '').split(',').filter(Boolean);
  if (!requested.length) throw new Error('저장 확인할 지역을 지정해 주세요.');
  const { CITY_REGISTRY } = loadTypescript('lib/scraping/local-press/_registry.ts');
  if (requested.some(key => !CITY_REGISTRY.some(entry => entry.key === key))) throw new Error('등록되지 않은 지역이 있습니다.');
  const admin = loadTypescript('lib/supabase/admin.ts').createAdminClient();
  const results = [];
  for (const entry of CITY_REGISTRY.filter(entry => requested.includes(entry.key))) {
    try {
      const result = await entry.fn(admin, Number(process.env.LOCAL_PRESS_AUDIT_LIMIT ?? 1));
      if (!result.sourceCode) throw new Error('자료 출처 코드가 없습니다.');
      const { data, error } = await admin.from('news_posts').select('title, source_url, body, published_at')
        .eq('source_code', result.sourceCode).order('created_at', { ascending: false }).limit(1);
      if (error) throw error;
      results.push({ key: entry.key, checkedAt: new Date().toISOString(), result, stored: (data ?? []).map(row => ({
        title: row.title, url: row.source_url, publishedAt: row.published_at, bodyLength: String(row.body ?? '').length,
      })) });
      console.log(`${entry.key}: 읽음 ${result.fetched}, 저장 ${result.inserted}, 확인 ${(data ?? []).length}건`);
    } catch (error) { results.push({ key: entry.key, error: String(error) }); }
  }
  const output = path.resolve(__dirname, '../docs/local-press-storage-verification.json');
  const previous = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : [];
  fs.writeFileSync(output, JSON.stringify([...previous.filter(row => !requested.includes(row.key)), ...results], null, 2));
  // 오류가 기록되면 성공으로 종료하지 않는다. 이미 저장된 중복 글은 재조회로 확인한다.
  if (results.some(row => row.error || row.result.errors.length || !row.stored.some(post => post.bodyLength >= 250))) {
    throw new Error('본문 저장을 확인하지 못한 지역이 있습니다. 결과 기록을 확인해 주세요.');
  }
}
verifyStorage().catch(error => { console.error(error.message); process.exitCode = 1; });
