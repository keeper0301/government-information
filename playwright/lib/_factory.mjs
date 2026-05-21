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

const LIST_SELECTORS = [
  "table.boardList tbody tr",
  "ul.bbs_list li",
  ".board_list li",
  ".board-list li",
  "table.tbl_basic tbody tr",
  "table tbody tr",
];

const BODY_SELECTORS = [
  ".view_cont",
  ".board_view",
  ".bbs_view",
  ".bbs_content",
  ".content_view",
  "[class*='view_content']",
  "[class*='cont_box']",
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
      await page.waitForSelector(LIST_SELECTORS.join(", "), {
        timeout: 15000,
      });

      const items = await page.evaluate(
        ({ selectors, limit }) => {
          let rows = [];
          for (const sel of selectors) {
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
