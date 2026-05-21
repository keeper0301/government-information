// ============================================================
// Playwright collector factory — 시청 보도자료 SPA 표준 scrape
// ============================================================
// 표준 정부 site CMS (eGovFrame 기반) 가 보통 동일 selector 후보군 사용:
//   list:  table.boardList / ul.bbs_list / .board_list / table tbody tr
//   body:  .view_cont / .board_view / .bbs_view / .bbs_content / .content_view
//
// 각 시청 collector 는 listUrl + cityKey 만 정의. selector 분기는 factory.
// ============================================================

import { chromium } from "playwright";

const USER_AGENT =
  "Mozilla/5.0 (compatible; keepioo-bot/1.0; +https://www.keepioo.com)";

// 2026-05-22 — 광범위 확장. 5 city SPA site 표준 selector 다양 대응.
// Playwright waitForSelector 가 OR list — 1개라도 매칭 시 진행.
const LIST_SELECTORS = [
  "table.boardList tbody tr",
  "table.tbl_basic tbody tr",
  "table.board_list tbody tr",
  "table[class*='board'] tbody tr",
  "ul.bbs_list li",
  "ul.board_list li",
  "ul[class*='news'] li",
  "ul[class*='press'] li",
  "ul[class*='list'] li[class*='item']",
  ".board_list li",
  ".board-list li",
  ".news-list li",
  ".press-list li",
  "div[class*='board-list'] li",
  "div[class*='news-list'] li",
  // fallback 최후 — 단일 table 의 tbody tr (false positive 가능, length>3 가드)
  "table tbody tr",
];

const BODY_SELECTORS = [
  ".view_cont",
  ".board_view",
  ".board_view_body",
  ".board_view_contents",
  ".bbs_view",
  ".bbs_view_content",
  ".bbs_content",
  ".content_view",
  ".board_txt",
  ".view_con",
  ".board-view-contents",
  ".article-contents",
  ".se-contents",
  "[class*='view_content']",
  "[class*='cont_box']",
  "[class*='view-content']",
  "[class*='board-view']",
  "[id='articleContents']",
  "#contents .content",
];

export function makeScraper({ listUrl, cityName }) {
  return async function scrape({ limit = 10, headless = true } = {}) {
    const browser = await chromium.launch({ headless });
    const ctx = await browser.newContext({
      userAgent: USER_AGENT,
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
    });
    const page = await ctx.newPage();

    try {
      await page.goto(listUrl, { waitUntil: "networkidle", timeout: 30000 });
      // 2026-05-22 — wait 시간 15s → 25s 확장 (느린 SPA 대응).
      // selector 매칭 실패해도 evaluate 진행 (catch fallthrough).
      try {
        await page.waitForSelector(LIST_SELECTORS.join(", "), {
          timeout: 25000,
        });
      } catch (e) {
        console.error(`[${cityName}] waitForSelector timeout — fallthrough`);
      }

      const items = await page.evaluate(
        ({ selectors, limit }) => {
          let rows = [];
          let chosen = null;
          // 2026-05-22 debug — 각 selector 매칭 count 기록 (Actions log).
          const counts = {};
          for (const sel of selectors) {
            try {
              const c = document.querySelectorAll(sel).length;
              counts[sel] = c;
            } catch {}
          }
          for (const sel of selectors) {
            const els = document.querySelectorAll(sel);
            if (els.length > 3) {
              rows = Array.from(els);
              chosen = sel;
              break;
            }
          }
          // 매칭 0 일 시 debug info 반환 (runner 가 stderr 출력)
          if (rows.length === 0) {
            console.log(`[FACTORY] no list selector matched. counts=${JSON.stringify(counts)}`);
            return [];
          }
          console.log(`[FACTORY] list selector "${chosen}" matched ${rows.length} rows`);

          return rows
            .slice(0, limit)
            .map((row) => {
              const a = row.querySelector("a[href]");
              if (!a) return null;
              const href = a.getAttribute("href");
              if (!href || href.startsWith("javascript:")) return null;
              const sourceUrl = href.startsWith("http")
                ? href
                : new URL(href, location.href).href;

              const titleEl =
                row.querySelector(".title, .subject, .tit") ?? a;
              const title = (titleEl.textContent || "")
                .trim()
                .replace(/\s+/g, " ");
              if (!title || title.length < 5) return null;

              const dateText = (
                row.querySelector("td.date, .date, .reg, td.td-date")
                  ?.textContent ?? row.textContent ?? ""
              ).trim();
              const m = dateText.match(/(\d{4})[.\-](\d{2})[.\-](\d{2})/);
              const publishedDate = m ? `${m[1]}-${m[2]}-${m[3]}` : null;

              return { title, sourceUrl, publishedDate };
            })
            .filter(Boolean);
        },
        { selectors: LIST_SELECTORS, limit },
      );

      const out = [];
      for (const item of items) {
        try {
          await page.goto(item.sourceUrl, {
            waitUntil: "networkidle",
            timeout: 20000,
          });
          const body = await page.evaluate((selectors) => {
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el) {
                const text = (el.textContent ?? "")
                  .trim()
                  .replace(/\s+/g, " ");
                if (text.length > 100) return text.slice(0, 5000);
              }
            }
            return null;
          }, BODY_SELECTORS);
          if (body) out.push({ ...item, body });
        } catch (e) {
          console.error(
            `[${cityName}] detail fail: ${item.sourceUrl} — ${e.message}`,
          );
        }
      }

      return out;
    } finally {
      await browser.close();
    }
  };
}
