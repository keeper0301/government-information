// ============================================================
// /api/cron/headless-probe — Vercel 서버리스 headless 본문 추출 검증 (임시)
// ============================================================
// 전략: nav(gnb/lnb/menu/footer...) 밖의 <p> 텍스트만 모으면 본문.
// 정부 보도자료 본문은 <p>(워드 export) 기반, 메뉴는 <a>/<li> 라 분리됨.
// CRON_SECRET 인증. 검증 후 삭제.
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
const LIST_URL =
  "https://www.nowon.kr/www/user/bbs/BD_selectBbsList.do?q_bbsCode=1027";

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
    const ctx = await browser.newContext({ userAgent: UA, locale: "ko-KR", timezoneId: "Asia/Seoul" });
    const page = await ctx.newPage();

    await page.goto(LIST_URL, { waitUntil: "networkidle", timeout: 30000 });
    const detailUrls: string[] = await page.evaluate(() => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const x of Array.from(document.querySelectorAll("a[href]"))) {
        if (/BD_selectBbs\.do\?[^"']*q_bbscttSn=\d/.test(x.getAttribute("href") || "")) {
          const h = (x as HTMLAnchorElement).href;
          if (!seen.has(h)) { seen.add(h); out.push(h); }
        }
      }
      return out.slice(0, 3);
    });
    if (detailUrls.length === 0) return NextResponse.json({ ok: false, step: "list" });

    const diags = [];
    for (const url of detailUrls) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(4000);
      const body = await page.evaluate(() => {
        // MS워드 export 본문 단락 = <p class="0">. 제목(커스텀폰트)·메타·JS·nav 자동 제외.
        const p0 = Array.from(document.querySelectorAll("p"))
          .filter((p) => p.getAttribute("class") === "0")
          .map((p) => p.textContent || "")
          .join("\n");
        if (p0.replace(/\s/g, "").length >= 50) {
          return { strategy: "p0", text: p0.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim() };
        }
        // fallback: nav 밖 leaf <p>
        const NAV = /gnb|lnb|nav|menu|header|footer|skip|aside|sitemap|relate|quick|foot|btn/i;
        const inNav = (el: Element | null): boolean => {
          let n: Element | null = el;
          while (n) { if (NAV.test((((n as HTMLElement).className || "") + "#" + ((n as HTMLElement).id || "")).toString())) return true; n = n.parentElement; }
          return false;
        };
        const ps = Array.from(document.querySelectorAll("p")).filter((p) => !inNav(p) && !p.querySelector("script"));
        return { strategy: "leafp", text: ps.map((p) => p.textContent || "").join("\n").replace(/[ \t]+/g, " ").trim() };
      });
      const bodyText = body.text;
      const koCount = (bodyText.match(/[가-힣]/g) || []).length;
      diags.push({ url: url.slice(-30), strategy: body.strategy, bodyLen: bodyText.length, ko: koCount, preview: bodyText.slice(0, 160) });
    }
    return NextResponse.json({ ok: true, diags, ms: Date.now() - t0 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message.slice(0, 120), ms: Date.now() - t0 }, { status: 500 });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
