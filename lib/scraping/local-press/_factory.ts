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

// 표준 HTML entity 디코딩 (5/17 추가). title / 본문 모두 사용 가능.
// 사이트 별 특수 entity (예: 한자 / numeric entity) 는 각 collector 가 보완.
//
// 일관성 (5/17): helper 사용 collector 11종 모두 통일 — pyeongtaek·pohang·iksan·daegu
// (5/17 신규) + goyang·yongin·cheongju·hwaseong·jeonju·gimhae·namyangju·sejong (batch).
// helper 비사용 8 collector (suncheon·gwangju·seoul·suwon·busan·incheon·daejeon·ulsan)
// 는 자체 decode 함수 없음 — entity raw 노출 가능성 있으나 사이트 baseline 영향 작아
// 별도 spec 미룸.
export function decodeBasicEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&hellip;/g, "…")
    .replace(/&middot;/g, "·")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

// 응답 본문이 alert page 인지 검증. 시청 사이트가 mid/menu_id 누락 시
// "alert('잘못된 접근입니다.'); location.href='/'" 같은 200 byte 응답 반환 (포항 사례).
// silent fail 방지 위해 throw → collector errors[] 에 잡혀 health-alert 가 발화.
const ALERT_REDIRECT_RE =
  /alert\s*\(\s*['"](잘못된 접근|접근이 제한|권한이 없|존재하지 않)/i;
// 최소 size — list page 는 보통 30KB+. redirect HTML 은 200~500 byte.
// 안전 buffer 로 1024 (1KB). 작은 fixture 사이트 알려진 사례 없음.
const MIN_RESPONSE_SIZE = 1024;

export async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`fetch failed (${res.status}): ${url}`);
  }
  const text = await res.text();
  if (text.length < MIN_RESPONSE_SIZE) {
    throw new Error(
      `response too small (${text.length} bytes, redirect/alert 의심): ${url}`,
    );
  }
  if (ALERT_REDIRECT_RE.test(text)) {
    throw new Error(`alert/redirect 응답 감지 (referer/mid 가드 의심): ${url}`);
  }
  return text;
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
