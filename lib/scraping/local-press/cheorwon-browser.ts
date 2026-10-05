import { chromium, type Page } from "playwright-core";
import { processProvidedHtml, type ScrapeResult } from "./_factory";
import { LIST_URL, parseListPage } from "./cheorwon";
import { parseSiNttBody } from "./_si_ntt_helper";
import { readGangwonHwpx } from "./_gangwon_hwpx";

export async function openCheorwonPage(page: Page, url: string): Promise<void> {
  // 자동 수집 시간 안에서 공식 사이트의 일시적인 연결 오류를 한 번 재시도합니다.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12000 });
      return;
    } catch (error) {
      if (attempt === 1 || !/ERR_CONNECTION_TIMED_OUT|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|Timeout.*exceeded/.test(String(error))) throw error;
    }
  }
}

export async function scrapeCheorwonBrowserAndInsert(
  admin: Parameters<typeof processProvidedHtml>[1], limit = 10,
): Promise<ScrapeResult> {
  // 기존에 설치된 크롬을 사용하고 서버에서는 기존 서버용 패키지를 사용합니다.
  const options = process.platform === "win32" ? { channel: "chrome", headless: true } : await (async () => {
    const serverChromium = (await import("@sparticuz/chromium")).default;
    return { executablePath: await serverChromium.executablePath(), args: serverChromium.args, headless: true };
  })();
  const browser = await chromium.launch(options);
  // 한 도시 수집에 허용된 90초 전에 브라우저를 정리해 다른 지역 수집을 이어갑니다.
  const deadline = setTimeout(() => { void browser.close(); }, 80000);
  try {
    const page = await browser.newPage();
    // 철원은 첫 화면에서 공식 언론보도 메뉴를 눌러야 연결이 안정적입니다.
    await openCheorwonPage(page, "https://www.cwg.go.kr/www/index.do");
    await page.locator('a[href="/www/selectBbsNttList.do?bbsNo=32&key=218"]').first().evaluate(link => (link as HTMLAnchorElement).click());
    await page.waitForURL(LIST_URL, { timeout: 12000 });
    await page.waitForSelector('a[href*="nttNo="]', { timeout: 15000 });
    const listHtml = await page.content();
    const items = parseListPage(listHtml).slice(0, limit);
    if (!items.length) throw new Error("철원군 보도자료 목록을 읽지 못했습니다.");
    const details: Record<string, string> = {};
    const bodies = new Map<string, string>();
    for (const item of items) {
      await openCheorwonPage(page, item.sourceUrl);
      await page.waitForSelector(".p-table__content", { timeout: 15000 });
      const html = await page.content();
      details[item.seq] = html;
      const body = parseSiNttBody(html);
      if (body && body.length >= 250) { bodies.set(html, body); continue; }
      const attachment = page.locator("a.p-attach__link").filter({ hasText: /\.hwpx\s*$/i }).first();
      if (!await attachment.count()) continue;
      // 브라우저가 이미 받은 연결 상태를 유지한 채 원문을 내려받습니다.
      const pending = page.waitForEvent("download", { timeout: 20000 });
      await attachment.click();
      const stream = await (await pending).createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const text = await readGangwonHwpx(Buffer.concat(chunks));
      if (text) bodies.set(html, text);
    }
    return await processProvidedHtml({ cityName: "강원 철원군", region: "강원", ministry: "강원 철원군청",
      sourceOutlet: "강원 철원군청", sourceCode: "local-press-cheorwon", listUrl: LIST_URL,
      parseListItems: parseListPage, parseDetailBody: html => bodies.get(html) ?? null }, admin, listHtml, details, limit);
  } finally { clearTimeout(deadline); await browser.close(); }
}
