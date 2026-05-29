// GitHub Actions(해외 IP) 풀 chromium + icn1 프록시 우회 검증/진단
// 정부 도메인(.kr) 요청을 page.route 로 가로채 Vercel icn1 프록시(한국 IP)로 보냄.
// 노원 상세 페이지에서 본문 컨테이너 후보를 길이순으로 출력 → 정확한 selector 발굴.
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

let proxied = 0, direct = 0, failed = 0, aborted = 0;
await page.route("**/*", async (route) => {
  const req = route.request();
  const url = req.url();
  if (["image", "stylesheet", "font", "media"].includes(req.resourceType())) { aborted++; return route.abort(); }
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
  await page.goto("https://www.nowon.kr/www/user/bbs/BD_selectBbsList.do?q_bbsCode=1027", { waitUntil: "domcontentloaded", timeout: 45000 });
  const detail = await page.evaluate(() => {
    const a = [...document.querySelectorAll("a[href]")].find(x => /BD_selectBbs\.do\?[^"']*q_bbscttSn=\d/.test(x.getAttribute("href") || ""));
    return a ? a.href : null;
  });
  console.log(`[프록시 경유 ${proxied} / 직접 ${direct} / 차단 ${aborted} / 실패 ${failed}] 상세링크: ${detail ? "OK" : "없음"}`);
  if (!detail) process.exit(0);
  await page.goto(detail, { waitUntil: "domcontentloaded", timeout: 35000 });
  await page.waitForTimeout(1500);
  const diag = await page.evaluate(() => {
    const cand = [];
    document.querySelectorAll("div,td,article,section").forEach((el) => {
      const id = el.id || "";
      const cls = typeof el.className === "string" ? el.className : "";
      if (!/board|view|cont|bbs|article|txt/i.test(id + " " + cls)) return;
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (t.length < 150) return;
      const sel = el.tagName.toLowerCase() + (id ? "#" + id : "") + (cls ? "." + cls.trim().split(/\s+/).join(".") : "");
      cand.push({ sel: sel.slice(0, 70), len: t.length });
    });
    cand.sort((a, b) => a.len - b.len);
    return cand.slice(0, 12);
  });
  console.log("본문 후보 컨테이너(짧은 순 12개):");
  diag.forEach((c) => console.log(`  len=${c.len} ${c.sel}`));
} catch (e) { console.log("ERR", e.message.slice(0, 120)); }
await browser.close();
