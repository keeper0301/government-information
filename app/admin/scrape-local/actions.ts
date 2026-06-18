// ============================================================
// /admin/scrape-local server action — 도시별 수동 수집
// ============================================================
// 사장님 1 클릭 호출. _registry 에서 collector 검색 → 실행 +
// admin_actions 감사 로그 + revalidatePath 로 페이지 자동 갱신.
// ============================================================

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-actions";
import {
  CITY_BY_KEY,
  type CityKey,
} from "@/lib/scraping/local-press/_registry";

export type { CityKey } from "@/lib/scraping/local-press/_registry";

export async function scrapeCityAction(city: CityKey, limit = 10) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) {
    return { error: "권한 없음" };
  }
  const entry = CITY_BY_KEY[city];
  if (!entry) {
    return { error: "알 수 없는 도시" };
  }

  const safeLimit = Math.min(Math.max(limit, 1), 30);

  try {
    const result = await entry.fn(createAdminClient(), safeLimit);
    await logAdminAction({
      actorId: user.id,
      action: "local_press_scrape",
      details: {
        ministry: entry.ministry,
        trigger: "admin_manual",
        ...result,
        // 모니터가 읽는 snake_case 로 명시(insert-stop auto-triage 일관).
        // source_code 는 collector 실제값(result.sourceCode) — key 추정 금지(불일치 위험).
        latest_fetched: result.latestFetched ?? null,
        source_code: result.sourceCode ?? null,
      },
    });
    revalidatePath("/admin/scrape-local");
    return { ok: true, result };
  } catch (e) {
    return { error: `수집 실패: ${(e as Error).message}` };
  }
}
