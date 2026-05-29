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

// ── icn1 프록시 우회 (해외 GitHub Actions 전용) ──────────────────
// KEEPIOO_USE_PROXY 가 설정되면, 정부 도메인(.kr) 요청을 Vercel icn1(한국 IP)
// 프록시로 우회시킨다. 한국 IP(사장님 PC)에서는 이 변수를 안 켜므로 직접 접속.
// 이미지·CSS·폰트·미디어는 차단(본문 텍스트만 필요 → 프록시 부하·렌더 지연 제거).
const USE_PROXY = !!process.env.KEEPIOO_USE_PROXY;
const PROXY_URL = (process.env.KEEPIOO_API_URL || "") + "/api/internal/icn1-fetch";
const PROXY_KEY = process.env.KEEPIOO_API_KEY || "";
// 프록시 경유는 매 요청이 Vercel 왕복이라 느림 → networkidle 대신 domcontentloaded.
const NAV_WAIT = USE_PROXY ? "domcontentloaded" : "networkidle";
const LIST_TIMEOUT = USE_PROXY ? 45000 : 30000;
const DETAIL_TIMEOUT = USE_PROXY ? 35000 : 20000;

export async function installProxy(page) {
  if (!USE_PROXY) return;
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (["image", "stylesheet", "font", "media"].includes(req.resourceType())) {
      return route.abort();
    }
    let host;
    try {
      host = new URL(req.url()).hostname;
    } catch {
      return route.continue();
    }
    if (!host.endsWith(".kr")) return route.continue();
    try {
      const r = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "X-API-Key": PROXY_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          url: req.url(),
          method: req.method(),
          headers: req.headers(),
          postData: req.postData(),
        }),
      });
      if (!r.ok) return route.continue();
      const d = await r.json();
      await route.fulfill({
        status: d.status,
        headers: d.headers || {},
        body: Buffer.from(d.bodyB64, "base64"),
      });
    } catch {
      return route.continue();
    }
  });
}

// 2026-05-22 — 광범위 확장. 5 city SPA site 표준 selector 다양 대응.
// Playwright waitForSelector 가 OR list — 1개라도 매칭 시 진행.
export const LIST_SELECTORS = [
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

export const BODY_SELECTORS = [
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

// bodySelectors: 사이트별 본문 컨테이너 selector(미지정 시 범용 BODY_SELECTORS).
// listSelectors: 사이트별 목록 row selector(미지정 시 범용 LIST_SELECTORS).
//   사상소식지처럼 갤러리형(dl/dt) 등 범용 table/ul 패턴이 안 맞는 경우 지정.
// onclickIdRe + detailPath: 상세 링크가 href 가 아니라 onclick(예: dataView('384521'))인
//   큰 시(성남 등) 대응. onclick 에서 id 추출 → detailPath("bbsView.do?idx={id}") 로 GET URL 구성.
export function makeScraper({
  listUrl,
  cityName,
  bodySelectors = BODY_SELECTORS,
  listSelectors = LIST_SELECTORS,
  onclickIdRe = null,
  detailPath = null,
}) {
  return async function scrape({ limit = 10, headless = true } = {}) {
    const browser = await chromium.launch({ headless });
    const ctx = await browser.newContext({
      userAgent: USER_AGENT,
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
    });
    const page = await ctx.newPage();
    await installProxy(page);
    // 브라우저 콘솔의 [FACTORY] 진단 로그를 Node(Actions log)로 포워딩.
    page.on("console", (m) => {
      const t = m.text();
      if (t.includes("[FACTORY]")) console.log(t);
    });

    try {
      await page.goto(listUrl, { waitUntil: NAV_WAIT, timeout: LIST_TIMEOUT });
      // 프록시 모드(domcontentloaded)는 JS 렌더 목록(천안 .item--bodo 등)을 위해 고정 대기.
      // probe-city 가 waitForTimeout(1500)으로 잡은 것과 동일 — waitForSelector 만으론 미렌더.
      if (USE_PROXY) await page.waitForTimeout(2500);
      // 2026-05-22 — wait 시간 15s → 25s 확장 (느린 SPA 대응).
      // 프록시 모드는 CSS 를 abort 하므로 visible 판정 불가 → state:"attached"(존재만 확인).
      // selector 매칭 실패해도 evaluate 진행 (catch fallthrough).
      try {
        await page.waitForSelector(listSelectors.join(", "), {
          timeout: 25000,
          state: "attached",
        });
      } catch {
        console.error(`[${cityName}] waitForSelector timeout — fallthrough`);
      }

      // 범용 LIST_SELECTORS 는 레이아웃 table 오인 방지로 >3 가드. 사이트별 커스텀
      // listSelectors 는 정확한 selector 라 소량(구보 등 2~3건)도 신뢰 → >0 허용.
      const minRows = listSelectors === LIST_SELECTORS ? 3 : 0;
      const items = await page.evaluate(
        ({ selectors, limit, minRows, onclickIdRe, detailPath }) => {
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
            if (els.length > minRows) {
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
              let href = a ? a.getAttribute("href") : null;
              // onclick 기반 상세: ① a 의 href=#/javascript (성남 dataView)
              //   ② a 없고 button 등 [onclick] 요소 (천안 fn_search_detail). onclick 에서 id 추출 → URL.
              if (onclickIdRe) {
                const needOnclick =
                  !href || href.startsWith("#") || href.startsWith("javascript");
                if (needOnclick) {
                  const clickEl =
                    a && a.getAttribute("onclick") ? a : row.querySelector("[onclick]");
                  const oc = clickEl ? clickEl.getAttribute("onclick") || "" : "";
                  const mm = oc.match(new RegExp(onclickIdRe));
                  if (!mm) return null;
                  href = detailPath.replace("{id}", mm[1]);
                }
              }
              if (!href || href.startsWith("javascript:")) return null;
              const sourceUrl = href.startsWith("http")
                ? href
                : new URL(href, location.href).href;

              const titleEl =
                row.querySelector(".title, .subject, .tit") ?? a;
              let title = titleEl
                ? (titleEl.textContent || "").trim().replace(/\s+/g, " ")
                : "";
              // 제목 텍스트 요소가 없는 썸네일 카드(천안 등): img alt 에서 제목(" 이미지" 접미 제거)
              if (!title || title.length < 5) {
                const img = row.querySelector("img[alt]");
                if (img)
                  title = (img.getAttribute("alt") || "")
                    .replace(/\s*이미지\s*$/, "")
                    .trim();
              }
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
        { selectors: listSelectors, limit, minRows, onclickIdRe, detailPath },
      );

      const out = [];
      for (const item of items) {
        try {
          await page.goto(item.sourceUrl, {
            waitUntil: NAV_WAIT,
            timeout: DETAIL_TIMEOUT,
          });
          // 프록시 모드(domcontentloaded)는 본문 JS 주입을 위해 잠깐 더 대기
          if (USE_PROXY) await page.waitForTimeout(1000);
          const body = await page.evaluate((selectors) => {
            // 본문 아닌 UI 라벨 제거(범용): 이미지 첨부 접근성 라벨 + 포토갤러리 슬라이더 컨트롤.
            const stripUiLabels = (t) =>
              t
                .replace(/이미지\s*(확대보기|다운로드)/g, "")
                .replace(/포토갤러리\s*(정지|재생)/g, "")
                .replace(/\s+/g, " ")
                .trim();
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el) {
                // script/style 텍스트(inline JS 등)는 본문 아님 → 복제 후 제거.
                const clone = el.cloneNode(true);
                clone.querySelectorAll("script, style").forEach((s) => s.remove());
                const text = stripUiLabels(
                  (clone.textContent ?? "").replace(/\s+/g, " ").trim(),
                );
                if (text.length > 100) return text.slice(0, 5000);
              }
            }
            return null;
          }, bodySelectors);
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
