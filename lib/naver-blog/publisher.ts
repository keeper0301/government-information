// ============================================================
// 네이버 블로그 RPA — Playwright 자동 발행
// ============================================================
// SmartEditor (SE3) 자동화. mainFrame + 내부 iframe 2단계 진입 → 제목·본문
// 입력 → 4중 fallback 저장 → 2단계 발행 → URL 캡처.
//
// Vercel serverless 가동:
//   - playwright-core (chromium 바이너리 X)
//   - @sparticuz/chromium (Linux serverless 용 50MB chromium)
//
// fragile point: 네이버 UI 변경 시 selector 깨짐. selector 모니터링 cron 별도.
// ============================================================

import chromium from "@sparticuz/chromium";
import {
  chromium as playwright,
  type Browser,
  type BrowserContext,
  type FrameLocator,
  type Page,
} from "playwright-core";
import type { NaverCookie } from "./cookies-vault";

// 일반 Chrome 처럼 보이기 위한 UA (자동화 표시 hide 와 함께)
const HUMAN_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const NAVER_WRITE_URL = "https://blog.naver.com/GoBlogWrite.naver";
const NAVER_HOME_URL = "https://www.naver.com";

// SE3 selector — spec 의 BublBot 정찰 결과 기반. 깨질 가능성 있음.
const SE3_TITLE = "span.se-fs32.__se-node";
const SE3_BODY = "p.se-text-paragraph";

// 저장 4중 fallback (가장 안정 → 최종)
const SAVE_BUTTONS = [
  '//button[@data-click-area="tpb.save"]',
  "button.save_btn__bzc5B",
  '//button[contains(@class,"save_btn")]',
  '//button[.//span[text()="저장"]]',
];

export type PublishOptions = {
  /** 네이버 글쓰기 페이지 제목 — 평문 */
  title: string;
  /** 네이버 SE3 contenteditable 에 paste 할 HTML (format.ts 의 convertToNaverBlogHtml) */
  bodyHtml: string;
  /** Playwright 형식 cookies — vault 에서 로드 */
  cookies: NaverCookie[];
  /** true 면 마지막 발행 click 만 skip — selector·iframe 검증용 (Phase 2-C) */
  dryRun?: boolean;
};

export type PublishResult =
  | { ok: true; naverUrl: string | null; details: Record<string, unknown> }
  | { ok: false; error: string; reason: PublishFailReason; details: Record<string, unknown> };

export type PublishFailReason =
  | "session_invalid"
  | "captcha_detected"
  | "2fa_detected"
  | "title_input_failed"
  | "body_input_failed"
  | "save_button_missing"
  | "publish_failed"
  | "browser_launch_failed"
  | "unknown";

/**
 * 1건 자동 발행.
 * 안전: 캡차·2FA 감지 시 즉시 abort (자동 해결 시도 X — 정지 위험).
 *       모든 selector wait 에 timeout (네이버 UI 변경 시 hang 회피).
 */
export async function publishToNaverBlog(opts: PublishOptions): Promise<PublishResult> {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  const debug: Record<string, unknown> = { dryRun: opts.dryRun === true };

  try {
    // 1) 브라우저 launch — @sparticuz/chromium 의 Vercel 호환 chromium
    browser = await playwright.launch({
      args: [...chromium.args, "--disable-blink-features=AutomationControlled"],
      executablePath: await chromium.executablePath(),
      headless: true,
    }).catch((err: unknown) => {
      throw new Error(`chromium launch 실패: ${err instanceof Error ? err.message : String(err)}`);
    });

    context = await browser.newContext({
      userAgent: HUMAN_UA,
      viewport: { width: 1280, height: 800 },
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
      // clipboard 권한 미리 부여 (newPage·navigate 이후 grant 보다 안전 — origin 캐시 일관)
      permissions: ["clipboard-read", "clipboard-write"],
    });

    // 2) navigator.webdriver 속성 hide (안티봇 우회 표준 패턴)
    await context.addInitScript(`
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = window.chrome || { runtime: {} };
    `);

    // 3) cookies inject (vault 에서 받은 형식 그대로)
    await context.addCookies(
      opts.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path ?? "/",
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      })),
    );

    const page = await context.newPage();

    // 4) 세션 검증 — naver.com 진입 후 로그인 표시 (실패 시 cookies 만료)
    await page.goto(NAVER_HOME_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    const loginLinkVisible = await waitVisible(page, 'a[href*="nidlogin.login"]', 2000);
    if (loginLinkVisible) {
      return failResult(debug, "session_invalid", "cookies 만료 — 재로그인 필요");
    }
    debug.session = "valid";

    // 5) 글쓰기 페이지 진입
    await page.goto(NAVER_WRITE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000); // SE3 iframe load 대기 (Vercel chromium 환경 보수적)
    debug.url_after_goto = page.url();
    debug.page_title = await page.title().catch(() => "n/a");

    // 6) 캡차·2FA 감지 → abort
    const blocker = await detectBlocker(page);
    if (blocker) {
      return failResult(debug, blocker, `${blocker} 감지 — manual 개입 필요`);
    }

    // 7) mainFrame 진입
    const mainFrame = page.frameLocator("#mainFrame");
    const innerFrame = mainFrame.frameLocator("iframe");

    // 진단: frame 갯수 + mainFrame URL + body text 일부
    const allFrames = page.frames();
    debug.total_frames = allFrames.length;
    debug.frame_urls = allFrames.map((f) => f.url()).slice(0, 5);
    debug.mainframe_body_text = await mainFrame
      .locator("body")
      .innerText({ timeout: 5000 })
      .then((t) => t.slice(0, 300))
      .catch((e) => `err: ${e instanceof Error ? e.message : String(e)}`);

    // 8) 제목 입력
    try {
      await mainFrame.locator(SE3_TITLE).first().waitFor({ timeout: 30000 });
      await mainFrame.locator(SE3_TITLE).first().click();
      await page.waitForTimeout(500);
      await innerFrame.locator("body").press("Control+a");
      await innerFrame.locator("body").type(opts.title, { delay: 20 });
      debug.title = "input_ok";
    } catch (err) {
      return failResult(debug, "title_input_failed", String(err));
    }

    // 9) 본문 입력 — clipboard 경유 HTML paste (newContext 에서 권한 이미 grant)
    try {
      await mainFrame.locator(SE3_BODY).first().waitFor({ timeout: 10000 });
      await mainFrame.locator(SE3_BODY).first().click();
      await page.waitForTimeout(300);
      await page.evaluate((html) => navigator.clipboard.writeText(html), opts.bodyHtml);
      await innerFrame.locator("body").press("Control+v");
      await page.waitForTimeout(1500);
      debug.body = "input_ok";
    } catch (err) {
      return failResult(debug, "body_input_failed", String(err));
    }

    // 10) dry-run — 발행 직전까지만 가고 종료
    if (opts.dryRun === true) {
      debug.dryRun_finished = true;
      return { ok: true, naverUrl: null, details: debug };
    }

    // 11) 저장·발행 — 4중 fallback (selector 가 mainFrame 안에 있음 — 2026-05-12 검증)
    const clicked = await clickInFrame(mainFrame, page, SAVE_BUTTONS);
    if (!clicked) {
      return failResult(debug, "save_button_missing", "저장 버튼 4종 모두 못 찾음");
    }
    debug.save_button = clicked;
    await page.waitForTimeout(2000);

    // 12) 발행 모달 — "발행" 또는 "확인" 버튼 click (popup_btn). 모달도 mainFrame 안.
    const publishOk = await clickPublishModal(mainFrame, page);
    if (!publishOk) {
      return failResult(debug, "publish_failed", "발행 모달 확인 버튼 click 실패");
    }
    debug.publish_modal = "clicked";
    await page.waitForTimeout(5000);

    // 13) URL 캡처 (m.site.naver.com 단축 또는 blog.naver.com)
    const naverUrl = await page
      .locator('a[href*="m.site.naver.com"], a[href*="blog.naver.com"]')
      .first()
      .getAttribute("href", { timeout: 10000 })
      .catch(() => null);
    debug.captured_url = naverUrl ?? "none";

    return { ok: true, naverUrl, details: debug };
  } catch (err) {
    return failResult(debug, "unknown", err instanceof Error ? err.message : String(err));
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────
/**
 * Locator.isVisible() 은 timeout 옵션을 지원하지 않아 ajax 로 늦게 뜨는 요소는
 * false negative 발생. waitFor({state:'visible',timeout}) 로 실제 대기 후 boolean.
 * 캡차·2FA false negative = 계정 정지 위험이라 실제 대기 필수.
 */
async function waitVisible(page: Page, selector: string, timeoutMs: number): Promise<boolean> {
  return page
    .locator(selector)
    .first()
    .waitFor({ state: "visible", timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);
}

async function detectBlocker(page: Page): Promise<"captcha_detected" | "2fa_detected" | null> {
  if (
    await waitVisible(
      page,
      'img[src*="captcha"], #captcha, .recaptcha, [class*="captcha"]',
      1500,
    )
  ) {
    return "captcha_detected";
  }
  if (await waitVisible(page, 'text=인증번호, input[name*="otp"], text=2단계 인증', 1500)) {
    return "2fa_detected";
  }
  return null;
}

/**
 * mainFrame 안에서 selector 4중 fallback click. publisher.ts 의 SE3 자동화는
 * 저장·발행 모달이 mainFrame 안에 있음 (page 직접 X — 2026-05-12 검증).
 */
async function clickInFrame(
  frame: FrameLocator,
  page: Page,
  selectors: string[],
): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const target = sel.startsWith("//") ? `xpath=${sel}` : sel;
      const loc = frame.locator(target).first();
      if (
        await loc
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await loc.click({ timeout: 5000 });
        return sel;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function clickPublishModal(frame: FrameLocator, page: Page): Promise<boolean> {
  // 모달 발행 버튼 — class·text 두 패턴. mainFrame 안.
  const candidates = [
    "button.popup_btn__P5_Hf",
    '//button[contains(@class,"popup_btn")]',
    '//button[.//span[text()="발행"]]',
    '//button[.//span[text()="확인"]]',
  ];
  return (await clickInFrame(frame, page, candidates)) !== null;
}

function failResult(
  details: Record<string, unknown>,
  reason: PublishFailReason,
  error: string,
): PublishResult {
  return { ok: false, error, reason, details };
}
