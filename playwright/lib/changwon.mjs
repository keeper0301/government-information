// ============================================================
// 창원시 보도자료 collector — Playwright (2026-05-21, #45 1차)
// ============================================================
// 창원시청 보도자료는 AJAX 로 list 항목 렌더링 (정적 fetch 0 items).
// → 헤드리스 chromium 으로 list page 렌더링 후 selector 추출.
//
// URL:
//   list:   https://www.changwon.go.kr/cwportal/10310/10429/10432.web
//   상세:   같은 path + 게시판 detail link
//
// 호출:
//   const items = await scrapeChangwon({ limit: 10 });
//   items[i]: { title, sourceUrl, publishedDate, body }
//
// 다음 단계 (runner.mjs):
//   items → POST /api/admin/import-press-batch
// ============================================================

import { chromium } from "playwright";

const LIST_URL = "https://www.changwon.go.kr/cwportal/10310/10429/10432.web";

export async function scrapeChangwon({ limit = 10, headless = true } = {}) {
  const browser = await chromium.launch({ headless });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (compatible; keepioo-bot/1.0; +https://www.keepioo.com)",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  const page = await ctx.newPage();

  try {
    await page.goto(LIST_URL, { waitUntil: "networkidle", timeout: 30000 });
    // 보도자료 list table 렌더링 대기. 표준 selector 후보 우선순위:
    await page.waitForSelector(
      [
        "table.boardList tbody tr",
        "ul.bbs_list li",
        ".board_list li",
        "table tbody tr",
      ].join(", "),
      { timeout: 15000 },
    );

    // list 항목 추출 — title, detail href, 등록일.
    const items = await page.evaluate((limit) => {
      // 첫 번째 안 보이면 다음 selector 시도.
      const selectorSets = [
        "table.boardList tbody tr",
        "ul.bbs_list li",
        ".board_list li",
        "table tbody tr",
      ];
      let rows = [];
      for (const sel of selectorSets) {
        const els = document.querySelectorAll(sel);
        if (els.length > 3) {
          rows = Array.from(els);
          break;
        }
      }
      if (rows.length === 0) return [];

      return rows
        .slice(0, limit)
        .map((row) => {
          const a = row.querySelector("a[href]");
          if (!a) return null;
          const href = a.getAttribute("href");
          if (!href) return null;
          const sourceUrl = href.startsWith("http")
            ? href
            : new URL(href, location.href).href;

          // title: a 텍스트 또는 .title / .subject 자식
          const titleEl =
            row.querySelector(".title, .subject, .tit") ?? a;
          const title = (titleEl.textContent || "").trim().replace(/\s+/g, " ");
          if (!title || title.length < 5) return null;

          // 등록일: tds 또는 .date / .reg
          const dateEl = row.querySelector("td.date, .date, .reg, td.td-date");
          let publishedDate = null;
          const dateText = (dateEl?.textContent || row.textContent || "").trim();
          const m = dateText.match(/(\d{4})[.\-](\d{2})[.\-](\d{2})/);
          if (m) publishedDate = `${m[1]}-${m[2]}-${m[3]}`;

          return { title, sourceUrl, publishedDate };
        })
        .filter(Boolean);
    }, limit);

    // 상세 page 본문 추출 — 각 항목 fetch
    const out = [];
    for (const item of items) {
      try {
        await page.goto(item.sourceUrl, {
          waitUntil: "networkidle",
          timeout: 20000,
        });
        // 본문 selector 후보 — 정부 사이트 표준
        const body = await page.evaluate(() => {
          const candidates = [
            ".view_cont",
            ".board_view",
            ".bbs_view",
            ".bbs_content",
            ".content_view",
            "[class*='view_content']",
            "[class*='cont_box']",
          ];
          for (const sel of candidates) {
            const el = document.querySelector(sel);
            if (el) {
              const text = el.textContent?.trim().replace(/\s+/g, " ") ?? "";
              if (text.length > 100) return text.slice(0, 5000);
            }
          }
          return null;
        });
        if (body) out.push({ ...item, body });
      } catch (e) {
        // 1 항목 실패는 skip (다른 항목 진행)
        // eslint-disable-next-line no-console
        console.error(`[changwon] detail fail: ${item.sourceUrl} — ${e.message}`);
      }
    }

    return out;
  } finally {
    await browser.close();
  }
}

// node 직접 실행 — manual test
if (import.meta.url === `file://${process.argv[1]}`) {
  const items = await scrapeChangwon({ limit: 3, headless: true });
  // eslint-disable-next-line no-console
  console.log(`fetched ${items.length} items`);
  for (const it of items) {
    // eslint-disable-next-line no-console
    console.log(`  ${it.publishedDate ?? "-"} | ${it.title.slice(0, 60)}`);
    // eslint-disable-next-line no-console
    console.log(`    body ${it.body.length}자: ${it.body.slice(0, 80)}...`);
  }
}
