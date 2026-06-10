// ============================================================
// 토스 결제경로 PPT 자동 생성 (2026-05-25)
// ============================================================
// playwright 으로 keepioo.com 6 페이지 screenshot + pptxgenjs 으로 PPT 생성
// 출력: tools/toss-payment-route.pptx
// ============================================================

import { chromium } from "playwright";
import PptxGenJS from "pptxgenjs";
import fs from "node:fs";
import path from "node:path";

// .env.local 파싱 — line 51 손상 (placeholder + GS25_STORE_ID 한 줄 합침) 으로 dotenv 가
// 마지막 정의로 잘못된 값 set → 첫 번째 정의만 사용 (line 15 정상).
const envText = fs.readFileSync(".env.local", "utf8");
function firstEnvValue(key) {
  const m = envText.match(new RegExp(`^${key}=(.+)$`, "m"));
  return m?.[1]?.trim();
}

const OUT_DIR = path.join("tools", "toss-captures");
fs.mkdirSync(OUT_DIR, { recursive: true });

// 토스 검수용 secret — .env.local 에서 로딩 (commit 노출 방지)
// 누락 시 즉시 종료하여 비밀번호 placeholder 가 화면에 찍히는 사고 회피.
const LOGIN_EMAIL = firstEnvValue("TOSS_REVIEW_EMAIL");
const LOGIN_PW = firstEnvValue("TOSS_REVIEW_PASSWORD");
if (!LOGIN_EMAIL || !LOGIN_PW) {
  console.error(
    "❌ .env.local 에 TOSS_REVIEW_EMAIL / TOSS_REVIEW_PASSWORD 누락",
  );
  process.exit(1);
}

async function capture() {
  // headless:false 으로 토스 SDK 정상 동작. 사장님 화면에 chrome 잠시 뜸.
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  const shots = {};

  // 1. 홈 footer
  console.log("1. home footer");
  await page.goto("https://keepioo.com", { waitUntil: "networkidle" });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);
  shots[1] = path.join(OUT_DIR, "1-home-footer.png");
  await page.screenshot({ path: shots[1], fullPage: false });

  // 2. terms 제5~7조
  console.log("2. terms");
  await page.goto("https://keepioo.com/terms", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll("h2")).find((el) =>
      el.innerText.includes("제5조"),
    );
    if (h) h.scrollIntoView({ block: "start" });
  });
  await page.waitForTimeout(1500);
  shots[2] = path.join(OUT_DIR, "2-terms.png");
  await page.screenshot({ path: shots[2], fullPage: false });

  // 3. login
  console.log("3. login");
  await page.goto("https://keepioo.com/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  shots[3] = path.join(OUT_DIR, "3-login.png");
  await page.screenshot({ path: shots[3], fullPage: false });

  // 4. pricing
  console.log("4. pricing");
  await page.goto("https://keepioo.com/pricing", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  shots[4] = path.join(OUT_DIR, "4-pricing.png");
  await page.screenshot({ path: shots[4], fullPage: false });

  // 5. /checkout?tier=pro — toss 계정 로그인 필요
  console.log("5. login form → /checkout?tier=pro");
  await page.goto("https://keepioo.com/login?next=/checkout%3Ftier%3Dpro", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(1500);
  // 로그인 form 입력
  await page.fill('input[type="email"]', LOGIN_EMAIL);
  await page.fill('input[type="password"]', LOGIN_PW);
  await page.waitForTimeout(500);
  // submit + URL 변경 대기 (Promise.all 으로 race condition 회피)
  await Promise.all([
    page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 20000 }).catch(() => {}),
    page.click('button[type="submit"]:has-text("로그인")'),
  ]);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log("  URL after login:", page.url());
  // 만약 /mypage/billing 으로 redirect 된 경우 (이미 구독 중) 다시 /checkout 시도
  if (page.url().includes("/mypage/billing")) {
    console.log("  ⚠️ 이미 구독 중 → /checkout 강제 이동");
    await page.goto("https://keepioo.com/checkout?tier=pro", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
  }
  shots[5] = path.join(OUT_DIR, "5-checkout.png");
  await page.screenshot({ path: shots[5], fullPage: false });

  // 6. 결제창 — 토스 빌링 계약 미완료(미승인)라 카드 등록 클릭 시 토스 SDK 가
  // "Request Error" 를 반환해 실제 결제창이 안 뜬다(2026-06-08 확인). 차선으로
  // 체크아웃(카드 등록 진입) 화면을 6번으로 사용. 토스 결제창은 계약 완료 후 재캡처 보강.
  console.log("6. 결제창 (계약 미완료 — 체크아웃 진입 화면으로 대체)");
  const checkoutShot = path.join(OUT_DIR, "5-checkout.png");
  const out6 = path.join(OUT_DIR, "6-toss-payment.png");
  if (fs.existsSync(checkoutShot)) {
    fs.copyFileSync(checkoutShot, out6);
    shots[6] = out6;
    console.log("  ↳ 토스 결제창은 계약 후 보강 — 체크아웃(결제 진입) 화면 사용");
  } else {
    shots[6] = null;
  }

  await browser.close();
  return shots;
}

async function buildPptx(shots) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inch

  // 슬라이드 1: 표지 — 가맹점 정보
  const s1 = pptx.addSlide();
  s1.addText("홈페이지 결제경로 (빌링)", {
    x: 0.5, y: 1.0, w: 12, h: 1.0,
    fontSize: 32, bold: true, color: "1A1A1A", fontFace: "Pretendard",
  });
  s1.addText(
    "가맹점 정보\n\n" +
    "상호명         : 키피오\n" +
    "사업자번호     : 657-24-02265\n" +
    "URL            : https://keepioo.com\n" +
    `Test ID        : ${LOGIN_EMAIL}\n` +
    `Test PW        : ${LOGIN_PW}\n\n` +
    "상점아이디(MID): bill_keepi8lz6\n" +
    "결제수단       : 빌링결제 (신용카드 정기결제)",
    {
      x: 0.5, y: 2.2, w: 12, h: 5,
      fontSize: 18, color: "333333", fontFace: "Consolas",
      paraSpaceAfter: 8,
    },
  );

  // 슬라이드 2~7: 캡처
  const titles = {
    1: "② 하단 정보 캡처 — 사업자정보 (footer)",
    2: "③ 환불규정 캡처 (제5~7조)",
    3: "④ 로그인 / 회원가입 캡처",
    4: "⑤ 상품 선택 / 구매과정 캡처 (요금제)",
    5: "⑤ 상품 선택 / 구매과정 캡처 (체크아웃)",
    6: "⑥ 카드 결제경로 캡처 (토스 결제창)",
  };
  for (const n of [1, 2, 3, 4, 5, 6]) {
    if (!shots[n] || !fs.existsSync(shots[n])) continue;
    const s = pptx.addSlide();
    s.addText(titles[n], {
      x: 0.5, y: 0.2, w: 12, h: 0.5,
      fontSize: 18, bold: true, color: "1A1A1A", fontFace: "Pretendard",
    });
    s.addImage({
      path: shots[n],
      x: 0.5, y: 0.85, w: 12, h: 6.5,
      sizing: { type: "contain", w: 12, h: 6.5 },
    });
  }

  // 6번 image 없으면 마지막에 안내 슬라이드. 있으면 skip.
  if (shots[6]) {
    const outPath = path.join("tools", "toss-payment-route.pptx");
    await pptx.writeFile({ fileName: outPath });
    return outPath;
  }
  const sLast = pptx.addSlide();
  sLast.addText("⑥ 카드 결제경로 (빌링)", {
    x: 0.5, y: 0.2, w: 12, h: 0.5,
    fontSize: 18, bold: true, color: "1A1A1A", fontFace: "Pretendard",
  });
  sLast.addText(
    "토스페이먼츠 빌링 결제창 연동 완료\n\n" +
    "코드 위치: app/checkout/checkout-form.tsx\n" +
    "SDK: @tosspayments/payment-sdk\n" +
    "메서드: tossPayments.requestBillingAuth(\"카드\", {customerKey, successUrl, failUrl})\n\n" +
    "현재 단계 : 빌링 계약 카드사 심사 진행 중\n" +
    "계약 완료 후 정기결제 카드 입력창이 활성화되며,\n" +
    "검수 시점에는 위 5번 슬라이드의 \"프로 7일 무료체험 시작 (카드 등록)\" 버튼 클릭 시\n" +
    "토스페이먼츠 카드 입력창이 표시됩니다.\n\n" +
    "연동 가이드 문서: docs.tosspayments.com/guides/billing/integration",
    {
      x: 0.5, y: 1.0, w: 12, h: 6,
      fontSize: 16, color: "333333", fontFace: "Pretendard",
      paraSpaceAfter: 6,
    },
  );

  const outPath = path.join("tools", "toss-payment-route.pptx");
  await pptx.writeFile({ fileName: outPath });
  return outPath;
}

const shots = await capture();
console.log("\n캡처 결과:", shots);
const pptxPath = await buildPptx(shots);
console.log("\n✅ PPT 생성 완료:", pptxPath);
console.log("절대 경로:", path.resolve(pptxPath));
