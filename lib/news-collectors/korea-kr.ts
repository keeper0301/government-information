// ============================================================
// korea.kr RSS 수집 — 정책뉴스·보도자료·전문자료
// ============================================================
// 3개 RSS 피드 를 매일 1회 fetch 후 news_posts 테이블에 upsert.
// 공공누리 제1유형 (출처표시 + 상업이용·변형 허용) — license 컬럼에 기록.
//
// 소스별 특성:
//   - policy.xml: 본문 HTML 풍부 (이미지·본문 포함). 메인 콘텐츠.
//   - pressrelease.xml: 본문 짧음 ("첨부파일 참고"), 부처명 [KMOE] prefix.
//   - expdoc.xml: 전문자료 (연감·백서·보고서). 본문은 목차 정도.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { extractBenefitTags } from "@/lib/tags/taxonomy";
import { cleanDescription } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/collectors";

type FeedCategory = "news" | "press" | "policy-doc";

type Feed = {
  code: "korea-kr-policy" | "korea-kr-press" | "korea-kr-expdoc";
  category: FeedCategory;
  url: string;
};

const FEEDS: Feed[] = [
  {
    code: "korea-kr-policy",
    category: "news",
    url: "https://www.korea.kr/rss/policy.xml",
  },
  {
    code: "korea-kr-press",
    category: "press",
    url: "https://www.korea.kr/rss/pressrelease.xml",
  },
  {
    code: "korea-kr-expdoc",
    category: "policy-doc",
    url: "https://www.korea.kr/rss/expdoc.xml",
  },
];

// item 블록에서 CDATA 포함 태그 추출
function parseTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return null;
  let raw = m[1].trim();
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) raw = cdata[1];
  return raw.length > 0 ? raw : null;
}

// description 의 첫 의미있는 <img src>. RSS 버튼 이미지(btn_textview·icon_logo) 제외.
function extractThumbnail(html: string): string | null {
  const re = /<img[^>]+src=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const src = m[1];
    if (!src) continue;
    if (src.includes("btn_textview") || src.includes("icon_logo")) continue;
    if (!/^https?:/i.test(src)) continue;
    return src;
  }
  return null;
}

// "[과기정통부]과기정통부–교육부..." 형식에서 부처명 추출
function extractMinistry(title: string): { ministry: string | null; clean: string } {
  const m = title.match(/^\[([^\]]+)\]\s*(.+)$/);
  if (m) return { ministry: m[1].trim(), clean: m[2].trim() };
  return { ministry: null, clean: title };
}

// URL 안전 + 결정론적 slug — source_code + source_id 로 충돌·수집시마다 변동 없음.
// title 은 SEO 를 위해 앞에 포함 (한글 URL 지원). 길이 제한으로 잘라냄.
function deterministicSlug(title: string, sourceId: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
  return `${base}-${sourceId}`.slice(0, 120);
}

export type KoreaKrItem = {
  source_code: string;
  source_id: string;
  source_url: string;
  category: FeedCategory;
  ministry: string | null;
  title: string;
  summary: string | null;
  body: string | null;
  thumbnail_url: string | null;
  slug: string;
  benefit_tags: string[];
  published_at: string;
};

// RSS 1개 피드 fetch·파싱
async function fetchFeed(feed: Feed): Promise<KoreaKrItem[]> {
  const res = await fetchWithTimeout(feed.url, {
    timeoutMs: 15000,
    headers: {
      "User-Agent": "Mozilla/5.0 keepioo-bot (+https://www.keepioo.com)",
    },
  });
  if (!res.ok) throw new Error(`${feed.code} HTTP ${res.status}`);
  const xml = await res.text();

  const items: KoreaKrItem[] = [];
  const regex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    const block = m[1];
    const rawTitle = parseTag(block, "title") ?? "";
    const link = parseTag(block, "link") ?? "";
    const descRaw = parseTag(block, "description") ?? "";
    const pubDate = parseTag(block, "pubDate");
    const guid = parseTag(block, "guid") ?? link;

    if (!rawTitle || !link) continue;

    const { ministry, clean: title } = extractMinistry(rawTitle);

    // source_id: newsId / docId 우선, 없으면 guid
    const idMatch = link.match(/newsId=(\d+)|docId=(\d+)/);
    const source_id = idMatch ? (idMatch[1] ?? idMatch[2]) : guid;

    const cleaned = cleanDescription(descRaw);
    const thumbnail = extractThumbnail(descRaw);
    const summary = cleaned.length > 0 ? cleaned.slice(0, 200) : null;

    const publishedDate = pubDate ? new Date(pubDate) : new Date();
    const published_at = Number.isNaN(publishedDate.getTime())
      ? new Date().toISOString()
      : publishedDate.toISOString();

    const textBlob = [title, cleaned].filter(Boolean).join(" ");
    const benefit_tags = extractBenefitTags(textBlob);

    items.push({
      source_code: feed.code,
      source_id,
      source_url: link,
      category: feed.category,
      ministry,
      title,
      summary,
      body: cleaned.length > 0 ? cleaned : null,
      thumbnail_url: thumbnail,
      slug: deterministicSlug(title, source_id),
      benefit_tags,
      published_at,
    });
  }
  return items;
}

// 전체 feed 수집 + news_posts upsert
export async function collectKoreaKr(): Promise<{
  total: number;
  upserted: number;
  errors: number;
  breakdown: Record<string, number>;
}> {
  const supabase = createAdminClient();
  let total = 0;
  let upserted = 0;
  let errors = 0;
  const breakdown: Record<string, number> = {};

  for (const feed of FEEDS) {
    try {
      const items = await fetchFeed(feed);
      total += items.length;
      breakdown[feed.code] = items.length;

      if (items.length === 0) continue;

      const payload = items.map((it) => ({
        source_code: it.source_code,
        source_id: it.source_id,
        source_url: it.source_url,
        category: it.category,
        ministry: it.ministry,
        title: it.title,
        summary: it.summary,
        body: it.body,
        thumbnail_url: it.thumbnail_url,
        slug: it.slug,
        benefit_tags: it.benefit_tags,
        published_at: it.published_at,
        updated_at: new Date().toISOString(),
      }));

      const { data, error } = await supabase
        .from("news_posts")
        .upsert(payload, { onConflict: "source_code,source_id" })
        .select("id");

      if (error) {
        console.error(`[news:${feed.code}] upsert 실패:`, error.message);
        errors++;
      } else {
        upserted += data?.length ?? 0;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[news:${feed.code}] fetch 실패:`, msg);
      errors++;
    }
  }

  return { total, upserted, errors, breakdown };
}
