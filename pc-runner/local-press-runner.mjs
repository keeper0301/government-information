// ============================================================
// 사장님 PC runner — Vercel ASN 차단 site fetch + keepioo upload
// ============================================================
// 사용:
//   1. %USERPROFILE%\keepioo-pc-runner\ 에 본 스크립트 + .env 설치
//   2. .env 에 PC_RUNNER_SECRET 설정
//   3. node local-press-runner.mjs 또는 Task Scheduler 매일 KST 09:30 가동
//
// 처리 site (ASN/SSL 차단 우회 대상):
//   - 남동구 (현재 /api/admin/local-press/upload 의 PC_RUNNER_CFGS 지원 대상)
//
// 작동:
//   1. 각 site 의 list URL fetch (한국 IP 정상 응답)
//   2. list 안 detail URL 추출 (사장님 PC 의 collector cfg 사용 — 다음 commit 에 추가)
//   3. detail URL fetch
//   4. POST keepioo.com/api/admin/local-press/upload (Bearer)
// ============================================================

import "dotenv/config";

const API_BASE = "https://www.keepioo.com";
const SECRET = process.env.PC_RUNNER_SECRET;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ASN 차단 site list — _registry 의 city_key 와 동일.
// site 추가는 같이 server endpoint 변경 필요 (다음 commit cfg export).
// 2026-05-26: seoul 제거 — news.seoul.go.kr RSS 으로 일반 cron 가동.
const ASN_BLOCKED_CITIES = [
  // 2026-06-02 — 남동구: prod 403 Vercel IP 차단 (cron 로그). 가정용 IP 로 우회.
  // 2026-07-19 — busan/gwangsan/jeju/pyeongtaek 은 일반 cron/GHA proxy 로 이관되어
  // upload endpoint 의 PC_RUNNER_CFGS 에서 제거됨. unsupported city 를 보내면 heartbeat 가
  // 안 남아 pending_external_actions 가 계속 뜨므로 지원 대상만 유지한다.
  { key: "namdong", listUrl: "https://www.namdong.go.kr/main/news/report.jsp" },
];

function isTlsChainError(error) {
  return /UNABLE_TO_VERIFY_LEAF_SIGNATURE|CERT_|SELF_SIGNED/.test(
    error?.cause?.code || "",
  );
}

async function fetchPageOnce(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "ko-KR" },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`fetch ${r.status}`);
  return r.text();
}

async function withTemporaryInsecureTls(fn) {
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
  }
}

async function fetchPage(url) {
  try {
    return await fetchPageOnce(url);
  } catch (error) {
    if (!isTlsChainError(error)) throw error;
    console.warn(`  TLS chain incomplete — retrying with verification relaxed for ${url}`);
    return await withTemporaryInsecureTls(() => fetchPageOnce(url));
  }
}

async function postUpload(items) {
  const r = await fetch(`${API_BASE}/api/admin/local-press/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items }),
  });
  if (!r.ok) throw new Error(`upload ${r.status}`);
  return r.json();
}

async function main() {
  if (!SECRET) {
    console.error("PC_RUNNER_SECRET 환경변수 미설정");
    process.exit(1);
  }
  console.log(`PC runner 시작 — ${ASN_BLOCKED_CITIES.length} site\n`);

  // ===== Round 1: list_html fetch + server parse =====
  console.log("[round 1] list_html upload + server parse");
  const round1Items = [];
  for (const city of ASN_BLOCKED_CITIES) {
    try {
      const listHtml = await fetchPage(city.listUrl);
      round1Items.push({ city_key: city.key, list_html: listHtml });
      console.log(`  ${city.key}: list ${listHtml.length} bytes ✅`);
    } catch (e) {
      console.error(`  ${city.key}: list fetch fail — ${e.message}`);
      round1Items.push({ city_key: city.key, list_html: "", fetch_error: e.message });
    }
  }
  const round1 = await postUpload(round1Items);
  console.log(`[round 1] server response: ${round1.results.length} cities\n`);

  // ===== Round 2: detail fetch + server insert =====
  console.log("[round 2] detail fetch + server insert");
  const round2Items = [];
  for (const r1 of round1.results) {
    const city = ASN_BLOCKED_CITIES.find((c) => c.key === r1.city_key);
    if (!city || !r1.items?.length) {
      console.log(`  ${r1.city_key}: skip (round1 ${r1.error || "no items"})`);
      continue;
    }
    const detailHtmls = {};
    for (const item of r1.items) {
      try {
        detailHtmls[item.seq] = await fetchPage(item.sourceUrl);
      } catch {
        // detail 1건 fail 은 best-effort
      }
    }
    // round1 의 list_html 재사용 (round2 server insert 에 필요)
    // 2026-05-26 review#4 fix: list_html 빈 string 인 fetch fail 케이스 명시 skip
    const round1Item = round1Items.find((i) => i.city_key === r1.city_key);
    if (!round1Item?.list_html) {
      console.log(`  ${r1.city_key}: skip (round1 fetch failed, empty list_html)`);
      continue;
    }
    round2Items.push({
      city_key: r1.city_key,
      list_html: round1Item.list_html,
      detail_htmls: detailHtmls,
    });
    console.log(`  ${r1.city_key}: list + detail ${Object.keys(detailHtmls).length}건`);
  }

  if (!round2Items.length) {
    console.log("  round2 대상 0건 — heartbeat audit 업로드");
    for (const item of round1Items) {
      round2Items.push({
        city_key: item.city_key,
        list_html: item.list_html || "",
        detail_htmls: {},
        runner_error: item.fetch_error || "round1 no items",
      });
    }
  }

  const round2 = { results: [] };
  for (const item of round2Items) {
    const partial = await postUpload([item]);
    round2.results.push(...(partial.results || []));
  }
  console.log(`\n[round 2] insert 결과:`);
  for (const r of round2.results) {
    console.log(`  ${r.city}: fetched ${r.fetched} / inserted ${r.inserted} / skipped ${r.skipped} / errors ${r.errors?.length || 0}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
