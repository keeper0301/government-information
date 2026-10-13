import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { scrapeJemulpoIncheonAndInsert } from "@/lib/scraping/local-press/jemulpo_incheon";
import { scrapeGeomdanIncheonAndInsert } from "@/lib/scraping/local-press/geomdan_incheon";
import { scrapeSeoIncheonAndInsert } from "@/lib/scraping/local-press/seo_incheon";

// 연결 검사에서는 운영 저장소에 쓰지 않고 수집 결과만 파일에 기록한다.
it.runIf(process.env.LOCAL_PRESS_LIVE_AUDIT === "1")("인천 개편 지역의 실제 본문을 확인한다", async () => {
  const rows: unknown[] = [];
  for (const [key, scrape] of [["jemulpo_incheon", scrapeJemulpoIncheonAndInsert], ["geomdan_incheon", scrapeGeomdanIncheonAndInsert], ["seo_incheon", scrapeSeoIncheonAndInsert]] as const) {
    const bodies: unknown[] = [];
    const admin = { from: () => ({ insert: async (row: Record<string, unknown>) => {
      bodies.push({ title: row.title, url: row.source_url, length: String(row.body).length });
      return { error: null };
    } }) };
    try { rows.push({ key, result: await scrape(admin as never, 3), bodies }); }
    catch (error) { rows.push({ key, error: String(error), bodies }); }
  }
  writeFileSync("docs/local-press-incheon-live-audit.json", JSON.stringify(rows, null, 2));
}, 300000);
