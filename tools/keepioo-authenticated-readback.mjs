#!/usr/bin/env node
import playwright from "playwright";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const { chromium } = playwright;

export const DEFAULT_ENV_FILE = "/home/user/.hermes/workspace/claude/config/keepioo-test-login.env";
export const DEFAULT_BASE_URL = "https://www.keepioo.com";
export const DEFAULT_POLICY_PATH = "/welfare/36fddc36-a963-44cc-9dcf-6c4847b116ac";

export function redactUrl(value) {
  return String(value).replace(/([?&](?:token|code|access_token|refresh_token)=)[^&]+/g, "$1[REDACTED]");
}

export function loadSecretEnvFile(filePath = DEFAULT_ENV_FILE, env = process.env) {
  if (!fs.existsSync(filePath)) return { loaded: false, filePath };

  const stat = fs.statSync(filePath);
  const mode = stat.mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new Error(`secret_env_too_permissive:${filePath}:mode=${mode.toString(8)}`);
  }

  const loadedKeys = [];
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [rawKey, ...rest] = trimmed.split("=");
    const key = rawKey.trim();
    if (!key) continue;
    if (!env[key]) {
      env[key] = rest.join("=").trim().replace(/^["']|["']$/g, "");
      loadedKeys.push(key);
    }
  }

  return { loaded: true, filePath, loadedKeys };
}

export function requireSecret(env, name) {
  if (!env[name]) throw new Error(`missing_secret:${name}`);
  return env[name];
}

async function readBodyHead(page) {
  const body = await page.locator("body").innerText().catch(() => "");
  return { body, head: body.slice(0, 240) };
}

export async function runAuthenticatedReadback({
  baseUrl = process.env.KEEPIOO_BASE_URL || DEFAULT_BASE_URL,
  envFile = process.env.KEEPIOO_TEST_LOGIN_ENV || DEFAULT_ENV_FILE,
  policyPath = process.env.KEEPIOO_TEST_POLICY_PATH || DEFAULT_POLICY_PATH,
  headless = process.env.KEEPIOO_READBACK_HEADLESS !== "0",
} = {}) {
  const envLoad = loadSecretEnvFile(envFile, process.env);
  const email = requireSecret(process.env, "KEEPIOO_TEST_EMAIL");
  const password = requireSecret(process.env, "KEEPIOO_TEST_PASSWORD");

  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const result = {
    ok: false,
    baseUrl,
    envFileLoaded: envLoad.loaded,
    login: null,
    pages: {},
    policyCta: null,
  };

  try {
    await page.goto(`${baseUrl}/login?next=%2Fmypage`, { waitUntil: "networkidle", timeout: 30000 });
    await page.getByLabel(/이메일/).fill(email);
    await page.getByLabel(/비밀번호/).fill(password);
    await page.getByRole("button", { name: /^로그인$/ }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {});

    result.login = {
      ok: !new URL(page.url()).pathname.startsWith("/login"),
      url: redactUrl(page.url()),
      title: await page.title(),
    };

    const checks = [
      ["/mypage", ["마이페이지", "구독", "알림"]],
      ["/alerts", ["알림센터", "마감 알림", "활성 알림"]],
      ["/checkout/activation", ["구독 기능 설정", "맞춤 알림", "마이페이지"]],
    ];

    for (const [route, markers] of checks) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 30000 });
      const { body, head } = await readBodyHead(page);
      result.pages[route] = {
        ok: !new URL(page.url()).pathname.startsWith("/login"),
        url: redactUrl(page.url()),
        title: await page.title(),
        redirectedToLogin: new URL(page.url()).pathname.startsWith("/login"),
        markers: Object.fromEntries(markers.map((marker) => [marker, body.includes(marker)])),
        head,
      };
    }

    await page.goto(`${baseUrl}${policyPath}`, { waitUntil: "networkidle", timeout: 30000 });
    const button = page.getByRole("button", { name: /마감 알림 받기/ }).first();
    const buttonVisible = await button.isVisible().catch(() => false);
    if (buttonVisible) {
      await button.click({ timeout: 10000 });
      await page.waitForTimeout(2500);
    }
    const { body } = await readBodyHead(page);
    result.policyCta = {
      policyPath,
      buttonVisible,
      afterUrl: redactUrl(page.url()),
      afterTitle: await page.title(),
      redirectedToPricing: new URL(page.url()).pathname.startsWith("/pricing"),
      successMessageVisible: body.includes("마감 7일 전 이메일 알림을 켰어요"),
    };

    result.ok = Boolean(
      result.login.ok &&
        Object.values(result.pages).every((entry) => entry.ok) &&
        result.policyCta.buttonVisible &&
        (result.policyCta.redirectedToPricing || result.policyCta.successMessageVisible),
    );
    return result;
  } finally {
    await browser.close();
  }
}

async function main() {
  const result = await runAuthenticatedReadback();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const message = String(error?.message || error);
    if (message.startsWith("missing_secret:") || message.startsWith("secret_env_too_permissive:")) {
      console.error(JSON.stringify({ ok: false, reason: message }, null, 2));
      process.exit(2);
    }
    console.error(error);
    process.exit(1);
  });
}
