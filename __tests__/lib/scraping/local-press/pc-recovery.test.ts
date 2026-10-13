// @vitest-environment node
// 외부 접속과 실제 저장 없이 예약 수집의 성공·실패 판단을 검사합니다.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { createPressCollector, type PressCollectorConfig } from '@/lib/scraping/local-press/_factory';

const source = readFileSync('tools/pc-press-recovery.cjs', 'utf8');
const config: PressCollectorConfig = {
  cityName: '검사 지역', region: '서울', ministry: '검사 기관', sourceOutlet: '검사 기관',
  sourceCode: 'local-press-test', listUrl: 'https://example.com/list',
  parseListItems: () => [{ seq: '1', title: '검사 자료', publishedDate: null, sourceUrl: 'https://example.com/1' }],
  parseDetailBody: () => '가'.repeat(300),
};
const admin = { from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: { code: '23505' } }) })) };
type Collector = ReturnType<typeof createPressCollector>['scrapeAndInsert'];

async function runRecovery(entries: { key: string; fn: Collector }[]) {
  const processState = { exitCode: 0 };
  const errors = vi.fn();
  const createAdminClient = vi.fn(() => admin);
  runInNewContext(source, {
    process: processState, console: { log: vi.fn(), error: errors },
    require: () => ({ loadTypescript: (path: string) => path.includes('_registry')
      ? { CITY_REGISTRY: entries } : { createAdminClient } }),
  });
  await setImmediate();
  return { processState, errors, createAdminClient };
}

function entriesFor(fn: Collector) {
  return ['miryang', 'jungnang'].map(key => ({ key, fn }));
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it.each([null, '가'.repeat(249)])('본문이 없거나 짧으면 중복과 구분하고 실패로 종료', async body => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('가'.repeat(2000))));
  const collector = createPressCollector({ ...config, parseDetailBody: () => body });
  const result = await collector.scrapeAndInsert(admin as unknown as Parameters<Collector>[0]);
  expect(result.invalidBodyCount).toBe(1);
  expect(admin.from).not.toHaveBeenCalled();
  const run = await runRecovery(entriesFor(collector.scrapeAndInsert));
  expect(run.processState.exitCode).toBe(1);
});

it('본문이 유효한 기존 자료는 정상 종료', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('가'.repeat(2000))));
  const run = await runRecovery(entriesFor(createPressCollector(config).scrapeAndInsert));
  expect(run.processState.exitCode).toBe(0);
  expect(admin.from).toHaveBeenCalledTimes(2);
});

it.each([[], ['miryang'], ['miryang', 'miryang', 'jungnang']].map(keys => ({ keys })))('지역 등록 누락·중복은 저장 전에 실패', async ({ keys }) => {
  const fn = vi.fn() as unknown as Collector;
  const run = await runRecovery(keys.map(key => ({ key, fn })));
  expect(run.processState.exitCode).toBe(1);
  expect(run.createAdminClient).not.toHaveBeenCalled();
  expect(fn).not.toHaveBeenCalled();
});

it('한 지역이 실패해도 다음 지역을 실행하며 전체는 실패로 종료', async () => {
  const failed = vi.fn().mockRejectedValue(new Error('검사 연결 실패'));
  const succeeded = vi.fn().mockResolvedValue({ fetched: 1, inserted: 1, skipped: 0, errors: [] });
  const run = await runRecovery([{ key: 'miryang', fn: failed }, { key: 'jungnang', fn: succeeded }]);
  expect(succeeded).toHaveBeenCalledTimes(1);
  expect(run.processState.exitCode).toBe(1);
});
