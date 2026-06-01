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

import { makeNewsSourceId, makeNewsSlug } from "@/lib/news/slug-helpers";

// 2026-05-22 fix — cheongju site 가 keepioo-bot UA 차단 (488 byte redirect).
// Chrome UA 로 변경 — 다른 시청 (광주·수원·고양 등 12개) 은 keepioo-bot 도 정상이라
// Chrome UA 도 무관. cheongju + 미래 차단 site 일괄 우회.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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
  // 2026-05-20 — news_posts.source_code NOT NULL constraint. 누락 시 insert 실패 사고.
  // 일관 패턴: "local-press-<slug>" (예: "local-press-suncheon").
  sourceCode: string;
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

// 2026-06-01 — Vercel function 일시 timeout 사고 자가 복구를 위한 1회 retry.
// 동작구 6/1 사례: local fetch 2.2s 정상인데 Vercel cron 만 timeout.
// 첫 시도 실패가 timeout (TimeoutError) 일 때만 retry — fetch failed (HTTP error)
// 나 alert/size 사고는 retry 무의미 (사이트 구조 변경 신호) → 즉시 throw.
async function fetchOnce(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(25000),
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

function isTransientTimeout(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message ?? "";
  // AbortSignal.timeout 의 TimeoutError 또는 일부 환경의 메시지 변형
  return (
    err.name === "TimeoutError" ||
    err.name === "AbortError" ||
    /timeout|timed out|aborted due to timeout/i.test(msg)
  );
}

export async function fetchPage(url: string): Promise<string> {
  // 2026-05-26: 15s → 25s. 인천 서구 등 일부 site 가 list page 113K+ 응답 느림.
  // Vercel function maxDuration 360s (review fix). 시·군 48개 ÷ BATCH_SIZE=4 =
  // 12 batches × 평균 ~30s = ~360s margin. retry 1회 (1초 백오프) 추가해도
  // 최악 50s × 12 = 600s 위험은 site 별 timeout 동시 발생 가정 — 실측 1~2 site 만
  // 일시 timeout 이라 안전.
  try {
    return await fetchOnce(url);
  } catch (err) {
    if (!isTransientTimeout(err)) throw err;
    // 1초 백오프 후 1회 retry (Vercel function 일시 사고 자가 복구)
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return await fetchOnce(url);
  }
}

// 2026-05-25 — PC runner Phase 2 용 export. ASN 차단 site (서울·부산·광산·강원·제주·평택) 의
// 사장님 PC 가 fetch 한 HTML 을 받아서 parse + insert 만 처리. Vercel cron 의 fetch failed 우회.
type AdminClient = ReturnType<
  typeof import("@/lib/supabase/admin").createAdminClient
>;

export async function processProvidedHtml(
  cfg: PressCollectorConfig,
  admin: AdminClient,
  listHtml: string,
  detailHtmlMap: Record<string, string>,
  limit = 10,
): Promise<ScrapeResult> {
  const list = cfg.parseListItems(listHtml).slice(0, limit);
  const now = new Date().toISOString();
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  if (list.length === 0 && listHtml.length > 5000) {
    errors.push(
      `list 0건 — site HTML size ${listHtml.length} bytes 인데 regex 매칭 0. site 구조 변경 의심`,
    );
  }

  for (const item of list) {
    const detailHtml = detailHtmlMap[item.seq];
    if (!detailHtml) {
      errors.push(`seq=${item.seq}: PC runner detail HTML 누락`);
      continue;
    }
    const body = cfg.parseDetailBody(detailHtml);
    if (!body || body.length < 50) {
      skipped += 1;
      continue;
    }
    const sourceId = makeNewsSourceId(item.sourceUrl);
    const cityKey = cfg.sourceCode.replace(/^local-press-/, "");
    const slug = makeNewsSlug(item.title, cityKey, sourceId);

    const { error } = await admin.from("news_posts").insert({
      title: item.title.slice(0, 500),
      summary: body.slice(0, 500),
      body: body.slice(0, 20000),
      source_url: item.sourceUrl,
      source_outlet: cfg.sourceOutlet,
      source_code: cfg.sourceCode,
      source_id: sourceId,
      category: "news",
      slug,
      ministry: cfg.ministry,
      published_at: item.publishedDate
        ? `${item.publishedDate}T00:00:00+09:00`
        : now,
      classified_at: null,
    });
    if (error) {
      if (error.code === "23505") skipped += 1;
      else errors.push(`seq=${item.seq}: ${error.message}`);
    } else {
      inserted += 1;
    }
  }

  return {
    city: cfg.cityName,
    fetched: list.length,
    inserted,
    skipped,
    // 2026-05-26 review fix: 3 → 20. 경북 5/25 cron 에서 10건 detail 모두 fail 인데
    // audit 에 3건만 표시 → 나머지 7건 silent skip 의심. 정확 진단 위해 확장.
    errors: errors.slice(0, 20),
  };
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

    // 2026-05-25 review fix: list 0건 silent skip 방지 — site HTML 구조 변경 (예: dataSid → dataIdx)
    // 시 silent-fail-detect 가 prefix 단위라 다른 시·군이 살아있으면 누락 감지 불가.
    // list size > 30K (정상 page) 인데 parseListItems 가 0개면 regex 변경 의심.
    if (list.length === 0 && listHtml.length > 5000) {
      errors.push(
        `list 0건 — site HTML size ${listHtml.length} bytes 인데 regex 매칭 0. site 구조 변경 의심`,
      );
    }

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
      // NOT NULL 가드 — source_id / category / slug 추가 (audit 2026-05-22).
      // 누락 시 silent fail → 시·군 collector 27개 prod row 0건 사고 해소.
      const sourceId = makeNewsSourceId(item.sourceUrl);
      // cityKey 는 sourceCode 의 마지막 segment (`local-press-suncheon` → `suncheon`)
      const cityKey = cfg.sourceCode.replace(/^local-press-/, "");
      const slug = makeNewsSlug(item.title, cityKey, sourceId);

      const { error } = await admin.from("news_posts").insert({
        title: item.title.slice(0, 500),
        summary: body.slice(0, 500),
        body: body.slice(0, 20000),
        source_url: item.sourceUrl,
        source_outlet: cfg.sourceOutlet,
        source_code: cfg.sourceCode, // 2026-05-20 — NOT NULL constraint fix
        source_id: sourceId,
        category: "news",
        slug,
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
      // 2026-05-26 review fix: 3 → 20 (silent_fail 정확 진단)
      errors: errors.slice(0, 20),
    };
  }
  return { scrapeAndInsert };
}
