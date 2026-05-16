const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const projectRoot = path.resolve(__dirname, "..");
const extPath = path.join(projectRoot, "chrome-extension");
const profile = "C:/tmp/keepioo-live-chromium-profile";
const logPath = "C:/tmp/keepioo-dryrun-result.log";

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(logPath, `${line}\n`, "utf8");
}

(async () => {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, "", "utf8");

  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
  });

  try {
    let worker = context
      .serviceWorkers()
      .find((w) => w.url().startsWith("chrome-extension://") && w.url().endsWith("/background.js"));
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 30_000 });
    const extId = new URL(worker.url()).host;
    log(`extension loaded: ${extId}`);

    const loginPage = await context.newPage();
    await loginPage.goto("https://blog.naver.com/GoBlogWrite.naver", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    log("opened naver write/login page; waiting for login");

    await loginPage.waitForFunction(
      () => location.href.includes("blog.naver.com") && !location.href.includes("nid.naver.com"),
      null,
      { timeout: 10 * 60_000 },
    );
    await loginPage.waitForTimeout(5_000);
    log(`login detected: ${loginPage.url()}`);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html?autoDryRun=1`, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    await popup.waitForFunction(
      () => {
        const t = document.querySelector("#status")?.textContent || "";
        return /dry-run OK|❌|skip:|cookies 만료|fail|\/next/i.test(t) && !/시작/.test(t);
      },
      null,
      { timeout: 180_000 },
    );
    const status = await popup.locator("#status").innerText();
    log("STATUS_START");
    log(status);
    log("STATUS_END");
  } catch (error) {
    log(`SCRIPT_ERROR=${error?.stack || error}`);
    process.exitCode = 1;
  } finally {
    await context.close().catch(() => undefined);
  }
})();
