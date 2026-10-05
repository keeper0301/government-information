// @vitest-environment node
import { it } from "vitest";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { CITY_REGISTRY } from "@/lib/scraping/local-press/_registry";
import { createAdminClient } from "@/lib/supabase/admin";

// 명시적으로 선택한 연결을 한 글씩 저장하고 다시 읽어 확인한다. 기본 검사는 실행하지 않는다.
it.runIf(process.env.LOCAL_PRESS_VERIFY_STORAGE === "1")("새 수집 경로의 저장 결과를 다시 읽는다", async () => {
  const admin = createAdminClient();
  const requested = process.env.LOCAL_PRESS_AUDIT_KEYS?.split(",") ?? [];
  if (!requested.length) throw new Error("저장 확인할 지역을 지정해 주세요.");
  const results: unknown[] = [];
  for (const entry of CITY_REGISTRY.filter((entry) => requested.includes(entry.key))) {
    try {
      const result = await entry.fn(admin, Number(process.env.LOCAL_PRESS_AUDIT_LIMIT ?? 1));
      const sourceCode = result.sourceCode;
      if (!sourceCode) throw new Error("자료 출처 코드가 없습니다.");
      const { data, error } = await admin.from("news_posts")
        .select("title, source_url, body, published_at")
        .eq("source_code", sourceCode).order("created_at", { ascending: false }).limit(1);
      if (error) throw error;
      results.push({ key: entry.key, checkedAt: new Date().toISOString(), result, stored: data?.map((row) => ({
        title: row.title, url: row.source_url, publishedAt: row.published_at,
        bodyLength: String(row.body ?? "").length,
      })) ?? [] });
    } catch (error) { results.push({ key: entry.key, error: String(error) }); }
  }
  const output = "docs/local-press-storage-verification.json";
  const previous: { key: string }[] = existsSync(output) ? JSON.parse(readFileSync(output, "utf8")) : [];
  // 재검사한 지역은 최신 결과로 교체하며 이전 지역의 확인 기록은 보존한다.
  writeFileSync(output, JSON.stringify([...previous.filter((row) => !requested.includes(row.key)), ...results], null, 2));
}, 1800000);
