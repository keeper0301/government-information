import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { CITY_REGISTRY } from "@/lib/scraping/local-press/_registry";

// 실제 저장소 대신 본문을 받아 기록하므로 운영 자료를 변경하지 않는다.
it.runIf(process.env.LOCAL_PRESS_LIVE_AUDIT === "1")("기존 오류 지역의 실제 목록과 본문을 확인한다", async () => {
  const keys = new Set(["cheorwon", "samcheok", "boryeong", "yuseong", "haeundae", "bsnamgu", "gyeyang_incheon", "bukgu_gwangju", "gunsan", "imsil", "yeoju", "anseong", "chungnam", "gyeongnam", "gyeongbuk", "busan"]);
  const rows: unknown[] = [];
  const requested = process.env.LOCAL_PRESS_AUDIT_KEYS?.split(",");
  const entries = requested ? CITY_REGISTRY.filter((entry) => requested.includes(entry.key)) : process.env.LOCAL_PRESS_AUDIT_ALL === "1" ? CITY_REGISTRY : CITY_REGISTRY.filter((entry) => keys.has(entry.key));
  for (let offset = 0; offset < entries.length; offset += 6) {
    await Promise.all(entries.slice(offset, offset + 6).map(async (entry) => {
      const bodies: Record<string, unknown>[] = [];
      const admin = { from: () => ({ insert: async (row: Record<string, unknown>) => {
        bodies.push({ title: row.title, source_url: row.source_url, length: String(row.body ?? "").length });
        return { error: null };
      } }) };
      try {
        const result = await entry.fn(admin as never, Number(process.env.LOCAL_PRESS_AUDIT_LIMIT ?? 1));
        rows.push({ key: entry.key, result, bodies });
      } catch (error) {
        rows.push({ key: entry.key, error: String(error), bodies });
      }
    }));
  }
  const output = requested ? "docs/local-press-selected-live-audit.json" : process.env.LOCAL_PRESS_AUDIT_ALL === "1" ? "docs/local-press-all-live-audit.json" : "docs/local-press-existing-live-audit.json";
  writeFileSync(output, JSON.stringify(rows, null, 2));
}, 1800000);
