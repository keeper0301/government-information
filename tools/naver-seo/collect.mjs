// ============================================================
// 네이버 서치어드바이저 데이터 수집 (Playwright persistent context)
// ============================================================
// 서치어드바이저는 공식 API 가 없어 로그인된 브라우저로만 데이터를 읽을 수 있다.
// Claude in Chrome 은 네이버 도메인 차단이라 Playwright 로 우회(2026-06-11 확인).
//
// 세션: persistent context(~/.playwright-naver) 에 로그인 1회 저장 → 만료(2~4주)까지 재사용.
//   첫 실행/만료 시 headed 창에서 사장님이 네이버 로그인 → 이후 자동.
//
// 수집: ① 사이트 진단(색인/색인제외/수집제한/SEO 이슈) ② 노출/클릭(노출·클릭·CTR·키워드·웹문서)
// 실행: bun tools/naver-seo/collect.mjs   (단독 실행 시 콘솔 출력 = 파싱 검증용)
// ============================================================

import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";

const SITE = "https://www.keepioo.com";
const ENC = encodeURIComponent(SITE);
const PROFILE = path.join(os.homedir(), ".playwright-naver");
const DIAG_URL = `https://searchadvisor.naver.com/console/site/report/diagnosis?site=${ENC}&urlPeriod=0`;
const EXPOSE_URL = `https://searchadvisor.naver.com/console/site/report/expose?site=${ENC}`;

// "1.3천"·"6.3백"·"8.5천"·"2.2만" → 정수. 일반 숫자/콤마도 처리.
export function parseKoNum(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(/,/g, "");
  const m = /^([0-9.]+)\s*(천|백|만)?/.exec(t);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  const mul = m[2] === "만" ? 10000 : m[2] === "천" ? 1000 : m[2] === "백" ? 100 : 1;
  return Math.round(n * mul);
}

// 페이지에서 라벨-값 카드 + 테이블 행 + 원문을 구조적으로 추출 (DOM 텍스트 기반, 클래스 무의존).
async function extractPage(page) {
  return await page.evaluate(() => {
    // 단말(자식없는) 요소의 텍스트 → 다음 형제 텍스트 = 라벨/값 쌍
    const pairs = {};
    document.querySelectorAll("*").forEach((el) => {
      if (el.children.length !== 0) return;
      const label = (el.textContent || "").trim();
      if (!label || label.length > 12) return;
      const val = el.nextElementSibling?.textContent?.trim();
      if (val && pairs[label] === undefined) pairs[label] = val;
    });
    // 테이블 행 (role=row 또는 tr)
    const rows = [...document.querySelectorAll('[role="row"], tr')]
      .map((r) =>
        [...r.querySelectorAll('[role="cell"], [role="columnheader"], td, th')].map(
          (c) => (c.textContent || "").trim(),
        ),
      )
      .filter((r) => r.length >= 2);
    return { pairs, rows, fullText: (document.body.innerText || "").slice(0, 8000) };
  });
}

// 진단 페이지 raw → 구조화
function parseDiagnosis(raw) {
  const p = raw.pairs;
  const issues = {};
  for (const row of raw.rows) {
    // [유형명, 상태, 페이지수] 형태 — 마지막이 숫자 표기
    if (row.length >= 3) {
      const name = row[0];
      const count = parseKoNum(row[row.length - 1]);
      if (name && count != null && /[가-힣<]/.test(name)) issues[name] = count;
    }
  }
  return {
    indexed_count: parseKoNum(p["색인"]),
    index_excluded: parseKoNum(p["색인제외"]),
    crawl_limited: parseKoNum(p["수집제한"]),
    seo_total: parseKoNum(p["SEO"]),
    issues, // {"<H1> 요소가 2개 이상 발견": 1858, ...}
    updated: raw.fullText.match(/최근 업데이트[:\s]*([\d.]+)/)?.[1] ?? null,
  };
}

// 노출/클릭 페이지 raw → 구조화
function parseExpose(raw) {
  const p = raw.pairs;
  const table = (startHint) => {
    const out = [];
    for (const row of raw.rows) {
      // [No, 텍스트, 클릭, 노출, CTR] — No 가 숫자, 뒤 3개 숫자
      if (row.length >= 5 && /^\d+$/.test(row[0])) {
        const ctr = parseFloat(row[4]);
        out.push({
          label: row[1],
          click: parseKoNum(row[2]),
          impression: parseKoNum(row[3]),
          ctr: Number.isNaN(ctr) ? null : ctr,
        });
      }
    }
    return out;
  };
  const all = table();
  // 키워드(한글/짧음) vs 웹문서(URL) 분리
  const keywords = all.filter((r) => !/^https?:\/\//.test(r.label));
  const pages = all.filter((r) => /^https?:\/\//.test(r.label));
  return {
    total_clicks: parseKoNum(p["최근 총 클릭"]),
    total_impressions: parseKoNum(p["최근 총 노출"]),
    avg_ctr: parseFloat(p["평균 CTR"]) || null,
    top_keywords: keywords.slice(0, 30),
    top_pages: pages.slice(0, 30),
    updated: raw.fullText.match(/최근 업데이트[:\s]*([\d.]+)/)?.[1] ?? null,
  };
}

// report 페이지로 이동 — 네이버 OAuth callback(/auth/callback) JS 리다이렉트를 통과해
// 목표 report 페이지 도달까지 대기. 실제 로그인 페이지(nid) 도달 시에만 LOGIN_REQUIRED.
async function gotoReport(page, url) {
  const TARGET = /report\/(diagnosis|expose)/;
  // 로그인돼 있어도 OAuth(authorize→callback)를 거치므로 nid URL 은 정상 통과 단계.
  // 목표는 report 도달. callback 에서 자동 리다이렉트가 안 되면(MCP 에서 확인) 재이동.
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForURL(TARGET, { timeout: 25000 }).catch(() => {});
    if (TARGET.test(page.url())) {
      await page.waitForTimeout(3000); // 차트/테이블 데이터 로딩
      return;
    }
    // 실제 로그인 폼(세션 만료)이면 즉시 중단
    if (/nidlogin|nid\.naver\.com\/login/.test(page.url())) break;
  }
  throw new Error("LOGIN_REQUIRED");
}

// 메인 — persistent context 로 두 페이지 수집. 로그인 안 돼 있으면 LOGIN_REQUIRED throw.
export async function collectNaverSeo({ headless = false } = {}) {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless,
    viewport: { width: 1280, height: 900 },
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    await gotoReport(page, DIAG_URL);
    const diagRaw = await extractPage(page);

    await gotoReport(page, EXPOSE_URL);
    const exposeRaw = await extractPage(page);

    return {
      collected_at: new Date().toISOString(),
      diagnosis: parseDiagnosis(diagRaw),
      expose: parseExpose(exposeRaw),
      _raw: { diag_pairs: diagRaw.pairs, expose_pairs: exposeRaw.pairs },
    };
  } finally {
    await ctx.close();
  }
}

// 단독 실행 = 파싱 검증 (콘솔 출력)
if (import.meta.main) {
  collectNaverSeo()
    .then((r) => {
      console.log("=== 수집 결과 ===");
      console.log(JSON.stringify(r, null, 2));
    })
    .catch((e) => {
      if (e.message === "LOGIN_REQUIRED") {
        console.log("⚠️ 로그인 필요 — 뜬 브라우저 창에서 네이버 로그인 후 다시 실행하세요.");
      } else {
        console.error("수집 실패:", e);
      }
      process.exit(1);
    });
}
