// ============================================================
// 서대문구청 구정뉴스 수집 (2026-06-01) — 서울 자치구 확장
// ============================================================
// 인구 30만. ⚠️ 사이트 charset = EUC-KR (factory encoding:"euc-kr" opt-in 사용).
// 보도자료 메뉴(report.do)는 "서대문구보"(주간 PDF 소식지)라 본문 텍스트 없음 → 부적합.
// 개별 기사형 게시판 = /news/news.do (구정 새소식: 모집·공고·행사 등).
//
// list anchor: <a href="javascript:goView('312072');" title="제목">제목</a>
//   → goView(seq) 가 #frm 에 mode=view&sdmBoardSeq=seq 넣고 submit.
//   GET 으로도 동일 응답: /news/news.do?mode=view&sdmBoardSeq=N
// 날짜: 같은 row 의 td (anchor 뒤 부서 td 다음) YYYY.MM.DD.
// 본문: <td class="viewCon" id="viewCon"> 셀 (HWP 붙여넣기 — 중첩 table td-depth 추적).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.sdm.go.kr";
const LIST_URL = `${BASE_URL}/news/news.do`;

// goView('seq') anchor + 앵커 안 제목 텍스트.
const LIST_ITEM_REGEX =
  /<a[^>]*href="javascript:goView\('(\d+)'\)[^"]*"[^>]*>([\s\S]{0,200}?)<\/a>/g;

const DATE_REGEX = /(\d{4})\.(\d{2})\.(\d{2})/;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = decodeBasicEntities(
      m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " "),
    ).trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    // 같은 row 의 작성일 td (부서 td 다음). 부서명 길이 편차로 +800자 buffer
    // (500 이면 부서명 긴 row 의 날짜 누락 → published_at=now fallback 부정확).
    const slice = html.slice(m.index, m.index + 800);
    const d = DATE_REGEX.exec(slice);
    const publishedDate = d ? `${d[1]}-${d[2]}-${d[3]}` : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/news/news.do?mode=view&sdmBoardSeq=${seq}`,
    });
  }
  return items;
}

// 본문 셀 <td class="viewCon"> — open 태그 (class 또는 id viewCon).
const VIEWCON_OPEN_REGEX =
  /<td[^>]*\b(?:class|id)="viewCon"[^>]*>/i;

export function parseDetailBody(html: string): string | null {
  const open = VIEWCON_OPEN_REGEX.exec(html);
  if (!open) return null;
  // 본문 셀 open ~ 매칭되는 </td> 까지 (HWP 중첩 table td 깊이 추적).
  const start = open.index + open[0].length;
  const tagRe = /<(\/?)td\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 1;
  let raw: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    if (m[1] === "/") {
      depth -= 1;
      if (depth === 0) {
        raw = html.slice(start, m.index);
        break;
      }
    } else {
      depth += 1;
    }
  }
  if (raw === null) return null; // 닫는 </td> 없음(응답 잘림) → junk 방지

  const text = decodeBasicEntities(
    raw
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  // 2026-06-01 리뷰 — 본문 min 50 → 250 (AGENTS.md 룰·thin content/AdSense 방지 통일).
  if (!/[가-힣]/.test(text) || text.length < 250) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeSeodaemunAndInsert } =
  createPressCollector({
    cityName: "서대문구",
    region: "서울",
    ministry: "서대문구청",
    sourceOutlet: "서대문구청",
    sourceCode: "local-press-seodaemun",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
    encoding: "euc-kr",
  });
