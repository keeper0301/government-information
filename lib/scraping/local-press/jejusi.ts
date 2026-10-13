import { load } from "cheerio";
import { toMarkdown } from "@ohah/hwpjs";
import { extractHwpxBody } from "./_si_attach_helper";
import { createPressCollector, type PressNewsItem } from "./_factory";

export const LIST_URL = "https://www.jejusi.go.kr/news/communite/report.do";
export function parseListPage(html: string): PressNewsItem[] {
  const $ = load(html), items: PressNewsItem[] = [], seen = new Set<string>();
  $("li").each((_, element) => {
    const row = $(element), anchor = row.find('a[href*="notice_id="]').first();
    const href = anchor.attr("href") || "", seq = /notice_id=([a-f0-9]{32})/i.exec(href)?.[1];
    const title = anchor.find("h3.tit").text().replace(/\s+/g, " ").trim();
    if (!seq || seen.has(seq) || !/[가-힣]/.test(title)) return;
    seen.add(seq);
    items.push({ seq, title, publishedDate: /\d{4}-\d{2}-\d{2}/.exec(row.find(".date").text())?.[0] || null,
      sourceUrl: new URL(href, LIST_URL).href });
  });
  return items;
}

export async function parseDetailBody(html: string): Promise<string | null> {
  const $ = load(html), content = $(".view-content").first();
  // 제주시의 전문은 한글 첨부에 있으므로 사진과 미리보기는 제외합니다.
  for (const anchor of content.find('a[href*="boardFileDown.ac"]').toArray()) {
    const link = $(anchor);
    if (!/\.hwpx?\b/i.test(link.text())) continue;
    try {
      const response = await fetch(new URL(link.attr("href")!, LIST_URL), { signal: AbortSignal.timeout(20000) });
      if (!response.ok) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        const body = await extractHwpxBody(bytes);
        if (body) return body;
      }
      if (bytes[0] !== 0xd0 || bytes[1] !== 0xcf) continue;
      const body = toMarkdown(Buffer.from(bytes), { image: "base64", useHtml: false }).markdown
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/<[^>]*>/g, " ")
        .replace(/[`*~|]/g, "").replace(/^#+\s*/gm, "").replace(/^버전:\s*[\d.]+\s*/, "")
        .replace(/\s+/g, " ").trim();
      if (body.length >= 250 && /[가-힣]/.test(body)) return body.slice(0, 20000);
    } catch { continue; }
  }
  content.find("script,style,iframe,noscript,.file-listA,.inform_box").remove();
  const body = content.find(".memo").text().replace(/\s+/g, " ").trim();
  return body.length >= 250 ? body.slice(0, 20000) : null;
}
export const { scrapeAndInsert: scrapeJejusiAndInsert } = createPressCollector({
  cityName: "제주시", region: "제주", ministry: "제주시청", sourceOutlet: "제주시청",
  sourceCode: "local-press-jejusi", listUrl: LIST_URL, parseListItems: parseListPage, parseDetailBody,
});
