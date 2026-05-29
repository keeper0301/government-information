// ============================================================
// 도시 온보딩 진단 도구 — list/body selector 매칭 조사
// ============================================================
// 신규 도시를 프록시 경로에 추가하기 전, factory 의 LIST/BODY_SELECTORS 가
// 해당 사이트에 맞는지 GitHub Actions(해외 IP) + icn1 프록시 경로로 확인한다.
//
// 입력(env):
//   PROBE_LIST_URL    조사할 목록 페이지 URL (필수)
//   KEEPIOO_API_URL   프록시 base (필수)
//   KEEPIOO_API_KEY   프록시 인증 (필수)
//   KEEPIOO_USE_PROXY 워크플로우에서 "1" 설정 (프록시 경유)
//
// 출력: list selector 별 매칭 수, 첫 row 들의 a[href], 상세 본문 후보 컨테이너.
// ============================================================

import { chromium } from "playwright";
import { LIST_SELECTORS, BODY_SELECTORS, installProxy } from "./lib/_factory.mjs";

const LIST_URL = process.env.PROBE_LIST_URL;
if (!LIST_URL) {
  console.error("PROBE_LIST_URL 환경변수가 필요합니다.");
  process.exit(1);
}
// PROBE_LIST_SELECTORS (쉼표) 가 있으면 그 목록 selector 로 진단(비표준 갤러리/위젯 혼재 사이트).
const CUSTOM_LIST = process.env.PROBE_LIST_SELECTORS;
const LIST_SELS = CUSTOM_LIST ? CUSTOM_LIST.split(",").map((s) => s.trim()) : LIST_SELECTORS;
const MIN_ROWS = CUSTOM_LIST ? 0 : 3;
const NAV_WAIT = process.env.KEEPIOO_USE_PROXY ? "domcontentloaded" : "networkidle";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
});
const page = await ctx.newPage();
await installProxy(page);

try {
  await page.goto(LIST_URL, { waitUntil: NAV_WAIT, timeout: 45000 });
  await page.waitForTimeout(1500);

  // ── list selector 진단 ──
  const listDiag = await page.evaluate(({ selectors, minRows }) => {
    const counts = {};
    let chosen = null;
    for (const sel of selectors) {
      let c = 0;
      try { c = document.querySelectorAll(sel).length; } catch {}
      counts[sel] = c;
      if (!chosen && c > minRows) chosen = sel;
    }
    let firstFull = [];
    if (chosen) {
      const rows = [...document.querySelectorAll(chosen)].slice(0, 5);
      firstFull = rows.map((r) => {
        const a = r.querySelector("a[href]");
        return a ? a.getAttribute("href") || "" : "";
      });
    }
    // firstLinks 는 표시용(90자), firstFull 은 navigate 용(전체)
    return { counts, chosen, firstLinks: firstFull.map((h) => h.slice(0, 90) || "(a 없음)"), firstFull };
  }, { selectors: LIST_SELS, minRows: MIN_ROWS });

  console.log("=== LIST 진단 ===");
  console.log("선택된 selector:", listDiag.chosen || "(없음 — list 미매칭!)");
  for (const [sel, c] of Object.entries(listDiag.counts)) {
    if (c > 0) console.log(`  ${c.toString().padStart(3)}개  ${sel}`);
  }
  console.log("첫 row a[href]:");
  listDiag.firstLinks.forEach((h) => console.log("  -", h));

  // ── 첫 상세 링크로 본문 진단 (자르지 않은 full href 사용) ──
  const detailHref = (listDiag.firstFull || []).find((h) => h && !h.startsWith("javascript:"));
  if (!detailHref) {
    console.log("상세 링크 없음 — list 단계에서 실패.");
    process.exit(0);
  }
  const detailUrl = detailHref.startsWith("http") ? detailHref : new URL(detailHref, LIST_URL).href;
  await page.goto(detailUrl, { waitUntil: NAV_WAIT, timeout: 35000 });
  await page.waitForTimeout(1500);

  const bodyDiag = await page.evaluate((selectors) => {
    // factory BODY_SELECTORS 중 매칭되는 것
    let matched = null;
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (t.length > 100) { matched = { sel, len: t.length }; break; }
      }
    }
    // 본문 후보 컨테이너(길이순)
    const cand = [];
    document.querySelectorAll("div,td,article,section").forEach((el) => {
      const id = el.id || "";
      const cls = typeof el.className === "string" ? el.className : "";
      if (!/board|view|cont|bbs|article|txt|content/i.test(id + " " + cls)) return;
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (t.length < 150) return;
      const sel = el.tagName.toLowerCase() + (id ? "#" + id : "") + (cls ? "." + cls.trim().split(/\s+/).join(".") : "");
      cand.push({ sel: sel.slice(0, 70), len: t.length });
    });
    cand.sort((a, b) => a.len - b.len);
    return { matched, cand: cand.slice(0, 12) };
  }, BODY_SELECTORS);

  console.log("=== BODY 진단 (" + detailUrl.slice(0, 80) + ") ===");
  console.log("factory BODY_SELECTORS 매칭:", bodyDiag.matched ? `${bodyDiag.matched.sel} (${bodyDiag.matched.len}자)` : "(없음 — 본문 미매칭!)");
  console.log("본문 후보 컨테이너(짧은 순):");
  bodyDiag.cand.forEach((c) => console.log(`  len=${c.len} ${c.sel}`));
} catch (e) {
  console.log("ERR", e.message.slice(0, 150));
}
await browser.close();
