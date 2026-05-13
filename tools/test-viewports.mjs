#!/usr/bin/env node
// ============================================================
// 반응형 회귀 감지 — 4 viewport × 4 페이지 스크린샷 자동 캡처
// ============================================================
// 사장님 폴드7 메인(884) + 태블릿(768/1024) + desktop(1440) 4 viewport
// × 홈·정책 목록·정책 상세·마이페이지 = 16 스크린샷.
//
// 실행:
//   node tools/test-viewports.mjs                # localhost:3000 (기본)
//   node tools/test-viewports.mjs https://www.keepioo.com
//
// 출력:
//   .viewport-snapshots/<viewport>/<page>.png
//
// 미래 회귀 감지 흐름:
//   1. 사장님 피드백 (반응형 미흡) 받으면 이 스크립트 실행
//   2. .viewport-snapshots 폴더 열어서 viewport × page matrix 한눈에 확인
//   3. 문제 발견 즉시 className 단계 추가
//
// 의존성: @playwright/test (devDependency 이미 있음)
// ============================================================

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE_URL = process.argv[2] || "http://localhost:3000";

// 4 viewport — 사장님 사용 환경 + desktop 비교용
const VIEWPORTS = [
  { name: "fold7-main", width: 884, height: 1700 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
];

// 4 page — 사장님 직접 본 페이지 + admin link 검증용
const PAGES = [
  { slug: "home", path: "/" },
  { slug: "welfare", path: "/welfare" },
  { slug: "loan", path: "/loan" },
  { slug: "news", path: "/news" },
  // 로그인 필요한 페이지는 별도 — 본 스크립트는 비로그인 동선만
];

const OUT_DIR = resolve(process.cwd(), ".viewport-snapshots");
mkdirSync(OUT_DIR, { recursive: true });

console.log(`[viewport-snapshot] base=${BASE_URL} out=${OUT_DIR}`);
console.log(`[viewport-snapshot] ${VIEWPORTS.length} viewports × ${PAGES.length} pages = ${VIEWPORTS.length * PAGES.length} screenshots\n`);

const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) {
    const vpDir = resolve(OUT_DIR, vp.name);
    mkdirSync(vpDir, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      // 모바일 가까운 viewport 는 모바일 user-agent 로
      userAgent:
        vp.width < 1024
          ? "Mozilla/5.0 (Linux; Android 14; SM-F956U) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36"
          : undefined,
    });
    const page = await context.newPage();

    for (const p of PAGES) {
      const url = `${BASE_URL}${p.path}`;
      const out = resolve(vpDir, `${p.slug}.png`);
      try {
        // domcontentloaded + best-effort networkidle (5s 캡) — analytics 같은 영구
        // 요청이 있는 페이지에서도 안정적 스크린샷 (codex P2 fix).
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page
          .waitForLoadState("networkidle", { timeout: 5000 })
          .catch(() => undefined);
        await page.screenshot({ path: out, fullPage: true });
        console.log(`✓ ${vp.name}/${p.slug}.png (${vp.width}×${vp.height})`);
      } catch (err) {
        console.error(`✗ ${vp.name}/${p.slug} fail:`, err?.message ?? err);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`\n[viewport-snapshot] 완료. 결과: ${OUT_DIR}`);
console.log("폴더 열어서 viewport × page matrix 한눈에 확인.");
