import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const out = process.env.STRUCTURE_REPORT_DIR || '/home/user/.hermes/workspace/reports/keepioo-adsense-structure-implementation-20261003';
const base = process.env.STRUCTURE_BASE_URL || 'http://127.0.0.1:3081';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Localhost-only smoke');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const results = [];
const routes = ['/', '/guides', '/guides/documents-before-government-benefit', '/guides/small-business-policy-fund-mistakes', '/guides/youth-rent-checklist-2026', '/guides/pregnancy-childcare-benefits', '/guides/basic-living-medical-expense-guide', '/c/business', '/c/youth', '/c/senior', '/c/housing', '/about', '/editorial-policy', '/source-policy', '/correction-policy', '/contact', '/guides/no-such-guide-structure-smoke'];
for (const width of [360, 390, 1280]) {
 const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 900 } });
 const page = await context.newPage();
 for (const path of (width === 390 ? routes : ['/'])) {
  const response = await page.goto(base + path, { waitUntil: 'load', timeout: 60000 });
  const h1 = await page.locator('h1').allTextContents();
  const visibleH1 = await page.locator('h1').first().isVisible().catch(() => false);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const links = await page.locator('main a').evaluateAll(nodes => nodes.map(n => ({text: n.textContent, href: n.getAttribute('href')})));
  const row = { path, width, status: response.status(), h1, visibleH1, overflow, links };
  results.push(row);
  await fs.writeFile(out + '/localhost-js-off.json', JSON.stringify(results, null, 2));
  if (path === '/' || path.includes('small-business') || path === '/c/business') await page.screenshot({ path: out + '/' + (path.replaceAll('/', '_') || 'home') + '-' + width + '.png', fullPage: true });
 }
 await context.close();
}
await browser.close();
const failures = results.filter(r => r.overflow || (!r.path.includes('no-such') && (!r.visibleH1 || r.status !== 200)));
console.log(JSON.stringify({ count: results.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
