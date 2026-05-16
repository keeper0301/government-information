// ============================================================
// /admin/scrape-local server action — 도시별 수동 수집
// ============================================================
// 사장님 1 클릭 호출. 각 collector 의 scrape*AndInsert 직접 실행 +
// admin_actions 감사 로그 + revalidatePath 로 페이지 자동 갱신.
// ============================================================

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-actions";
import { scrapeSuncheonAndInsert } from "@/lib/scraping/local-press/suncheon";
import { scrapeGwangjuAndInsert } from "@/lib/scraping/local-press/gwangju";

const COLLECTORS = {
  suncheon: {
    city: "순천시",
    ministry: "전라남도 순천시",
    fn: scrapeSuncheonAndInsert,
  },
  gwangju: {
    city: "광주광역시",
    ministry: "광주광역시",
    fn: scrapeGwangjuAndInsert,
  },
} as const;

export type CityKey = keyof typeof COLLECTORS;

export async function scrapeCityAction(city: CityKey, limit = 10) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) {
    return { error: "권한 없음" };
  }
  const collector = COLLECTORS[city];
  if (!collector) {
    return { error: "알 수 없는 도시" };
  }

  const safeLimit = Math.min(Math.max(limit, 1), 30);

  try {
    const result = await collector.fn(createAdminClient(), safeLimit);
    await logAdminAction({
      actorId: user.id,
      action: "local_press_scrape",
      details: {
        ministry: collector.ministry,
        trigger: "admin_manual",
        ...result,
      },
    });
    revalidatePath("/admin/scrape-local");
    return { ok: true, result };
  } catch (e) {
    return { error: `수집 실패: ${(e as Error).message}` };
  }
}
