// ============================================================
// 순천시청 보도자료 수집 — Phase B 첫 시범 시·군 collector
// ============================================================
// 사장님 거주지 (전남 순천) 보도자료 자동 수집. 광역 단위 (전라남도)
// press_ingest 외 시·군 단위 신규 파이프라인.
//
// URL: http://www.suncheon.go.kr/kr/news/0006/0001/ (목록)
//      ?mode=view&seq=NNNN (상세)
//
// 파이프라인:
//   1) 목록 fetch → seq + title + writer 추출
//   2) 각 seq 상세 fetch → 본문 추출
//   3) news_posts INSERT (ministry="전라남도 순천시")
//   4) press_ingest cron 이 신규 row 처리 → LLM 분류 → welfare/loan 등록
//
// 안전성:
//   - 중복: source_url unique constraint 의존 (이미 news_posts 에 있음)
//   - rate limit: 상세 fetch 사이 200ms sleep
//   - parse 실패 graceful skip
// ============================================================

const LIST_URL = "http://www.suncheon.go.kr/kr/news/0006/0001/";
const DETAIL_BASE = "http://www.suncheon.go.kr/kr/news/0006/0001/";
const USER_AGENT = "Mozilla/5.0 (compatible; keepioo-bot/1.0; +https://www.keepioo.com)";

export type SuncheonNewsItem = {
  seq: number;
  title: string;
  writer: string | null; // 담당부서
  sourceUrl: string; // 상세 page URL
  body: string | null; // 본문 (별도 fetch 후 채움)
};

// ── HTML parsing helpers (cheerio 없이 정규식 — 의존성 0) ─────

// 목록 page 의 <td class="title_minwon lefttd"><a href="?mode=view&seq=NNNN">제목</a></td>
// + 다음 <td class="writer">부서</td> 패턴 추출.
const LIST_ITEM_REGEX =
  /<td\s+class="title_minwon\s+lefttd"><a\s+href="\?mode=view&(?:amp;)?seq=(\d+)"\s*>([^<]+)<\/a><\/td>\s*<td\s+class="writer">([^<]*)<\/td>/g;

export function parseListPage(html: string): SuncheonNewsItem[] {
  const items: SuncheonNewsItem[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = re.exec(html)) !== null) {
    const seq = parseInt(m[1], 10);
    if (isNaN(seq) || seq <= 0) continue;
    const title = m[2].trim();
    const writer = m[3].trim();
    if (!title) continue;
    items.push({
      seq,
      title,
      writer: writer || null,
      sourceUrl: `${DETAIL_BASE}?mode=view&seq=${seq}`,
      body: null,
    });
  }
  return items;
}

// 상세 page 의 본문 추출. <div class="contentStyle"> 안의 <td class="content lefttd">
// 가 보통 가장 안쪽이지만 변형 가능 — 가장 긴 <div class="content">...</div> 단순 채택.
const BODY_REGEX = /<div\s+class="content"\s*>([\s\S]*?)<\/div>/;

export function parseDetailBody(html: string): string | null {
  const m = BODY_REGEX.exec(html);
  if (!m) return null;
  // <br>·태그 제거. 줄바꿈은 br → \n 변환 후 다른 태그 strip.
  const text = m[1]
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : null;
}

// ── fetch helpers ──────────────────────────────────────────

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 목록 + 상세 N건 fetch. limit 안전한 default 10건 (초기 시범).
export async function fetchSuncheonRecent(
  limit = 10,
): Promise<SuncheonNewsItem[]> {
  const listHtml = await fetchPage(LIST_URL);
  const items = parseListPage(listHtml).slice(0, Math.max(1, Math.min(limit, 30)));

  // 상세 fetch 병렬 X (시청 사이트 부담 ↓ 위해 직렬 + 200ms sleep)
  for (let i = 0; i < items.length; i++) {
    try {
      const detailHtml = await fetchPage(items[i].sourceUrl);
      items[i].body = parseDetailBody(detailHtml);
    } catch {
      items[i].body = null;
    }
    if (i < items.length - 1) await sleep(200);
  }

  return items;
}
