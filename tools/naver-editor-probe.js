/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const { chromium } = require("@playwright/test");

const profile = "C:/tmp/keepioo-live-chromium-profile";
const logPath = "C:/tmp/keepioo-editor-probe.log";

function log(value) {
  const line = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  console.log(line);
  fs.appendFileSync(logPath, `${line}\n`, "utf8");
}

async function frameSummary(frame) {
  return await frame.evaluate(() => {
    const pick = (el) => ({
      tag: el.tagName,
      id: el.id || "",
      className: String(el.className || "").slice(0, 120),
      contenteditable: el.getAttribute("contenteditable"),
      role: el.getAttribute("role"),
      ariaLabel: el.getAttribute("aria-label"),
      text: (el.innerText || el.textContent || "").slice(0, 80),
      rect: (() => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      })(),
    });
    return {
      url: location.href,
      title: document.title,
      editables: [...document.querySelectorAll("[contenteditable], textarea, input")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .slice(0, 30)
        .map(pick),
      iframes: [...document.querySelectorAll("iframe")].map((el) => ({
        id: el.id || "",
        name: el.name || "",
        src: el.src || "",
        className: String(el.className || "").slice(0, 80),
      })),
    };
  });
}

(async () => {
  fs.writeFileSync(logPath, "", "utf8");
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });

  try {
    const page = await context.newPage();
    await page.goto("https://blog.naver.com/GoBlogWrite.naver", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(5_000);
    log({ pageUrl: page.url() });

    const mainHandle = await page.waitForSelector("#mainFrame", { timeout: 30_000 });
    const mainFrame = await mainHandle.contentFrame();
    if (!mainFrame) throw new Error("mainFrame contentFrame missing");
    await mainFrame.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => undefined);
    await mainFrame.waitForTimeout(5_000);
    log({ mainFrameUrl: mainFrame.url() });
    log(await frameSummary(mainFrame));

    for (const frame of mainFrame.childFrames()) {
      log({ childFrameUrl: frame.url() });
      log(await frameSummary(frame).catch((error) => ({ error: String(error?.message || error) })));
    }
  } catch (error) {
    log({ error: String(error?.stack || error) });
    process.exitCode = 1;
  } finally {
    await context.close().catch(() => undefined);
  }
})();
