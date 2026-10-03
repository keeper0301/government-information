import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { load } from 'cheerio';

/** Read-only public evidence collector. No deploy, DB write, submission or advertising action. */
export const READBACK_ROUTES = ['/', '/guides', '/guides/documents-before-government-benefit', '/guides/small-business-policy-fund-mistakes', '/guides/youth-rent-checklist-2026', '/c/business', '/c/youth', '/c/housing', '/c/senior', '/about', '/contact', '/editorial-policy', '/source-policy', '/correction-policy', '/privacy', '/terms', '/help', '/robots.txt', '/sitemap.xml', '/guides/no-such-guide-structure-readback'];
export function validateReadbackBase(input) {
  const url = new URL(input);
  if (!['https://www.keepioo.com', 'http://127.0.0.1:3081', 'http://127.0.0.1:3082', 'http://localhost:3081', 'http://localhost:3082'].includes(url.origin) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Readback base must be an allowlisted production or localhost origin');
  return url.origin;
}
export function analyzePublicResponse(route, { status, headers, html, finalUrl }) {
  const $ = load(html);
  const main = $('main');
  const h1s = main.find('h1').map((_, node) => $(node).text().trim()).get();
  const canonical = $('link[rel="canonical"]').attr('href') ?? null;
  const robots = $('meta[name="robots"]').attr('content') ?? null;
  const sourceLinks = main.find('a[href]').map((_, node) => $(node).attr('href')).get().filter(href => /^https?:\/\//.test(href) && !new URL(href).hostname.endsWith('keepioo.com'));
  const issues = [];
  const missing = route.includes('no-such-guide-');
  if (status !== (missing ? 404 : 200)) issues.push('unexpected_http_status');
  if (!missing && !route.endsWith('.txt') && !route.endsWith('.xml')) {
    if (h1s.length !== 1) issues.push('main_h1_not_single');
    let canonicalMatches = false;
    try {
      const url = new URL(canonical ?? '');
      canonicalMatches = url.origin === 'https://www.keepioo.com' && url.pathname === route && !url.search && !url.hash;
    } catch { /* missing or malformed canonical */ }
    if (!canonicalMatches) issues.push('canonical_mismatch');
    if (/noindex/i.test(robots ?? '') || /noindex/i.test(headers['x-robots-tag'] ?? '')) issues.push('public_noindex');
  }
  if (route.startsWith('/guides/') && !missing && !sourceLinks.length) issues.push('no_direct_external_source_link');
  if (/NaN|Invalid Date/.test(main.text())) issues.push('invalid_date_rendered');
  return { route, status, finalUrl, h1s, canonical, robots, xRobotsTag: headers['x-robots-tag'] ?? null, sourceLinks, mainTextChars: main.text().trim().length, evidencePanel: main.find('[aria-label="출처와 확인 범위"]').length > 0, issues, sha256: crypto.createHash('sha256').update(html).digest('hex') };
}
export async function collectReadback(base, outDir, fetcher = fetch) {
  const origin = validateReadbackBase(base);
  await fs.mkdir(outDir, { recursive: true });
  const rows = [];
  for (const route of READBACK_ROUTES) {
    let row;
    try {
      const response = await fetcher(origin + route, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'keepioo-structure-readonly-readback/1.0' } });
      const html = await response.text();
      const finalUrl = new URL(response.url || origin + route);
      if (finalUrl.origin !== origin) throw new Error('Cross-origin redirect refused');
      row = analyzePublicResponse(route, { status: response.status, html, finalUrl: finalUrl.href, headers: Object.fromEntries(response.headers.entries()) });
      await fs.writeFile(path.join(outDir, route === '/' ? 'home.html' : route.slice(1).replaceAll('/', '_') + '.html'), html);
    } catch (error) {
      row = { route, status: null, issues: ['readback_failed'], error: error instanceof Error ? error.message : String(error) };
    }
    rows.push(row);
    await fs.writeFile(path.join(outDir, 'public-readback.json'), JSON.stringify({ checkedAt: new Date().toISOString(), base: origin, mode: 'read-only', remoteWrites: false, expectedCount: READBACK_ROUTES.length, collectedCount: rows.length, complete: rows.length === READBACK_ROUTES.length, rows }, null, 2));
  }
  const issueRows = rows.filter(row => row.issues.length);
  return { base: origin, collectedCount: rows.length, issueCount: issueRows.length, issues: issueRows.map(row => ({ route: row.route, issues: row.issues })), report: path.join(outDir, 'public-readback.json'), remoteWrites: false };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--base', '--out'].includes(arg) && arg.startsWith('--'))) throw new Error('Only --base and --out are supported; read-only tool');
  const get = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  const result = await collectReadback(get('--base') ?? 'https://www.keepioo.com', get('--out') ?? '/home/user/.hermes/workspace/reports/keepioo-structure-readback-latest');
  console.log(JSON.stringify(result, null, 2));
  if (result.issueCount) process.exitCode = 2;
}
