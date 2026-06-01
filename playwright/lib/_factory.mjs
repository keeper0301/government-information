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

// stripUiLabels / stripTitleBadges — evaluate 안 인라인 정의의 단위 테스트용 export.
// ※ evaluate 인라인 코드와 정규식 동기화 필수 (browser context 에서 외부 함수 호출 불가).
// 이 두 함수만 단위 테스트로 silent 회귀 방어. 변경 시 evaluate 안 인라인 같이 갱신.
// ※ 분리 trigger: stripUiLabels 안 도시-specific 패턴(<사진 설명> 등)이 3개 이상 누적되면
//   factory 옵션 `cityStripPatterns: []` opt-in 으로 분리. 현재 1개(<사진 설명>=김포)라 미진행.
export const stripUiLabels = (t) =>
  t
    .replace(/(이미지|사진)\s*(확대보기|다운로드)/g, "")
    .replace(/포토갤러리\s*(정지|재생)/g, "")
    .replace(/<\s*사진\s*설명\s*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const stripTitleBadges = (t) =>
  t.replace(/\s+(새\s*글|NEW)\s*$/, "").trim();

// list row 날짜 추출. 4자리 연도(2026-05-18) 우선 + 2자리 연도(부산 SI 자치구 YY.MM.DD,
// 예 26.05.18)도 20 접두로 지원. month 1-12·day 1-31 범위 검증으로 비-날짜 숫자
// (버전·IP·시각 등) 오매칭 차단. 미매칭/범위 밖이면 null → published_at=now() fallback.
// ※ evaluate 안 인라인 코드와 동기화 필수 (browser context 에서 외부 함수 호출 불가).
export function parseListDate(dateText) {
  const m = (dateText || "").match(/(\d{4}|\d{2})[.\-](\d{2})[.\-](\d{2})/);
  if (!m) return null;
  const mm = parseInt(m[2], 10);
  const dd = parseInt(m[3], 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const year = m[1].length === 2 ? `20${m[1]}` : m[1];
  return `${year}-${m[2]}-${m[3]}`;
}

// 도시별 titleSelectors 미지정 시 default. LIST_SELECTORS / BODY_SELECTORS 와 같은
// 모듈 export 상수로 통일(이전 inline default 에서 추출). 새 도시 추가 시 여기 확장.
export const TITLE_SELECTORS = [".title", ".subject", ".tit"];

// 2026-05-30 본문 채택 임계. 이전 100 → 250 상향. 100~249자 짧은 알림(첨부+한줄
// 안내)은 정책 가이드 가치 미미해 AdSense thin content 페널티 표면 ↓. 한 곳만
// 변경하면 wait/pickLongest/단일매치 분기 모두 동기화. (sanitize body cap 과 일치)
export const BODY_MIN_LEN = 250;

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
// userAgent: 일부 사이트(천안 등)는 keepioo-bot UA 를 차단 → 진짜 Chrome UA 필요. 사이트별 지정.
export function makeScraper({
  listUrl,
  cityName,
  bodySelectors = BODY_SELECTORS,
  listSelectors = LIST_SELECTORS,
  onclickIdRe = null,
  detailPath = null,
  userAgent = USER_AGENT,
  bodyPickLongest = false,
  titleSelectors = TITLE_SELECTORS,
}) {
  return async function scrape({ limit = 10, headless = true } = {}) {
    const browser = await chromium.launch({ headless });
    const ctx = await browser.newContext({
      userAgent,
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
        ({ selectors, limit, minRows, onclickIdRe, detailPath, titleSelectors }) => {
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
                row.querySelector(titleSelectors.join(", ")) ?? a;
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
              // title 끝의 "새 글"/"NEW" 임시 배지(li 안 자식 요소 텍스트로 끼는 case,
              // 창원 strong.t1 안 i.ic1.new 등) strip. 대문자만(소문자 new/New 는 영문 제목
              // 자연어로 자주 등장 → 잘림 방지).
              title = title.replace(/\s+(새\s*글|NEW)\s*$/, "").trim();
              if (!title || title.length < 5) return null;

              const dateText = (
                row.querySelector("td.date, .date, .reg, td.td-date")
                  ?.textContent ?? row.textContent ?? ""
              ).trim();
              // ※ parseListDate(_factory export)와 동기화. 4자리 우선 + 2자리 연도(20
              // 접두) + month/day 범위 검증으로 비-날짜 숫자 오매칭 차단.
              const dm = dateText.match(/(\d{4}|\d{2})[.\-](\d{2})[.\-](\d{2})/);
              let publishedDate = null;
              if (dm) {
                const mm = parseInt(dm[2], 10);
                const dd = parseInt(dm[3], 10);
                if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
                  const yr = dm[1].length === 2 ? `20${dm[1]}` : dm[1];
                  publishedDate = `${yr}-${dm[2]}-${dm[3]}`;
                }
              }

              return { title, sourceUrl, publishedDate };
            })
            .filter(Boolean);
        },
        { selectors: listSelectors, limit, minRows, onclickIdRe, detailPath, titleSelectors },
      );

      const out = [];
      for (const item of items) {
        try {
          await page.goto(item.sourceUrl, {
            waitUntil: NAV_WAIT,
            timeout: DETAIL_TIMEOUT,
          });
          // 프록시 모드(domcontentloaded)는 본문이 JS 로 동적 주입될 수 있음(안산 등).
          // 본문 selector 가 100자 넘을 때까지 대기(채워지면 즉시 통과, 최대 8s). 못 채우면 진행.
          if (USE_PROXY) {
            await page
              .waitForFunction(
                ({ sels, pickLongest, minLen }) =>
                  sels.some((s) => {
                    // pickLongest 면 첫 매치가 본문이 아닐 수 있어(안산 제목/날짜/본문 동일 selector)
                    // 매치 전체를 훑어 하나라도 minLen 자 넘으면 통과.
                    const els = pickLongest
                      ? document.querySelectorAll(s)
                      : [document.querySelector(s)].filter(Boolean);
                    return [...els].some(
                      (e) => (e.textContent || "").trim().length > minLen,
                    );
                  }),
                { sels: bodySelectors, pickLongest: bodyPickLongest, minLen: BODY_MIN_LEN },
                { timeout: 8000 },
              )
              .catch(() => {});
          }
          const body = await page.evaluate(
            ({ selectors, pickLongest, minLen }) => {
              // 본문 아닌 UI 라벨 제거(범용): 이미지 첨부 접근성 라벨 + 포토갤러리 슬라이더 컨트롤.
              const stripUiLabels = (t) =>
                t
                  .replace(/(이미지|사진)\s*(확대보기|다운로드)/g, "")
                  .replace(/포토갤러리\s*(정지|재생)/g, "")
                  // 김포 본문 끝의 "<사진 설명> [캡션]" 라벨만 제거 (캡션 텍스트는 보존).
                  .replace(/<\s*사진\s*설명\s*>/g, "")
                  .replace(/\s+/g, " ")
                  .trim();
              const textOf = (el) => {
                // script/style 텍스트(inline JS 등)는 본문 아님 → 복제 후 제거.
                const clone = el.cloneNode(true);
                clone.querySelectorAll("script, style").forEach((s) => s.remove());
                return stripUiLabels(
                  (clone.textContent ?? "").replace(/\s+/g, " ").trim(),
                );
              };
              for (const sel of selectors) {
                if (pickLongest) {
                  // 같은 selector 가 여러 요소를 매칭하고 본문이 첫 매치가 아닐 때(안산: 제목/날짜/
                  // 본문이 모두 .p-table__subject td) → 가장 긴 매치를 본문으로 채택.
                  let best = null;
                  for (const el of document.querySelectorAll(sel)) {
                    const t = textOf(el);
                    if (!best || t.length > best.length) best = t;
                  }
                  if (best && best.length > minLen) return best.slice(0, 5000);
                } else {
                  const el = document.querySelector(sel);
                  if (el) {
                    const text = textOf(el);
                    if (text.length > minLen) return text.slice(0, 5000);
                  }
                }
              }
              return null;
            },
            { selectors: bodySelectors, pickLongest: bodyPickLongest, minLen: BODY_MIN_LEN },
          );
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
