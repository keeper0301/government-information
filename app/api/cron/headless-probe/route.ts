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

    // 1) 목록 — 첫 상세 링크 추출 (networkidle: makeScraper 와 동일, JS 렌더 완료 대기)
    await page.goto(LIST_URL, { waitUntil: "networkidle", timeout: 30000 });
    const detailUrl = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll("a[href]")).find((x) =>
        /BD_selectBbs\.do\?[^"']*q_bbscttSn=\d/.test(x.getAttribute("href") || ""),
      );
      return a ? (a as HTMLAnchorElement).href : null;
    });
    if (!detailUrl) {
      return NextResponse.json({
        ok: false,
        step: "list",
        msg: "상세 링크 미발견 (목록 렌더 실패 가능)",
        ms: Date.now() - t0,
      });
    }

    // 2) 상세 — 본문 추출 (networkidle: 본문이 JS 로 늦게 렌더되는 사이트 대응)
    await page.goto(detailUrl, { waitUntil: "networkidle", timeout: 25000 });
    const body = await page.evaluate((sels) => {
      for (const s of sels) {
        const el = document.querySelector(s);
        if (el) {
          const t = (el.textContent || "").replace(/\s+/g, " ").trim();
          if (t.length > 100) return t.slice(0, 600);
        }
      }
      return null;
    }, BODY_SELECTORS);

    return NextResponse.json({
      ok: !!body,
      detailUrl,
      bodyLen: body ? body.length : 0,
      bodyPreview: body ? body.slice(0, 250) : null,
      ms: Date.now() - t0,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message, ms: Date.now() - t0 },
      { status: 500 },
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
