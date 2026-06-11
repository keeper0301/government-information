// ============================================================
// 네이버 서치어드바이저 로그인 세션 저장 (1회/만료 시)
// ============================================================
// persistent context(~/.playwright-naver) 에 네이버 로그인을 저장한다. 한 번 해두면
// 세션 만료(보통 2~4주) 전까지 collect.mjs 가 재로그인 없이 데이터를 수집한다.
//
// 실행: bun tools/naver-seo/login.mjs
//   → 브라우저 창이 뜨면 네이버 아이디/비번으로 로그인. (2단계 인증·캡차도 직접)
//   → 로그인 감지되면 세션 저장 후 자동 종료.
// ============================================================

import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";

const PROFILE = path.join(os.homedir(), ".playwright-naver");

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 1280, height: 900 },
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

await page.goto(
  "https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fsearchadvisor.naver.com%2Fconsole%2Fboard",
);
console.log("브라우저 창에서 네이버 로그인을 완료해 주세요. (최대 5분 대기)");
console.log("로그인 인증(NID_AUT)이 감지되면 세션이 저장되고 자동 종료됩니다.");

// 로그인 성공 판정 = NID_AUT 쿠키(실제 인증 토큰) 존재. URL 기반은 OAuth 리다이렉트 중
// console URL 을 잠깐 거쳐 오판하므로 쿠키로 정확히 감지.
const startedAt = Date.now();
let success = false;
while (Date.now() - startedAt < 300000) {
  const cookies = await ctx.cookies();
  if (cookies.some((c) => c.name === "NID_AUT" && c.value)) {
    success = true;
    break;
  }
  await page.waitForTimeout(2000);
}

if (success) {
  await page.waitForTimeout(2000); // 잔여 쿠키(NID_SES 등) 안착 대기
  console.log("✅ 로그인 성공 — NID_AUT 확인, 세션 저장 완료. collect.mjs 로 수집 가능합니다.");
} else {
  console.log("⏱ 로그인 미완료 (NID_AUT 없음). 로그인 끝까지(2단계 인증 포함) 진행 후 다시 실행해 주세요.");
}

await ctx.close();
process.exit(0);
