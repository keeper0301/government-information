// ============================================================
// 사장님 PC runner — Vercel ASN 차단 site fetch + keepioo upload
// ============================================================
// 사용:
//   1. C:\Users\cgc09\keepioo-pc-runner\ 에 본 스크립트 + .env 설치
//   2. .env 에 PC_RUNNER_SECRET 설정
//   3. node local-press-runner.mjs 또는 Task Scheduler 매일 KST 09:30 가동
//
// 처리 site (ASN/SSL 차단 우회 대상):
//   - 서울특별시 / 부산광역시 / 광산구 / 강원도 / 제주도 / 평택시
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
const ASN_BLOCKED_CITIES = [
  { key: "seoul", listUrl: "https://opengov.seoul.go.kr/press/list" },
  { key: "busan", listUrl: "https://www.busan.go.kr/nbtnewsBU" },
  { key: "gwangsan", listUrl: "https://www.gwangsan.go.kr/boardList.do?boardId=REPORT_NEW&pageId=www16" },
  { key: "gangwon", listUrl: "https://state.gwd.go.kr/portal/briefing/pressRelease" },
  { key: "jeju", listUrl: "https://www.jeju.go.kr/news/news/notice.htm" },
  { key: "pyeongtaek", listUrl: "https://www.pyeongtaek.go.kr/pyeongtaek/board/post/list.do?bcIdx=90&mid=0402010000" },
];

async function fetchPage(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "ko-KR" },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`fetch ${r.status}`);
  return r.text();
}

// detail URL 추출 — site 별 다름. 임시 — 모든 detail URL 을 list HTML 에서 정규식으로.
// 다음 commit 에서 _factory 의 parseListItems 사용으로 변경.
function extractDetailUrls(listHtml) {
  // 임시 placeholder — 실제 city 별 정확 추출은 다음 commit.
  const matches = listHtml.match(/href="[^"]*(?:view|detail|read)[^"]*"/g) || [];
  return matches.slice(0, 10);
}

async function processSite(city) {
  try {
    const listHtml = await fetchPage(city.listUrl);
    const detailUrls = extractDetailUrls(listHtml);
    const detailHtmls = {};
    for (const url of detailUrls) {
      try {
        detailHtmls[url] = await fetchPage(url);
      } catch (e) {
        // detail 1건 fail 은 무시 (PC runner 단 best-effort)
      }
    }
    return {
      city_key: city.key,
      list_html: listHtml,
      detail_htmls: detailHtmls,
    };
  } catch (e) {
    console.error(`${city.key} fetch fail:`, e.message);
    return { city_key: city.key, list_html: "", detail_htmls: {} };
  }
}

async function main() {
  if (!SECRET) {
    console.error("PC_RUNNER_SECRET 환경변수 미설정");
    process.exit(1);
  }
  console.log(`PC runner 시작 — ${ASN_BLOCKED_CITIES.length} site`);
  const items = [];
  for (const city of ASN_BLOCKED_CITIES) {
    const result = await processSite(city);
    items.push(result);
    console.log(`  ${city.key}: list ${result.list_html.length} bytes, detail ${Object.keys(result.detail_htmls).length}건`);
  }

  console.log("upload 중...");
  const r = await fetch(`${API_BASE}/api/admin/local-press/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items }),
  });
  const result = await r.json();
  console.log("upload 결과:", JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
