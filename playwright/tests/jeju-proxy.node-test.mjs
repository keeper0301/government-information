import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../lib/cities.mjs', import.meta.url), 'utf8');
const text = '제주도 정책 신청 안내와 지원 대상에 관한 본문입니다. '.repeat(30);
const list = '<li class="board-news__article"><a href="/news/bodo/list.htm?act=view&amp;seq=123"><strong class="text-ellipsis">제주 지원사업 모집</strong><span class="date">2026-10-09</span></a></li>';

async function scrape(detail) {
  const context = vm.createContext({
    Buffer, URL, Uint8Array, console, process, setTimeout,
    fetch: async (_url, options) => {
      const target = JSON.parse(options.body).url;
      return { ok: true, json: async () => ({ bodyB64: Buffer.from(target.includes('act=view') ? detail : list).toString('base64') }) };
    },
  });
  const module = new vm.SourceTextModule(source, { context,
    initializeImportMeta(meta) { meta.url = 'file:///isolated-cities.mjs'; },
  });
  await module.link(async specifier => {
    const values = specifier === 'playwright' ? { chromium: {} } :
      specifier === './_factory.mjs' ? { makeScraper: () => () => [], USE_PROXY: true,
        PROXY_URL: 'https://proxy.invalid', PROXY_KEY: 'test', USER_AGENT: 'test', installProxy: () => {} } :
      { fetchSiAttachBody: () => {} };
    const dependency = new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
    return dependency;
  });
  await module.evaluate();
  return module.namespace.scrapeJeju({ limit: 1 });
}

test('keeps article text after a leading preview with id before class', async () => {
  const rows = await scrape('<div id="articleContents" class="article-contents"><div class="file-preview"><iframe></iframe></div><p>' + text + '</p></div><div class="news-info">문의처와 첨부파일</div>');
  assert.equal(rows.length, 1);
  assert.ok(rows[0].body.includes('지원 대상'));
  assert.ok(!rows[0].body.includes('문의처와 첨부파일'));
  assert.equal(rows[0].publishedDate, '2026-10-09');
  assert.equal(rows[0].sourceUrl, 'https://www.jeju.go.kr/news/bodo/list.htm?act=view&seq=123');
});

test('keeps legacy class-first article text', async () => {
  const rows = await scrape('<div class="article-contents"><p>' + text + '</p></div><div class="article-files">첨부 목록</div>');
  assert.equal(rows.length, 1);
  assert.ok(!rows[0].body.includes('첨부 목록'));
});

test('does not treat navigation as a missing article body', async () => {
  const rows = await scrape('<div class="navigation">' + text + '</div></section>');
  assert.equal(rows.length, 0);
});

test('keeps the minimum body length guard', async () => {
  const rows = await scrape('<div id="articleContents" class="article-contents"><p>짧은 본문</p></div><div class="news-info">' + text + '</div>');
  assert.equal(rows.length, 0);
});
