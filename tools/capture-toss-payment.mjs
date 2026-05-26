// 토스 결제창만 단독 캡처 — generate-toss-ppt.mjs 의 6번 캡처가 실패했을 때 백업용
// 사장님 chrome user-data-dir 가 아닌 임시 context 로 admin magic link 자동 로그인.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join("tools", "toss-captures", "6-toss-payment.png");

// .env.local 직접 읽기 (dotenv 의존성 없이) — line 51 placeholder 손상 회피
// generate-toss-ppt.mjs 의 firstEnvValue 패턴과 동일.
const envText = fs.readFileSync(".env.local", "utf8");
function firstEnvValue(key) {
  const m = envText.match(new RegExp(`^${key}=(.+)$`, "m"));
  return m?.[1]?.trim();
}
const SUPABASE_URL = firstEnvValue("NEXT_PUBLIC_SUPABASE_URL");
const SK = firstEnvValue("SUPABASE_SERVICE_ROLE_KEY");
const ADMIN_EMAIL = firstEnvValue("TOSS_REVIEW_ADMIN_EMAIL");

async function main() {
  if (!SUPABASE_URL || !SK || !ADMIN_EMAIL) {
    console.error(
      "❌ .env.local 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / TOSS_REVIEW_ADMIN_EMAIL 누락",
    );
    process.exit(1);
  }
  // admin magic link 발급
  const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "magiclink",
      email: ADMIN_EMAIL,
      options: { redirect_to: "https://keepioo.com/mypage/billing" },
    }),
  });
  const linkData = await linkRes.json();
  console.log("magic link:", linkData.action_link?.slice(0, 100));
  if (!linkData.action_link) {
    console.log("ERROR:", linkData);
    return;
  }

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // console error 캡처
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("  [console.error]", msg.text());
  });

  // magic link → /mypage/billing 으로 redirect (cookie sync)
  console.log("1. magic link navigate");
  await page.goto(linkData.action_link, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  console.log("  url after magic:", page.url());

  // /mypage/billing 진입
  console.log("2. /mypage/billing");
  await page.goto("https://keepioo.com/mypage/billing", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  console.log("  url:", page.url());

  if (page.url().includes("/login")) {
    console.log("  ❌ magic link cookie sync 실패. 로그인 페이지 redirect.");
    // 다른 시도: /checkout?tier=pro 으로 직접 (구독 안 함 user 처럼)
    await page.goto("https://keepioo.com/checkout?tier=pro", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    console.log("  /checkout url:", page.url());
    if (page.url().includes("/login")) {
      console.log("  ❌ /checkout 도 redirect. 종료.");
      await browser.close();
      return;
    }
  }

  // /mypage/billing 의 "카드 변경" 클릭 (admin 구독 중일 시)
  if (page.url().includes("/mypage/billing")) {
    console.log("3. 카드 변경 click");
    await page.locator('a:has-text("카드 변경")').first().click({ timeout: 5000 }).catch((e) => {
      console.log("  카드 변경 click 실패:", e.message);
    });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    console.log("  url:", page.url());
  }

  // /checkout 의 "카드 등록" click
  console.log("4. 카드 등록 button click");
  const btn = page.locator("button").filter({ hasText: /카드 등록|등록하기|시작/ }).first();
  const btnText = await btn.innerText().catch(() => "?");
  console.log("  button:", btnText);

  const popupPromise = ctx.waitForEvent("page", { timeout: 15000 }).catch(() => null);
  await btn.click({ timeout: 5000 });
  const popup = await popupPromise;
  const target = popup || page;
  console.log("  popup:", !!popup, "URL:", target.url());

  await target.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await target.waitForTimeout(5000);
  console.log("  final URL:", target.url());

  // 페이지의 모든 텍스트 (Request Error 같은 에러 검증)
  const bodyText = await target.evaluate(() => document.body?.innerText?.slice(0, 200));
  console.log("  body:", bodyText);

  await target.screenshot({ path: OUT, fullPage: false });
  console.log("✅ saved:", OUT);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
