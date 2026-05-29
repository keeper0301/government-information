// GitHub Actions(해외 IP) 풀 chromium + icn1 프록시 우회 검증
// 정부 도메인(.kr) 요청을 page.route 로 가로채 Vercel icn1 프록시(한국 IP)로 보냄.
// 노원 본문이 깨끗한 한글로 나오면 = 해외 IP 차단 우회 + mojibake 없음 = 전체 우회 성공.
import { chromium } from "playwright";

const PROXY = (process.env.KEEPIOO_API_URL || "https://www.keepioo.com") + "/api/internal/icn1-fetch";
const KEY = process.env.KEEPIOO_API_KEY;
if (!KEY) { console.error("KEEPIOO_API_KEY 없음"); process.exit(1); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  locale: "ko-KR", timezoneId: "Asia/Seoul",
});
const page = await ctx.newPage();

let proxied = 0, direct = 0, failed = 0;
await page.route("**/*", async (route) => {
  const req = route.request();
  const url = req.url();
  let host;
  try { host = new URL(url).hostname; } catch { return route.continue(); }
  if (!host.endsWith(".kr")) { direct++; return route.continue(); }
  try {
    const r = await fetch(PROXY, {
      method: "POST",
      headers: { "X-API-Key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ url, method: req.method(), headers: req.headers(), postData: req.postData() }),
    });
    if (r.status === 403) { direct++; return route.continue(); }
    if (!r.ok) { failed++; return route.continue(); }
    const d = await r.json();
    proxied++;
    await route.fulfill({ status: d.status, headers: d.headers || {}, body: Buffer.from(d.bodyB64, "base64") });
  } catch { failed++; return route.continue(); }
});

try {
  await page.goto("https://www.nowon.kr/www/user/bbs/BD_selectBbsList.do?q_bbsCode=1027", { waitUntil: "networkidle", timeout: 45000 });
  const detail = await page.evaluate(() => {
    const a = [...document.querySelectorAll("a[href]")].find(x => /BD_selectBbs\.do\?[^"']*q_bbscttSn=\d/.test(x.getAttribute("href") || ""));
    return a ? a.href : null;
  });
  console.log(`[프록시 경유 ${proxied} / 직접 ${direct} / 실패 ${failed}] 상세링크: ${detail ? "OK" : "없음"}`);
  if (!detail) process.exit(0);
  await page.goto(detail, { waitUntil: "networkidle", timeout: 35000 });
  const body = await page.evaluate(() => {
    const SELS = [".board_text_td","td.board_text_td",".view_cont",".board_view",".bbs_content","[class*='board-view']","[class*='view_content']","#contents .content"];
    for (const s of SELS) { const el = document.querySelector(s); if (el) { const t=(el.textContent||"").replace(/\s+/g," ").trim(); if (t.length>100) return {sel:s, text:t}; } }
    const ps=[...document.querySelectorAll("p")].map(p=>p.textContent||"").join(" ").replace(/\s+/g," ").trim();
    return {sel:"p-join", text:ps};
  });
  const hangul = (body.text.match(/[가-힣]/g) || []).length;
  const garbage = (body.text.match(/[\uD800-\uDFFF�-]/g) || []).length;
  console.log(`본문 sel=${body.sel} 길이=${body.text.length} 정상한글=${hangul} 깨진문자=${garbage}`);
  console.log(`판정: ${hangul > 200 && garbage < hangul / 10 ? "✅ 깨끗(우회 성공)" : "❌ 깨짐/실패"}`);
  console.log("미리보기:", body.text.slice(0, 200));
} catch (e) { console.log("ERR", e.message.slice(0, 120)); }
await browser.close();
