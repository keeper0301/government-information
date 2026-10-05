import { load } from "cheerio";
import { pathToFileURL } from "node:url";

export function analyzeReadinessHtml(html, now = new Date()) {
  const document = load(html);
  const main = document("main");
  const article = main.find("article");
  const reviewer = main.attr("data-editorial-reviewer");
  const reviewedAt = main.attr("data-editorial-reviewed-at");
  const robots = document('meta[name="robots"]').attr("content") ?? "";
  const sourceLinks = article.find("a[href]").toArray().filter(element => {
    try {
      const url = new URL(document(element).attr("href"));
      return url.protocol === "https:" && (url.hostname.endsWith(".go.kr") || url.hostname.endsWith(".gov.kr") || url.hostname === "gov.kr" || url.hostname === "ols.semas.or.kr")
        && url.pathname !== "/";
    } catch { return false; }
  });
  const issues = [];
  if (!reviewer?.trim() || !reviewedAt || !Number.isFinite(Date.parse(reviewedAt)) || Date.parse(reviewedAt) > now.getTime()) issues.push("사람 검수 기록 없음");
  if (sourceLinks.length === 0) issues.push("본문의 직접 공식 출처 없음");
  if (!/(^|[ ,])index([ ,]|$)/.test(robots) || /noindex/.test(robots)) issues.push("검색 제외 또는 검색 설정 미확인");
  if (!article.find('[data-guide-body="true"]').text().trim()) issues.push("공개된 검수 본문 없음");
  return { ready: issues.length === 0, issues, officialSourceCount: sourceLinks.length };
}

// 글 개수나 공통 문구의 길이가 아니라 실제 공개된 글의 검수 기록을 점검합니다.
export async function runReadinessAudit(baseUrl = "https://www.keepioo.com") {
  const origin = new URL(baseUrl).origin;
  const fetchPage = url => fetch(url, { signal: AbortSignal.timeout(20000) });
  const sitemap = await fetchPage(`${origin}/sitemap.xml`);
  if (!sitemap.ok) throw new Error(`사이트맵 응답 오류: ${sitemap.status}`);
  const xml = load(await sitemap.text(), { xmlMode: true });
  const urls = [...new Set(xml("loc").toArray().map(element => xml(element).text()).filter(value => {
    try { const url = new URL(value); return url.origin === origin && url.pathname.startsWith("/guides/"); }
    catch { return false; }
  }))];
  const results = [];
  for (let index = 0; index < urls.length; index += 4) {
    results.push(...await Promise.all(urls.slice(index, index + 4).map(async url => {
      try {
        const response = await fetchPage(url);
        const result = analyzeReadinessHtml(await response.text());
        if (response.status !== 200) result.issues.push(`응답 오류: ${response.status}`);
        if (/noindex/i.test(response.headers.get("x-robots-tag") ?? "")) result.issues.push("응답 헤더에서 검색 제외");
        return { url, ...result, ready: result.issues.length === 0 };
      } catch { return { url, ready: false, issues: ["페이지 조회 실패"] }; }
    })));
  }
  return {
    checkedAt: new Date().toISOString(), baseUrl: origin, submittedGuides: results.length,
    readyGuides: results.filter(result => result.ready).length,
    ready: results.length > 0 && results.every(result => result.ready), results,
    note: "기술 점검 결과입니다. 내용의 정확성이나 애드센스 승인을 보장하지 않습니다.",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await runReadinessAudit(process.argv[2]);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ready ? 0 : 1;
  } catch (error) { console.error("재심사 준비 점검 실패:", error.message); process.exitCode = 1; }
}
