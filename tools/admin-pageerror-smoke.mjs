#!/usr/bin/env node

import { access } from "node:fs/promises";
import { chromium } from "@playwright/test";

const DEFAULT_BASE_URL = "https://www.keepioo.com";
const baseUrl = (process.env.ADMIN_SMOKE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
const storageStatePath = process.env.ADMIN_SMOKE_STORAGE_STATE || "";

const routes = [
  "/admin",
  "/admin/health",
  "/admin/users",
  "/admin/decisions",
  "/admin/autonomous",
  "/admin/system-ops",
];

async function fileExists(path) {
  if (!path) return false;
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const hasStorageState = await fileExists(storageStatePath);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext(
  hasStorageState ? { storageState: storageStatePath } : {},
);

const failures = [];

for (const route of routes) {
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message || String(error));
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  const response = await page.goto(`${baseUrl}${route}`, {
    waitUntil: "networkidle",
    timeout: 45_000,
  });
  await page.waitForTimeout(1_000);

  const finalUrl = page.url();
  const status = response?.status() ?? 0;
  const title = await page.title().catch(() => "");
  const h1 = await page.locator("h1").first().textContent().catch(() => "");

  if (pageErrors.length > 0 || consoleErrors.length > 0) {
    failures.push({ route, finalUrl, status, pageErrors, consoleErrors });
  }

  if (!hasStorageState && !finalUrl.includes("/login")) {
    failures.push({
      route,
      finalUrl,
      status,
      pageErrors,
      consoleErrors,
      reason: "Unauthenticated admin route did not redirect to login",
    });
  }

  console.log(
    JSON.stringify({
      route,
      status,
      finalUrl,
      title,
      h1: h1?.trim() || null,
      pageErrors,
      consoleErrors,
      mode: hasStorageState ? "authenticated" : "redirect",
    }),
  );

  await page.close();
}

await browser.close();

if (failures.length > 0) {
  console.error("admin pageerror smoke failed");
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(
  `admin pageerror smoke passed (${hasStorageState ? "authenticated" : "redirect"})`,
);
