import { chromium } from "playwright-core";
import { processProvidedHtml, type ScrapeResult } from "./_factory";
import { LIST_URL, parseListPage, parseDetailBody } from "./gangbuk";

export async function scrapeGangbukBrowserAndInsert(
  admin: Parameters<typeof processProvidedHtml>[1], limit = 10,
): Promise<ScrapeResult> {
  // 윈도우는 설치된 크롬, 서버는 기존 서버용 크롬 패키지를 사용합니다.
  const options = process.platform === "win32" ? { channel: "chrome", headless: true } : await (async () => {
    const serverChromium = (await import("@sparticuz/chromium")).default;
    return { executablePath: await serverChromium.executablePath(), args: serverChromium.args, headless: true };
  })();
  const browser = await chromium.launch(options);
  try {
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    await page.goto(LIST_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector('a[href*="B0000142/view.do"]', { timeout: 20000 });
    const listHtml = await page.content(), items = parseListPage(listHtml).slice(0, limit);
    if (!items.length) throw new Error("강북구 보도자료 목록을 읽지 못했습니다.");
    const details: Record<string, string> = {};
    for (const item of items) {
      await page.goto(item.sourceUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector(".dbdata", { timeout: 15000 });
      details[item.seq] = await page.content();
      await page.waitForTimeout(200);
    }
    return await processProvidedHtml({ cityName: "강북구", region: "서울", ministry: "강북구청",
      sourceOutlet: "강북구청", sourceCode: "local-press-gangbuk", listUrl: LIST_URL,
      parseListItems: parseListPage, parseDetailBody }, admin, listHtml, details, limit);
  } finally { await browser.close(); }
}
