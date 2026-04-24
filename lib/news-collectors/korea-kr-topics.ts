// ============================================================
// korea.kr "키워드 뉴스" 카테고리 수집 — 15개 주제 분류
// ============================================================
// customizedNewsList.do 페이지가 대상별(6) + 주제별(6) + 핫이슈(3) 총 15개
// 카테고리로 뉴스를 분류해 제공. RSS 수집기 (korea-kr.ts) 와는 별개 경로 —
// RSS 는 부처별(보건복지부·고용노동부 등) 분류라 사용자 관점의 "청년·대학생",
// "소상공인 지원" 같은 주제 분류는 이 수집기에서 채워 넣음.
//
// 동작
//   1) 15개 카테고리마다 `customizedNewsList.do?subPkgId={id}&keyType={KW}&pageIndex=1`
//      GET 요청 → 서버 렌더링 HTML 응답 (카테고리당 약 30~127건, 페이지당 30건)
//   2) HTML 에서 newsId·title·summary·thumbnail·published_at 파싱
//   3) 기존 news_posts 에 upsert — slug 충돌 시 topic_categories 만 병합
//      (같은 뉴스가 "청년·대학생" + "일자리" 에 동시 속하면 둘 다 배열에 추가)
//
// 공공누리 제1유형 라이선스 — korea.kr 자료는 출처표시 후 재배포 가능.
// 썸네일은 재호스팅 금지라 URL 그대로 보존.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchWithTimeout } from "@/lib/collectors";
import { cleanDescription } from "@/lib/utils";

type CategoryAxis = "target" | "topic" | "hot";

type Category = {
  id: string;         // korea.kr subPkgId (예: "25000074")
  name: string;       // 사용자 노출 라벨 (예: "영유아·아동·청소년")
  axis: CategoryAxis; // UI 그룹핑용
  keyType: "KW01" | "KW02" | "KW03";
};

// 15개 카테고리 — 사장님 2026-04-24 요청 기준. "안전"·"보이스피싱"·"5극3특"·
// "여행" 은 keepioo 도메인과 어긋나 제외.
export const TOPIC_CATEGORIES: Category[] = [
  // 대상별 (KW01)
  { id: "25000074", name: "영유아·아동·청소년", axis: "target", keyType: "KW01" },
  { id: "25000075", name: "청년·대학생", axis: "target", keyType: "KW01" },
  { id: "25000106", name: "가족·중장년", axis: "target", keyType: "KW01" },
  { id: "25000077", name: "어르신", axis: "target", keyType: "KW01" },
  { id: "25000078", name: "소득 취약계층", axis: "target", keyType: "KW01" },
  { id: "25000120", name: "장애인", axis: "target", keyType: "KW01" },
  // 주제별 (KW02)
  { id: "25000068", name: "일자리", axis: "topic", keyType: "KW02" },
  { id: "25000069", name: "주거", axis: "topic", keyType: "KW02" },
  { id: "25000070", name: "교육·보육", axis: "topic", keyType: "KW02" },
  { id: "25000071", name: "복지", axis: "topic", keyType: "KW02" },
  { id: "25000072", name: "문화", axis: "topic", keyType: "KW02" },
  { id: "25000131", name: "근로자·소상공인·중소기업", axis: "topic", keyType: "KW02" },
  // 핫이슈 (KW03)
  { id: "70020412", name: "문화가 있는 날", axis: "hot", keyType: "KW03" },
  { id: "70023981", name: "소상공인 지원", axis: "hot", keyType: "KW03" },
  { id: "70022018", name: "청년정책", axis: "hot", keyType: "KW03" },
];

// 카테고리명 → slug (URL 용). "청년·대학생" → "youth-college" 식의 영문 slug
// 매핑은 lib/news-topic-slug.ts 에서 관리.

const BASE_URL = "https://www.korea.kr/news/customizedNewsList.do";

type ParsedItem = {
  newsId: string;
  title: string;
  summary: string | null;
  thumbnailUrl: string | null;
};

// HTML 에서 뉴스 카드 리스트 파싱. 실제 구조:
//   <li>
//     <a href="/news/customizedNewsView.do?newsId=148962831&keyType=KW01">
//       <span class="thumb"><img src="..."/></span>
//       <span class="text">
//         <strong>
//           <span class="category">청년·대학생</span>
//           제목 텍스트
//         </strong>
//         <span class="lead">요약 텍스트</span>
//       </span>
//     </a>
//   </li>
// 인기뉴스 사이드바(visualNewsView.do) 는 다른 구조라 href 가
// customizedNewsView.do 인 것만 매칭해 혼입 방지.
function parseNewsList(html: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const cardRe =
    /<a[^>]+href="\/news\/customizedNewsView\.do\?newsId=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    const newsId = m[1];
    const block = m[2];

    // 제목 — <strong>…</strong> 안에서 <span class="category"> 을 제거한 나머지 텍스트
    const strongMatch = block.match(/<strong[^>]*>([\s\S]*?)<\/strong>/);
    if (!strongMatch) continue;
    const titleRaw = strongMatch[1].replace(
      /<span[^>]*class="category"[^>]*>[^<]*<\/span>/,
      "",
    );
    const title = cleanDescription(titleRaw).trim();

    // 요약 — <span class="lead">…</span>
    const leadMatch = block.match(/<span[^>]*class="lead"[^>]*>([\s\S]*?)<\/span>/);
    const summary = leadMatch ? cleanDescription(leadMatch[1]).trim() : null;

    // 썸네일 — 카드 내 첫 의미있는 <img> (인기뉴스 순위 아이콘 등 제외)
    const thumbMatch = block.match(/<img[^>]+src=["']([^"']+)["']/);
    const thumb = thumbMatch ? thumbMatch[1] : null;
    const thumbnailUrl =
      thumb && /^https?:/i.test(thumb) && !/btn_|icon_|default/i.test(thumb)
        ? thumb
        : null;

    if (newsId && title) {
      items.push({ newsId, title, summary, thumbnailUrl });
    }
  }
  return items;
}

// 단일 카테고리 fetch (페이지 1 기본). Vercel 60초 maxDuration 고려해
// 카테고리당 1페이지(최대 30건) 로 제한 — 매일 cron 누적이면 충분.
async function fetchCategory(cat: Category): Promise<ParsedItem[]> {
  const url = `${BASE_URL}?subPkgId=${cat.id}&keyType=${cat.keyType}&pageIndex=1`;
  const res = await fetchWithTimeout(url, {
    timeoutMs: 20000,
    headers: {
      "User-Agent": "Mozilla/5.0 keepioo-bot (+https://www.keepioo.com)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return parseNewsList(html);
}

// 15개 카테고리 병렬 수집 → news_posts 의 topic_categories 배열에 카테고리명 병합.
// 이 수집기는 새 뉴스를 "추가" 하지 않고 기존 뉴스에 카테고리 라벨만 붙임
// (제목·썸네일은 RSS 수집기가 이미 넣어둔 것이 권위값). slug 매칭은 source_id
// 기준 — korea.kr newsId 와 우리 news_posts.source_id 가 동일.
export async function collectKoreaKrTopics(): Promise<{
  categories: number;
  matched: number;
  updated: number;
  errors: number;
  breakdown: Record<string, number>;
}> {
  const supabase = createAdminClient();

  const results = await Promise.allSettled(
    TOPIC_CATEGORIES.map(async (cat) => ({
      cat,
      items: await fetchCategory(cat),
    })),
  );

  // newsId → 이 뉴스가 속한 카테고리명 목록
  const newsIdToTopics = new Map<string, Set<string>>();
  const breakdown: Record<string, number> = {};
  let errors = 0;

  for (const r of results) {
    if (r.status !== "fulfilled") {
      errors++;
      continue;
    }
    const { cat, items } = r.value;
    breakdown[cat.name] = items.length;
    for (const it of items) {
      const set = newsIdToTopics.get(it.newsId) ?? new Set();
      set.add(cat.name);
      newsIdToTopics.set(it.newsId, set);
    }
  }

  // 수집된 newsId 들을 우리 DB 에서 조회. source_id 로 매칭 — RSS 수집기
  // (korea-kr.ts) 가 저장한 source_id 와 동일 값 사용.
  const allIds = Array.from(newsIdToTopics.keys());
  if (allIds.length === 0) {
    return { categories: TOPIC_CATEGORIES.length, matched: 0, updated: 0, errors, breakdown };
  }

  const { data: existing } = await supabase
    .from("news_posts")
    .select("id, source_id, topic_categories")
    .in("source_id", allIds);

  const existingRows = existing ?? [];

  // 각 row 마다 기존 topic_categories 와 이번 수집분을 병합해 업데이트.
  // DB round-trip 을 줄이려 row 별 개별 update 를 Promise.all 로 병렬화.
  let updated = 0;
  await Promise.all(
    existingRows.map(async (row) => {
      const newSet = newsIdToTopics.get(row.source_id);
      if (!newSet || newSet.size === 0) return;

      const existingArr: string[] = Array.isArray(row.topic_categories)
        ? row.topic_categories
        : [];
      const merged = Array.from(new Set([...existingArr, ...newSet])).sort();

      // 변경이 없으면 쓰기 스킵 (updated_at 오탁 방지)
      if (merged.length === existingArr.length && merged.every((t, i) => t === existingArr.sort()[i])) {
        return;
      }

      const { error } = await supabase
        .from("news_posts")
        .update({ topic_categories: merged })
        .eq("id", row.id);

      if (!error) updated++;
    }),
  );

  return {
    categories: TOPIC_CATEGORIES.length,
    matched: existingRows.length,
    updated,
    errors,
    breakdown,
  };
}
