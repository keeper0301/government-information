// ============================================================
// /api/cron/headless-probe — Vercel 서버리스 headless 가능 검증 (임시 probe)
// ============================================================
// 목적: @sparticuz/chromium + playwright-core 가 Vercel(icn1 한국 IP) 에서
// 한국 정부 사이트(JS 렌더)를 실제로 렌더·본문 추출하는지 1회성 검증.
// 검증 끝나면 삭제. 인증: CRON_SECRET Bearer.
// 패턴 출처: lib/naver-blog/publisher.ts (이 코드베이스의 검증된 chromium launch).
// ============================================================

import { NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import { chromium as playwright } from "playwright-core";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 노원(검증된 사이트) — 정적은 본문 elusive 였으나 로컬 Playwright 로 1637자 추출됨.
const LIST_URL =
  "https://www.nowon.kr/www/user/bbs/BD_selectBbsList.do?q_bbsCode=1027";

// makeScraper(playwright/lib/_factory.mjs) 와 동일한 본문 selector 후보.
const BODY_SELECTORS = [
  ".view_cont", ".board_view", ".board_view_body", ".board_view_contents",
  ".bbs_view", ".bbs_view_content", ".bbs_content", ".content_view",
  ".board_txt", ".view_con", ".board-view-contents", ".article-contents",
  "[class*='view_content']", "[class*='cont_box']", "[class*='board-view']",
  "[id='articleContents']", "#contents .content",
];

export async function GET(request: Request) {
  const authErr = authorizeCronRequest(request);
  if (authErr) return authErr;

  const t0 = Date.now();
  let browser: Awaited<ReturnType<typeof playwright.launch>> | null = null;
  try {
    browser = await playwright.launch({
      args: [...chromium.args],
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const ctx = await browser.newContext({
      userAgent: UA,
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
    });
    const page = await ctx.newPage();

    // 1) 목록 — 상세 링크 3개 추출
    await page.goto(LIST_URL, { waitUntil: "networkidle", timeout: 30000 });
    const detailUrls: string[] = await page.evaluate(() => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const x of Array.from(document.querySelectorAll("a[href]"))) {
        const h = (x as HTMLAnchorElement).href;
        if (/BD_selectBbs\.do\?[^"']*q_bbscttSn=\d/.test(x.getAttribute("href") || "")) {
          if (!seen.has(h)) { seen.add(h); out.push(h); }
        }
      }
      return out.slice(0, 3);
    });
    if (detailUrls.length === 0) {
      return NextResponse.json({ ok: false, step: "list", msg: "상세 링크 0", ms: Date.now() - t0 });
    }

    // 2) 상세 3개 진단 — 자원 문제 회피 위해 domcontentloaded + 고정 대기
    const diags = [];
    for (const url of detailUrls) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(5000); // JS 본문 렌더 대기
        const d = await page.evaluate(() => {
          // 렌더된 DOM 의 한글 150+ 요소 전수 (class/tag/ko) — 본문 컨테이너 식별용.
          // 부모-자식 중복 제거 위해, 자식이 같은 ko 면 부모 skip (가장 깊은 컨테이너 우선).
          const out: { c: string; t: string; ko: number }[] = [];
          for (const el of Array.from(document.querySelectorAll("div,td,article,section,p"))) {
            const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
            const ko = (txt.match(/[가-힣]/g) || []).length;
            if (ko < 150) continue;
            const c = (((el as HTMLElement).className || "") + "#" + ((el as HTMLElement).id || "")).toString().slice(0, 50);
            out.push({ c, t: el.tagName, ko });
          }
          // ko 작은 순(=본문에 가까운 깊은 요소) 8개
          out.sort((a, b) => a.ko - b.ko);
          return out.slice(0, 10);
        });
        diags.push({ url: url.slice(-40), els: d });
      } catch (e) {
        diags.push({ url: url.slice(-40), error: (e as Error).message.slice(0, 60) });
      }
    }
    return NextResponse.json({ ok: true, count: detailUrls.length, diags, ms: Date.now() - t0 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message, ms: Date.now() - t0 },
      { status: 500 },
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
