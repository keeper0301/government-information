// ============================================================
// 지자체 보도자료 collector factory (5/17)
// ============================================================
// 신규 시·군 추가 시 config 만 정의하면 collector 완성.
//
// 사용 패턴:
//   const collector = createPressCollector({
//     cityName: "수원시",
//     region: "경기",
//     ministry: "수원특례시청",
//     sourceOutlet: "수원특례시청",
//     listUrl: "...",
//     parseListItems: (html) => [...],
//     parseDetailBody: (html) => "...",
//   });
//   export const scrapeSuwon = collector.scrapeAndInsert;
//
// 기존 suncheon/gwangju/seoul 은 자체 작성. helper 마이그레이션은 다음 차.
// ============================================================

const USER_AGENT =
  "Mozilla/5.0 (compatible; keepioo-bot/1.0; +https://www.keepioo.com)";

export type PressNewsItem = {
  seq: string; // string — 수원처럼 17자리 timestamp seq 도 지원
  title: string;
  publishedDate: string | null; // YYYY-MM-DD
  sourceUrl: string;
};

export type PressCollectorConfig = {
  cityName: string;
  region: string; // "서울"/"부산"/"경기" 등
  ministry: string; // 등록 source 표시
  sourceOutlet: string; // news_posts.source_outlet
  listUrl: string;
  // 각 시·군 selector 자체 파싱 — return PressNewsItem[]
  parseListItems: (html: string) => PressNewsItem[];
  // 상세 page 본문 — fail 시 null (skip)
  parseDetailBody: (html: string) => string | null;
};

export type ScrapeResult = {
  city: string;
  fetched: number;
  inserted: number;
  skipped: number;
  errors: string[];
};

export async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`fetch failed (${res.status}): ${url}`);
  }
  return res.text();
}

// config → collector instance. .scrapeAndInsert 가 cron 에서 호출되는 표준 시그너처.
export function createPressCollector(cfg: PressCollectorConfig) {
  async function scrapeAndInsert(
    admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
    limit = 10,
  ): Promise<ScrapeResult> {
    const listHtml = await fetchPage(cfg.listUrl);
    const list = cfg.parseListItems(listHtml).slice(0, limit);
    const now = new Date().toISOString();

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const item of list) {
      let body: string | null = null;
      try {
        const detailHtml = await fetchPage(item.sourceUrl);
        body = cfg.parseDetailBody(detailHtml);
      } catch (e) {
        errors.push(`seq=${item.seq}: fetch ${(e as Error).message}`);
        continue;
      }
      if (!body || body.length < 50) {
        skipped += 1;
        continue;
      }
      const { error } = await admin.from("news_posts").insert({
        title: item.title.slice(0, 500),
        summary: body.slice(0, 500),
        body: body.slice(0, 20000),
        source_url: item.sourceUrl,
        source_outlet: cfg.sourceOutlet,
        ministry: cfg.ministry,
        published_at: item.publishedDate
          ? `${item.publishedDate}T00:00:00+09:00`
          : now,
        classified_at: null,
      });
      if (error) {
        if (error.code === "23505") {
          skipped += 1;
        } else {
          errors.push(`seq=${item.seq}: ${error.message}`);
        }
      } else {
        inserted += 1;
      }
    }

    return {
      city: cfg.cityName,
      fetched: list.length,
      inserted,
      skipped,
      errors: errors.slice(0, 3),
    };
  }
  return { scrapeAndInsert };
}
