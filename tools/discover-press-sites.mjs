// ============================================================
// 시·군·구 보도자료 site discovery (2026-05-24)
// ============================================================
// 목적: 226 자치구·시 site URL 패턴 일괄 검증 (정적 fetch 가능 + cms 인식)
// 출력: tools/discovery-results.jsonl (각 시 별 시도·결과)
// 사용: node tools/discover-press-sites.mjs [region]
//   region 옵션: jeonnam | gyeongnam | chungnam | etc. (없으면 전체)
//
// 핵심:
// - cms 패턴 7종 자동 시도 (selectBbsNttList, board.es, portal/bbs, etc.)
// - id 검출 (nttNo, nttId, list_no, idx, bIdx) 으로 cms 인식
// - size > 50000 + id 검출 시 ✅ 표시
// - 결과 jsonl 저장 — 다음 batch 작성 가이드
// ============================================================

import fs from "node:fs";
import path from "node:path";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 자치구·시 list (key: 한국어 이름 + slug + domain hint)
// 이미 가동 31개 제외. 남은 ~195개 우선 (광역시 자치구 + 큰 시 중심).
const SITES = [
  // 부산 16
  { region: "부산", name: "중구", slug: "jung-bs", host: "junggu.busan.kr" },
  { region: "부산", name: "서구", slug: "seo-bs", host: "seogu.busan.kr" },
  { region: "부산", name: "동구", slug: "dong-bs", host: "donggu.busan.kr" },
  { region: "부산", name: "영도구", slug: "yeongdo", host: "yeongdo.go.kr" },
  { region: "부산", name: "부산진구", slug: "busanjin", host: "busanjin.go.kr" },
  { region: "부산", name: "동래구", slug: "dongnae", host: "dongnae.go.kr" },
  { region: "부산", name: "남구", slug: "nam-bs", host: "bsnamgu.go.kr" },
  { region: "부산", name: "북구", slug: "buk-bs", host: "bsbukgu.go.kr" },
  { region: "부산", name: "해운대구", slug: "haeundae", host: "haeundae.go.kr" },
  { region: "부산", name: "사하구", slug: "saha", host: "saha.go.kr" },
  { region: "부산", name: "금정구", slug: "geumjeong", host: "geumjeong.go.kr" },
  { region: "부산", name: "강서구", slug: "gangseo-bs", host: "bsgangseo.go.kr" },
  { region: "부산", name: "연제구", slug: "yeonje", host: "yeonje.go.kr" },
  { region: "부산", name: "수영구", slug: "suyeong", host: "suyeong.go.kr" },
  { region: "부산", name: "사상구", slug: "sasang", host: "sasang.go.kr" },
  { region: "부산", name: "기장군", slug: "gijang", host: "gijang.go.kr" },
  // 대구 9
  { region: "대구", name: "중구", slug: "jung-dg", host: "jung.daegu.kr" },
  { region: "대구", name: "동구", slug: "dong-dg", host: "donggu.daegu.kr" },
  { region: "대구", name: "서구", slug: "seo-dg", host: "seogu.daegu.kr" },
  { region: "대구", name: "남구", slug: "nam-dg", host: "namgu.daegu.kr" },
  { region: "대구", name: "북구", slug: "buk-dg", host: "daegubuk.go.kr" },
  { region: "대구", name: "수성구", slug: "suseong", host: "suseong.daegu.kr" },
  { region: "대구", name: "달서구", slug: "dalseo", host: "dalseo.daegu.kr" },
  { region: "대구", name: "달성군", slug: "dalseong", host: "dalseong.daegu.kr" },
  // 인천 잔여 (부평·연수·서구·미추홀 이미 가동)
  { region: "인천", name: "중구", slug: "jung-ic", host: "icjg.go.kr" },
  { region: "인천", name: "동구", slug: "dong-ic", host: "icdonggu.go.kr" },
  { region: "인천", name: "남동구", slug: "namdong", host: "namdong.go.kr" },
  { region: "인천", name: "계양구", slug: "gyeyang", host: "gyeyang.go.kr" },
  { region: "인천", name: "강화군", slug: "ganghwa", host: "ganghwa.go.kr" },
  { region: "인천", name: "옹진군", slug: "ongjin", host: "ongjin.go.kr" },
  // 광주 잔여 (광산 이미 가동)
  { region: "광주", name: "동구", slug: "dong-gj", host: "donggu.gwangju.kr" },
  { region: "광주", name: "서구", slug: "seo-gj", host: "seogu.gwangju.kr" },
  { region: "광주", name: "남구", slug: "nam-gj", host: "namgu.gwangju.kr" },
  { region: "광주", name: "북구", slug: "buk-gj", host: "bukgu.gwangju.kr" },
  // 대전 5
  { region: "대전", name: "동구", slug: "dong-dj", host: "donggu.daejeon.kr" },
  { region: "대전", name: "중구", slug: "jung-dj", host: "djjunggu.go.kr" },
  { region: "대전", name: "서구", slug: "seo-dj", host: "seogu.daejeon.kr" },
  { region: "대전", name: "유성구", slug: "yuseong", host: "yuseong.go.kr" },
  { region: "대전", name: "대덕구", slug: "daedeok", host: "daedeok.go.kr" },
  // 울산 5
  { region: "울산", name: "중구", slug: "jung-us", host: "junggu.ulsan.kr" },
  { region: "울산", name: "남구", slug: "nam-us", host: "ulsannamgu.go.kr" },
  { region: "울산", name: "동구", slug: "dong-us", host: "donggu.ulsan.kr" },
  { region: "울산", name: "북구", slug: "buk-us", host: "bukgu.ulsan.kr" },
  { region: "울산", name: "울주군", slug: "ulju", host: "ulju.ulsan.kr" },
];

// cms 패턴 (정적 fetch 시도 path)
const CMS_PATTERNS = [
  "/main/selectBbsNttList.do?bbsNo=1",
  "/www/selectBbsNttList.do?bbsNo=1",
  "/board.es?mid=a11007000000&bid=0001",
  "/portal/bbs/B0000001/list.do?menuNo=200032",
  "/board/list.do?boardId=BBS_0000001",
  "/news/press",
  "/index.do?menuId=press",
];

// id 검출 패턴
const ID_PATTERNS = [
  { name: "nttNo", re: /nttNo=\d+/g },
  { name: "nttId", re: /nttId=\d+/g },
  { name: "list_no", re: /list_no=\d+/g },
  { name: "idx", re: /idx=\d+/g },
  { name: "bIdx", re: /bIdx=\d+/g },
  { name: "seq", re: /seq=\d+/g },
];

async function tryFetch(url) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    const html = await r.text();
    const ids = ID_PATTERNS.map((p) => {
      const m = html.match(p.re) || [];
      return { name: p.name, count: m.length, sample: m[0] };
    }).filter((x) => x.count > 0);
    return {
      status: r.status,
      size: html.length,
      ids,
      hasPressKeyword: html.includes("보도자료"),
    };
  } catch (e) {
    return { status: 0, size: 0, ids: [], error: e.message };
  }
}

async function discoverSite(site) {
  const results = [];
  for (const pattern of CMS_PATTERNS) {
    const url = `https://www.${site.host}${pattern}`;
    const r = await tryFetch(url);
    if (r.size > 30000 && r.ids.length > 0) {
      results.push({ pattern, url, ...r });
    }
  }
  return { ...site, candidates: results };
}

async function main() {
  const region = process.argv[2];
  const filtered = region
    ? SITES.filter((s) => s.region === region)
    : SITES;
  console.log(
    `discover ${filtered.length} sites${region ? ` (region=${region})` : ""}`,
  );

  const outPath = path.join("tools", "discovery-results.jsonl");
  const outStream = fs.createWriteStream(outPath, { flags: "w" });

  let okCount = 0;
  for (const site of filtered) {
    const result = await discoverSite(site);
    outStream.write(JSON.stringify(result) + "\n");
    if (result.candidates.length > 0) {
      okCount++;
      const top = result.candidates[0];
      console.log(
        `✅ ${site.region} ${site.name}`,
        top.pattern,
        `size=${top.size}`,
        `ids=${top.ids.map((x) => x.name).join(",")}`,
      );
    }
  }
  outStream.end();
  console.log(`\n총 ${filtered.length} site / 발견 ${okCount} site`);
  console.log(`결과: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
