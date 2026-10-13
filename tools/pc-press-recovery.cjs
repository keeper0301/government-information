/* eslint-disable @typescript-eslint/no-require-imports -- 기존 지역 수집기를 개인 컴퓨터에서 실행합니다. */
// 실행 환경에서 비밀값을 받습니다. 파일에 비밀값을 기록하지 않습니다.
const { loadTypescript } = require('./local-press-node-loader.cjs');

async function collectPcRegions() {
  const { CITY_REGISTRY } = loadTypescript('lib/scraping/local-press/_registry.ts');
  const requiredKeys = ['jungnang', 'miryang'];
  // 지역 연결이 빠지거나 중복되면 자료를 저장하기 전에 실패로 알립니다.
  for (const key of requiredKeys) {
    if (CITY_REGISTRY.filter(entry => entry.key === key).length !== 1) {
      throw new Error(`${key}: 지역 수집 연결이 없거나 중복되었습니다.`);
    }
  }
  const admin = loadTypescript('lib/supabase/admin.ts').createAdminClient();
  const selected = CITY_REGISTRY.filter(entry => requiredKeys.includes(entry.key));
  // 운영 서버에서 접속하지 못한 두 곳만 직접 읽습니다. 공개 발행은 하지 않습니다.
  for (const entry of selected) {
    try {
      const result = await entry.fn(admin, 10);
      console.log(JSON.stringify({ checkedAt: new Date().toISOString(), key: entry.key, ...result }));
      if (result.invalidBodyCount) {
        console.error(JSON.stringify({ key: entry.key, error: `본문을 읽지 못한 자료 ${result.invalidBodyCount}건` }));
      }
      if (!result.fetched || result.errors.length || result.invalidBodyCount) process.exitCode = 1;
    } catch (error) {
      console.error(JSON.stringify({ checkedAt: new Date().toISOString(), key: entry.key, error: error.message }));
      process.exitCode = 1;
    }
  }
}

collectPcRegions().catch(error => { console.error(error.message); process.exitCode = 1; });
