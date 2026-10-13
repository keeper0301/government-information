import { load } from "cheerio";
import type { PressNewsItem, ScrapeResult } from "./_factory";

export const LIST_URL = "https://www.gangbuk.go.kr/portal/bbs/B0000142/list.do?menuNo=200625";
export function parseListPage(html: string): PressNewsItem[] {
  const $ = load(html), seen = new Set<string>(), items: PressNewsItem[] = [];
  $("tr").each((_, row) => {
    const anchor = $(row).find('a[href*="/portal/bbs/B0000142/view.do"]').first();
    const seq = anchor.attr("href")?.match(/[?&]nttId=(\d+)/)?.[1];
    const title = anchor.text().replace(/\s+/g, " ").trim();
    if (!seq || seen.has(seq) || !/[가-힣]/.test(title)) return;
    seen.add(seq);
    const date = $(row).find("td").toArray().map(cell => $(cell).clone().find(".only-m").remove().end().text().trim())
      .find(text => /^\d{4}-\d{2}-\d{2}$/.test(text)) ?? null;
    items.push({ seq, title, publishedDate: date,
      sourceUrl: `https://www.gangbuk.go.kr/portal/bbs/B0000142/view.do?menuNo=200625&nttId=${seq}` });
  });
  return items;
}
export function parseDetailBody(html: string): string | null {
  const $ = load(html), content = $(".dbdata").first();
  content.find("script, style, iframe, noscript, .file-lists").remove();
  const text = content.text().replace(/\s+/g, " ").trim();
  return /[가-힣]/.test(text) && text.length >= 250 ? text.slice(0, 20000) : null;
}
// 보안 확인 스크립트와 쿠키를 실제 브라우저로 처리하는 독립 경로입니다.
export async function scrapeGangbukAndInsert(
  admin: Parameters<typeof import("./_factory").processProvidedHtml>[1], limit = 10,
): Promise<ScrapeResult> {
  const { scrapeGangbukBrowserAndInsert } = await import("./gangbuk-browser");
  return scrapeGangbukBrowserAndInsert(admin, limit);
}
